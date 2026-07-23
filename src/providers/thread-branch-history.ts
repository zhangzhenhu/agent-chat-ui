import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBranchContext,
  getMessagesMetadataMap,
} from "@langchain/langgraph-sdk/ui";
import type { Client, Message, ThreadState } from "@langchain/langgraph-sdk";
import type { MessageMetadata } from "@langchain/langgraph-sdk/stream";
import {
  normalizeMessage,
  type AppMessage,
  type ProjectedState,
} from "./event-stream-v3-adapter.ts";

export type AppMessageMetadata = MessageMetadata & {
  branch?: string;
  branchOptions?: string[];
  firstSeenValues?: Record<string, unknown>;
};

export type ThreadBranchView = {
  values: ProjectedState;
  messages: AppMessage[];
  metadataByMessageId: ReadonlyMap<string, AppMessageMetadata>;
  isViewingHead: boolean;
  headCheckpointId?: string;
  displayedCheckpointId?: string;
};

function getMessages(values: Record<string, unknown>): Message[] {
  return Array.isArray(values.messages) ? (values.messages as Message[]) : [];
}

function getCheckpointId(
  state: ThreadState<Record<string, unknown>> | undefined,
): string | undefined {
  return state?.checkpoint?.checkpoint_id ?? undefined;
}

export function buildThreadBranchView({
  branch,
  history,
  liveValues,
}: {
  branch: string;
  history: ThreadState<Record<string, unknown>>[];
  liveValues: Record<string, unknown>;
}): ThreadBranchView {
  const headContext = getBranchContext("", history);
  const selectedContext = getBranchContext(branch, history);
  const headCheckpointId = getCheckpointId(headContext.threadHead);
  const displayedCheckpointId = getCheckpointId(selectedContext.threadHead);
  const isViewingHead =
    !displayedCheckpointId || displayedCheckpointId === headCheckpointId;
  const selectedValues = isViewingHead
    ? liveValues
    : (selectedContext.threadHead?.values ?? liveValues);
  const messages = getMessages(selectedValues).map(normalizeMessage);
  const metadata = getMessagesMetadataMap({
    initialValues: liveValues,
    history,
    getMessages,
    branchContext: {
      threadHead: selectedContext.threadHead,
      branchByCheckpoint: selectedContext.branchByCheckpoint,
    },
  });
  const metadataByMessageId = new Map<string, AppMessageMetadata>();

  for (const entry of metadata) {
    metadataByMessageId.set(entry.messageId, {
      parentCheckpointId:
        entry.firstSeenState?.parent_checkpoint?.checkpoint_id ?? undefined,
      branch: entry.branch,
      branchOptions: entry.branchOptions,
      firstSeenValues: entry.firstSeenState?.values,
    });
  }

  return {
    values: {
      ...selectedValues,
      messages,
      ui: Array.isArray(selectedValues.ui) ? selectedValues.ui : [],
    },
    messages,
    metadataByMessageId,
    isViewingHead,
    headCheckpointId,
    displayedCheckpointId,
  };
}

export function buildForkSubmitOptions(
  parentCheckpointId: string | undefined,
  config: Record<string, unknown> | undefined,
):
  | {
      config?: Record<string, unknown>;
      forkFrom: string;
    }
  | undefined {
  if (!parentCheckpointId) return undefined;
  return {
    ...(config ? { config } : {}),
    forkFrom: parentCheckpointId,
  };
}

export function useThreadBranchHistory({
  client,
  threadId,
  liveValues,
  liveMetadata,
  isLoading,
}: {
  client: Client<any>;
  threadId: string | null;
  liveValues: ProjectedState;
  liveMetadata(message: AppMessage): MessageMetadata | undefined;
  isLoading: boolean;
}) {
  const [history, setHistory] = useState<
    ThreadState<Record<string, unknown>>[]
  >([]);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let cancelled = false;
    setBranch("");

    if (!threadId) {
      setHistory([]);
      setError(undefined);
      return () => {
        cancelled = true;
      };
    }

    if (isLoading) {
      return () => {
        cancelled = true;
      };
    }

    void client.threads.getHistory(threadId, { limit: 100 }).then(
      (nextHistory) => {
        if (cancelled) return;
        setHistory(nextHistory);
        setError(undefined);
      },
      (nextError) => {
        if (cancelled) return;
        setError(nextError);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [client, isLoading, threadId]);

  const view = useMemo(
    () =>
      buildThreadBranchView({
        branch,
        history,
        liveValues,
      }),
    [branch, history, liveValues],
  );

  const getMessagesMetadata = useCallback(
    (message: AppMessage): AppMessageMetadata | undefined => {
      const historyMetadata = message.id
        ? view.metadataByMessageId.get(message.id)
        : undefined;
      const currentMetadata = liveMetadata(message);
      if (!historyMetadata && !currentMetadata) return undefined;
      return {
        ...historyMetadata,
        ...currentMetadata,
        parentCheckpointId:
          currentMetadata?.parentCheckpointId ??
          historyMetadata?.parentCheckpointId,
      };
    },
    [liveMetadata, view.metadataByMessageId],
  );

  return {
    ...view,
    error,
    getMessagesMetadata,
    setBranch,
  };
}
