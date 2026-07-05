import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey } from "@/lib/api-key";
import { createClient } from "@/providers/client";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import { getVisibleAssistants } from "@/lib/assistant-options";
import {
  appendAnalyticsEvent,
  EMPTY_ANALYTICS_STATE,
  isAnalyticsStreamEvent,
  type AnalyticsState,
} from "@/components/thread/analytics-state";
import type {
  AnalyticsEventEnvelope,
  ThinkingEventEnvelope,
} from "@/components/thread/analytics-types";
import {
  appendThinkingEvent,
  EMPTY_THINKING_STATE,
  type ThinkingState,
} from "@/components/thread/thinking-state";
import {
  composeStreamContextValue,
  isRootStreamNamespace,
  shouldAcceptThinkingNamespace,
} from "./stream-context-value";

export type StateType = { messages: Message[]; ui?: UIMessage[] };
export type StreamCustomEvent =
  | UIMessage
  | RemoveUIMessage
  | AnalyticsEventEnvelope
  | ThinkingEventEnvelope;

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType: StreamCustomEvent;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream> & {
  analyticsState: AnalyticsState;
  thinkingState: ThinkingState;
};
const StreamContext = createContext<StreamContextType | undefined>(undefined);

/**
 * ConfigContext provides deployment configuration (URL, API key, assistant ID, etc.)
 * to any component in the tree, avoiding prop drilling.
 *
 * Added because:
 * - The AssistantSelector needs to read/write assistantId and apiUrl
 * - The settings button needs to trigger showConfig to return to the form
 * - The custom params panel needs to know the current apiUrl for schema fetching
 */
type ConfigContextType = {
  apiUrl: string;
  setApiUrl: (url: string) => void;
  assistantId: string;
  setAssistantId: (id: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  authScheme: string;
  setAuthScheme: (scheme: string) => void;
  showConfig: boolean;
  setShowConfig: (show: boolean) => void;
};
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  authScheme?: string,
): Promise<boolean> {
  try {
    const headers = new Headers();
    if (apiKey) headers.set("X-Api-Key", apiKey);
    if (authScheme) headers.set("X-Auth-Scheme", authScheme);

    const res = await fetch(`${apiUrl}/info`, {
      headers,
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  authScheme,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  authScheme?: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();
  const [analyticsState, setAnalyticsState] = useState<AnalyticsState>(
    EMPTY_ANALYTICS_STATE,
  );
  const [thinkingState, setThinkingState] = useState<ThinkingState>(
    EMPTY_THINKING_STATE,
  );
  const streamValue = useTypedStream(({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    ...(authScheme && {
      defaultHeaders: {
        "X-Auth-Scheme": authScheme,
      },
    }),
    threadId: threadId ?? null,
    fetchStateHistory: true,
    filterSubagentMessages: true,
    onCustomEvent: (
      event: StreamCustomEvent,
      options: {
        namespace: string[] | undefined;
        mutate: (
          update:
            | Partial<StateType>
            | ((prev: StateType) => Partial<StateType>),
        ) => void;
      },
    ) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        if (!isRootStreamNamespace(options.namespace)) {
          return;
        }
        options.mutate((prev: StateType) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
        return;
      }

      if (isAnalyticsStreamEvent(event)) {
        if (!isRootStreamNamespace(options.namespace)) {
          return;
        }
        setAnalyticsState((prev) =>
          appendAnalyticsEvent(prev, event as AnalyticsEventEnvelope),
        );
        return;
      }

      if (
        event &&
        typeof event === "object" &&
        (event.kind === "thinking" || event.type === "thinking")
      ) {
        const eventName = (event as { event_name?: string }).event_name ?? "";
        // thinking.entry_added 是后台实时更新机制（如“正在调用 xxx 能力/工具”），
        // 不管 root 还是 child 都要收，用于实时刷新思考卡。
        // 其他 thinking 事件（reasoning_delta/phase_started/completed）按“只收 root”
        // 规则过滤 child——避免把 child specialist 的原始思考流暴露给用户主卡。
        const isAlwaysAccept = eventName === "thinking.entry_added";
        if (!isAlwaysAccept && !shouldAcceptThinkingNamespace(options.namespace)) {
          return;
        }
        setThinkingState((prev) =>
          appendThinkingEvent(prev, event as ThinkingEventEnvelope),
        );
      }
    },
    onThreadId: (id: string) => {
      setThreadId(id);
      // Refetch threads list when thread ID changes.
      // Wait for some seconds before fetching so we're able to get the new thread that was created.
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
  } as unknown) as Parameters<typeof useTypedStream>[0] & {
    filterSubagentMessages?: boolean;
  });

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey, authScheme).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl, authScheme]);

  useEffect(() => {
    setAnalyticsState(EMPTY_ANALYTICS_STATE);
    setThinkingState(EMPTY_THINKING_STATE);
  }, [threadId, assistantId, apiUrl]);

  const contextValue = composeStreamContextValue(streamValue, {
    analyticsState,
    thinkingState,
  });

  return (
    <StreamContext.Provider value={contextValue}>
      {children}
    </StreamContext.Provider>
  );
};

/**
 * Gate component that ensures an assistant ID is selected before rendering
 * the chat UI via StreamSession.
 *
 * Why this exists:
 * Previously, users had to manually type an assistant/graph ID in the form.
 * This is a terrible UX — assistant IDs are UUIDs assigned by the server,
 * users can't remember them, and typing them each time is error-prone.
 *
 * This component auto-fetches the assistant list from the server and selects
 * the first one. Users can then switch via the dropdown in the chat header.
 *
 * Three states:
 * 1. loading → spinner while fetching assistants
 * 2. error   → error message with a "go back" button to return to the form
 * 3. ready   → renders StreamSession with the selected assistantId
 */
function AssistantGate({
  children,
  apiKey,
  apiUrl,
  assistantId,
  setAssistantId,
  authScheme,
}: {
  children: ReactNode;
  apiKey: string;
  apiUrl: string;
  assistantId: string | undefined;
  setAssistantId: (id: string) => void;
  authScheme: string;
}) {
  const [loading, setLoading] = useState(!assistantId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assistantId) {
      setLoading(false);
      return;
    }
    if (!apiUrl) return;

    setLoading(true);
    setError(null);
    const client = createClient(apiUrl, apiKey || undefined, authScheme || undefined);
    client.assistants
      .search({ limit: 100 })
      .then((result) => {
        const list = getVisibleAssistants(result);
        if (list.length > 0) {
          setAssistantId(list[0].assistant_id);
        } else {
          setError("No assistants found on this server. Please create one first.");
        }
      })
      .catch((err) => {
        console.error("Failed to fetch assistants:", err);
        setError("Failed to fetch assistants. Check your deployment URL.");
      })
      .finally(() => setLoading(false));
  }, [apiUrl, apiKey, authScheme, assistantId, setAssistantId]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-blue-500" />
          <p className="text-muted-foreground">Fetching assistants...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-red-500">{error}</p>
          <Button variant="outline" onClick={() => setAssistantId("")}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!assistantId) return null;

  return (
    <StreamSession
      apiKey={apiKey}
      apiUrl={apiUrl}
      assistantId={assistantId}
      authScheme={authScheme || undefined}
    >
      {children}
    </StreamSession>
  );
}

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const AGENT_BUILDER_AUTH_SCHEME = "langsmith-api-key";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envAuthScheme: string | undefined = process.env.NEXT_PUBLIC_AUTH_SCHEME;

  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });
  const [authScheme, setAuthScheme] = useQueryState("authScheme", {
    defaultValue: envAuthScheme || "",
  });

  /**
   * showConfig flag: when "true", the deployment URL form is shown even if
   * apiUrl is already set. This allows users to change their deployment URL
   * without clearing query params manually.
   *
   * Triggered by the Settings button in the chat header.
   */
  const [showConfig, setShowConfig] = useQueryState("showConfig", {
    defaultValue: "",
  });
  const [isAgentBuilder, setIsAgentBuilder] = useState(
    () =>
      (authScheme || envAuthScheme || "").toLowerCase() ===
      AGENT_BUILDER_AUTH_SCHEME,
  );

  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  const finalApiUrl = apiUrl || envApiUrl;
  const finalAssistantId = assistantId || envAssistantId;
  const finalAuthScheme = authScheme || envAuthScheme || "";

  /**
   * Show the form when:
   * - No API URL is configured, OR
   * - User explicitly clicked the Settings button (showConfig === "true")
   *
   * assistantId is no longer required in the form — it's auto-selected
   * from the server by AssistantGate after entering the URL.
   */
  const showConfigForm = showConfig === "true" || !finalApiUrl;
  const isConfigOverlay = showConfig === "true" && !!finalApiUrl;

  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  if (showConfigForm) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <LangGraphLogoSVG className="h-7" />
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              {isConfigOverlay
                ? "Update your deployment configuration below."
                : "Welcome to Agent Chat! Enter your LangGraph deployment URL to get started."}
            </p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setFormError(null);

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const newApiUrl = formData.get("apiUrl") as string;
              const newApiKey = formData.get("apiKey") as string;
              const newAuthScheme = isAgentBuilder ? AGENT_BUILDER_AUTH_SCHEME : "";

              /**
               * Before entering the chat, verify the deployment:
               * 1. Check if the URL is reachable (via /info endpoint)
               * 2. Check if there are assistants available
               *
               * This prevents users from entering a broken state where
               * the chat UI loads but can't connect to anything.
               */
              setFormLoading(true);
              try {
                // Step 1: Check if the deployment URL is reachable
                const ok = await checkGraphStatus(newApiUrl, newApiKey || null, newAuthScheme);
                if (!ok) {
                  setFormError(`Cannot connect to ${newApiUrl}. Please check the URL and API key.`);
                  setFormLoading(false);
                  return;
                }

                // Step 2: Check if there are assistants available
                const client = createClient(newApiUrl, newApiKey || undefined, newAuthScheme || undefined);
                const assistants = await client.assistants.search({ limit: 1 });
                const list = getVisibleAssistants(assistants);
                if (list.length === 0) {
                  setFormError("No assistants found on this server. Please create one first.");
                  setFormLoading(false);
                  return;
                }

                // All good, proceed
                setApiUrl(newApiUrl);
                setApiKey(newApiKey);
                setAuthScheme(newAuthScheme);
                setShowConfig("");

                form.reset();
              } catch (err) {
                setFormError(`Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
              } finally {
                setFormLoading(false);
              }
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {formError}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            {/* Assistant/Graph ID field removed.
                Assistant ID is now auto-fetched from the server after entering
                the URL, and users can switch via the dropdown in the chat header.
                This avoids the poor UX of asking users to type UUIDs. */}

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
              <PasswordInput
                id="apiKey"
                name="apiKey"
                defaultValue={apiKey ?? ""}
                className="bg-background"
                placeholder="lsv2_pt_..."
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="agentBuilderEnabled">
                    Built with Agent Builder
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Enable this for Agent Builder deployments.
                  </p>
                </div>
                <Switch
                  id="agentBuilderEnabled"
                  checked={isAgentBuilder}
                  onCheckedChange={setIsAgentBuilder}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              {isConfigOverlay && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setShowConfig("")}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" size="lg" disabled={formLoading}>
                {formLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying...
                  </>
                ) : isConfigOverlay ? (
                  <>
                    Update
                    <ArrowRight className="size-5" />
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const configContextValue: ConfigContextType = {
    apiUrl: apiUrl || "",
    setApiUrl,
    assistantId: assistantId || "",
    setAssistantId,
    apiKey,
    setApiKey,
    authScheme: authScheme || "",
    setAuthScheme,
    showConfig: showConfig === "true",
    setShowConfig: (show: boolean) => setShowConfig(show ? "true" : ""),
  };

  return (
    <ConfigContext.Provider value={configContextValue}>
      <AssistantGate
        apiKey={apiKey}
        apiUrl={finalApiUrl}
        assistantId={finalAssistantId}
        setAssistantId={setAssistantId}
        authScheme={finalAuthScheme}
      >
        {children}
      </AssistantGate>
    </ConfigContext.Provider>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export const useConfigContext = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfigContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
