"use client";

import type { AIMessage, Message } from "@langchain/langgraph-sdk";

import type { InternalTraceEntry } from "./process-trace";
import type { ThinkingTraceSnapshot } from "./analytics-types";

export type TranscriptBlock =
  | { kind: "human"; message: Message }
  | { kind: "assistant"; message: Message };

export type ThinkingTraceResolution = {
  snapshot: ThinkingTraceSnapshot | null;
  runId: string;
};

function stableToolCallKey(
  messageId: string,
  toolCalls: AIMessage["tool_calls"],
): string {
  const ids = (toolCalls ?? []).map(
    (toolCall: NonNullable<AIMessage["tool_calls"]>[number]) =>
      `${toolCall?.id ?? ""}:${toolCall?.name ?? ""}`,
  );
  return `tool_call:${messageId}:${ids.join("|")}`;
}

export function getInternalTraceEntries(
  messages: Message[],
  isLoading: boolean,
): InternalTraceEntry[] {
  const entries: InternalTraceEntry[] = [];

  // 这里继续保留研发态过程卡：
  // - tool call
  // - tool result
  // 正式 thinking UI 已迁移到 `thinking_trace`，不再从 message 历史派生。
  for (const message of messages) {
    if (message.type === "ai" && message.id) {
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        entries.push({
          key: stableToolCallKey(message.id, message.tool_calls),
          kind: "tool_call",
          payload: message.tool_calls,
          isStreaming: isLoading,
        });
      }
      continue;
    }

    if (message.type === "tool" && message.id) {
      entries.push({
        key: `tool_result:${message.id}`,
        kind: "tool_result",
        payload: message,
        isStreaming: isLoading,
      });
    }
  }

  return entries;
}

export function getThinkingTraceSnapshot(
  ui: Array<{ type?: string; name?: string; props?: unknown }> | undefined,
): ThinkingTraceSnapshot | null {
  return resolveThinkingTrace(ui).snapshot;
}

export function resolveThinkingTrace(
  ui:
    | Array<{
        type?: string;
        name?: string;
        id?: string;
        props?: unknown;
        metadata?: { run_id?: unknown };
      }>
    | undefined,
): ThinkingTraceResolution {
  for (let index = (ui?.length ?? 0) - 1; index >= 0; index -= 1) {
    const item = ui?.[index];
    if (item?.type !== "ui" || item?.name !== "thinking_trace") {
      continue;
    }
    if (!item.props || typeof item.props !== "object") {
      continue;
    }

    const metadataRunId =
      typeof item.metadata?.run_id === "string" ? item.metadata.run_id : "";
    const thinkingId = typeof item.id === "string" ? item.id : "";
    const runId = metadataRunId
      ? metadataRunId
      : thinkingId.startsWith("thinking:")
        ? thinkingId.slice("thinking:".length)
        : "";

    return {
      snapshot: item.props as ThinkingTraceSnapshot,
      runId,
    };
  }

  return {
    snapshot: null,
    runId: "",
  };
}

export function buildTranscriptBlocks(args: {
  messages: Message[];
}): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];

  for (const message of args.messages) {
    if (message.type === "human") {
      blocks.push({ kind: "human", message });
      continue;
    }
    if (message.type === "ai") {
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        continue;
      }
      blocks.push({ kind: "assistant", message });
    }
  }

  return blocks;
}

export function splitTranscriptBlocksForThinking(
  blocks: TranscriptBlock[],
): {
  beforeThinking: TranscriptBlock[];
  afterThinking: TranscriptBlock[];
} {
  let lastHumanIndex = -1;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index]?.kind === "human") {
      lastHumanIndex = index;
      break;
    }
  }

  if (lastHumanIndex === -1) {
    return {
      beforeThinking: [],
      afterThinking: blocks,
    };
  }

  return {
    beforeThinking: blocks.slice(0, lastHumanIndex + 1),
    afterThinking: blocks.slice(lastHumanIndex + 1),
  };
}
