"use client";

import type { ThinkingTraceCardEntry } from "./process-trace-helpers";

export const THINKING_TRACE_CACHE_STORAGE_KEY =
  "agent-chat-ui:thinking-trace-cache";

export type ThinkingTraceCacheByThreadId = Record<
  string,
  ThinkingTraceCardEntry[]
>;

function isThinkingTraceCardEntry(value: unknown): value is ThinkingTraceCardEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ThinkingTraceCardEntry>;
  return (
    typeof candidate.uiId === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.messageId === "string" &&
    !!candidate.snapshot &&
    typeof candidate.snapshot === "object"
  );
}

export function parseThinkingTraceCache(
  raw: string | null | undefined,
): ThinkingTraceCacheByThreadId {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const cache: ThinkingTraceCacheByThreadId = {};
    for (const [threadId, value] of Object.entries(parsed)) {
      if (typeof threadId !== "string" || !Array.isArray(value)) {
        continue;
      }
      const cards = value.filter(isThinkingTraceCardEntry);
      if (cards.length > 0) {
        cache[threadId] = cards;
      }
    }
    return cache;
  } catch {
    return {};
  }
}

export function readThinkingTraceCacheFromSessionStorage(): ThinkingTraceCacheByThreadId {
  if (typeof window === "undefined") {
    return {};
  }
  return parseThinkingTraceCache(
    window.sessionStorage.getItem(THINKING_TRACE_CACHE_STORAGE_KEY),
  );
}

export function writeThinkingTraceCacheToSessionStorage(
  cache: ThinkingTraceCacheByThreadId,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(
    THINKING_TRACE_CACHE_STORAGE_KEY,
    JSON.stringify(cache),
  );
}
