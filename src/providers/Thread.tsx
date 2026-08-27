import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useState,
  useEffect,
  useRef,
  Dispatch,
  SetStateAction,
} from "react";
import { createClient } from "./client";
import { useRuntimeConfig } from "./runtime-config";
import {
  buildThreadDeleteErrorMessage,
  getThreadDeletionDisabledReason,
  summarizeThreadDeleteSettledResults,
} from "./thread-delete";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
  /** Rename a thread by storing a custom title in `metadata.user_title`. */
  renameThread: (threadId: string, title: string) => Promise<void>;
  /** Delete a thread by id. */
  deleteThread: (threadId: string) => Promise<void>;
  /** Delete multiple threads by id. */
  deleteThreads: (threadIds: string[]) => Promise<void>;
  threadDeletionDisabledReason: string | null;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

function getThreadSearchMetadata(
  assistantId: string,
): { graph_id: string } | { assistant_id: string } {
  if (validate(assistantId)) {
    return { assistant_id: assistantId };
  } else {
    return { graph_id: assistantId };
  }
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const runtime = useRuntimeConfig();
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envAuthScheme: string | undefined = process.env.NEXT_PUBLIC_AUTH_SCHEME;

  const [queryApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [queryAssistantId] = useQueryState("assistantId");
  const [queryAuthScheme] = useQueryState("authScheme", {
    defaultValue: envAuthScheme || "",
  });
  const apiUrl = runtime.isElectron ? runtime.apiUrl : queryApiUrl;
  const assistantId = runtime.isElectron
    ? runtime.assistantId
    : queryAssistantId;
  const authScheme = runtime.isElectron ? runtime.authScheme : queryAuthScheme;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const threadDeletionDisabledReason = getThreadDeletionDisabledReason(apiUrl);
  const previousEnvironmentRef = useRef(runtime.environmentId);
  useEffect(() => {
    if (previousEnvironmentRef.current !== runtime.environmentId) {
      setThreads([]);
      previousEnvironmentRef.current = runtime.environmentId;
    }
  }, [runtime.environmentId]);

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    const resolvedAssistantId = assistantId || envAssistantId;
    if (!apiUrl || !resolvedAssistantId) return [];
    const client = createClient(
      apiUrl,
      (runtime.isElectron ? runtime.apiKey : getApiKey()) ?? undefined,
      authScheme || undefined,
    );

    const threads = await client.threads.search({
      metadata: {
        ...getThreadSearchMetadata(resolvedAssistantId),
      },
      limit: 100,
    });

    return threads;
  }, [
    apiUrl,
    assistantId,
    authScheme,
    envAssistantId,
    runtime.apiKey,
    runtime.isElectron,
  ]);

  // Rename a thread by writing a custom title into `metadata.user_title`.
  // The LangGraph API *merges* metadata on PATCH, so this preserves the
  // `assistant_id`/`graph_id` keys that the thread list filters on.
  // We optimistically patch local state and roll back on error. We do NOT
  // refetch: rename neither creates nor destroys a thread, and a concurrent
  // refetch (e.g. from StreamSession.onThreadId after a new message) could
  // race the merge and momentarily drop the new title.
  const renameThread = useCallback(
    async (threadId: string, title: string): Promise<void> => {
      const resolvedAssistantId = assistantId || envAssistantId;
      if (!apiUrl || !resolvedAssistantId) return;
      const client = createClient(
        apiUrl,
        (runtime.isElectron ? runtime.apiKey : getApiKey()) ?? undefined,
        authScheme || undefined,
      );

      const snapshot = threads;
      setThreads((prev) =>
        prev.map((t) =>
          t.thread_id === threadId
            ? { ...t, metadata: { ...t.metadata, user_title: title } }
            : t,
        ),
      );
      try {
        await client.threads.update(threadId, {
          metadata: { user_title: title },
        });
      } catch (err) {
        setThreads(snapshot);
        throw err;
      }
    },
    [
      apiUrl,
      assistantId,
      authScheme,
      envAssistantId,
      runtime.apiKey,
      runtime.isElectron,
      threads,
      setThreads,
    ],
  );

  // Delete a thread by id. Optimistically remove it from local state and
  // roll back on error. The caller is responsible for clearing the active
  // `threadId` query param if the deleted thread was selected.
  const deleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      const resolvedAssistantId = assistantId || envAssistantId;
      if (!apiUrl || !resolvedAssistantId) return;
      if (threadDeletionDisabledReason) {
        throw new Error(threadDeletionDisabledReason);
      }
      const client = createClient(
        apiUrl,
        (runtime.isElectron ? runtime.apiKey : getApiKey()) ?? undefined,
        authScheme || undefined,
      );

      const snapshot = threads;
      setThreads((prev) => prev.filter((t) => t.thread_id !== threadId));
      try {
        await client.threads.delete(threadId);
      } catch (err) {
        setThreads(snapshot);
        throw err;
      }
    },
    [
      apiUrl,
      assistantId,
      authScheme,
      envAssistantId,
      threadDeletionDisabledReason,
      runtime.apiKey,
      runtime.isElectron,
      threads,
      setThreads,
    ],
  );

  const deleteThreads = useCallback(
    async (threadIds: string[]): Promise<void> => {
      const uniqueIds = Array.from(new Set(threadIds)).filter(Boolean);
      if (uniqueIds.length === 0) return;

      const resolvedAssistantId = assistantId || envAssistantId;
      if (!apiUrl || !resolvedAssistantId) return;
      if (threadDeletionDisabledReason) {
        throw new Error(threadDeletionDisabledReason);
      }

      const client = createClient(
        apiUrl,
        (runtime.isElectron ? runtime.apiKey : getApiKey()) ?? undefined,
        authScheme || undefined,
      );

      const snapshot = threads;
      setThreads((prev) =>
        prev.filter((t) => !uniqueIds.includes(t.thread_id)),
      );

      const results = await Promise.allSettled(
        uniqueIds.map((id) => client.threads.delete(id)),
      );
      const { failedIds } = summarizeThreadDeleteSettledResults(
        uniqueIds,
        results,
      );

      if (failedIds.length > 0) {
        try {
          const refreshedThreads = await getThreads();
          setThreads(refreshedThreads);
        } catch {
          setThreads(snapshot);
        }
        throw new Error(
          buildThreadDeleteErrorMessage(uniqueIds.length, failedIds.length),
        );
      }
    },
    [
      apiUrl,
      assistantId,
      authScheme,
      envAssistantId,
      getThreads,
      threadDeletionDisabledReason,
      runtime.apiKey,
      runtime.isElectron,
      threads,
      setThreads,
    ],
  );

  const value = {
    getThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
    renameThread,
    deleteThread,
    deleteThreads,
    threadDeletionDisabledReason,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
