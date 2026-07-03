"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";

import { Thinking } from "./messages/thinking";
import { ToolCalls, ToolResult } from "./messages/tool-calls";
import { GenericInterruptView } from "./messages/generic-interrupt";
import { FoodConstraintsInterrupt } from "./messages/hitl-constraints";

export type InternalTraceEntry = {
  key: string;
  kind: "thinking" | "tool_call" | "tool_result";
  payload: unknown;
  isStreaming: boolean;
};

type ProcessTraceCardProps = {
  entries: InternalTraceEntry[];
  isLoading: boolean;
};

type PendingInterruptCardProps = {
  interrupt: unknown;
};

function normalizeInterruptValue(
  interrupt: unknown,
): Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(interrupt)) {
    return interrupt as Record<string, unknown>[];
  }

  return (((interrupt as { value?: unknown } | undefined)?.value ?? interrupt) ??
    {}) as Record<string, unknown>;
}

function renderInterrupt(interrupt: unknown) {
  const value = normalizeInterruptValue(interrupt);
  const isFoodInterrupt =
    !!value &&
    !Array.isArray(value) &&
    value.kind === "food_constraints" &&
    Array.isArray(value.options);

  if (isFoodInterrupt) {
    return <FoodConstraintsInterrupt interrupt={value} />;
  }

  return <GenericInterruptView interrupt={value} />;
}

function buildInternalTraceSummary(entries: InternalTraceEntry[]): string {
  const counts = {
    thinking: 0,
    tool_call: 0,
    tool_result: 0,
  };

  for (const entry of entries) {
    counts[entry.kind] += 1;
  }

  return [
    counts.thinking > 0 ? `${counts.thinking} thinking` : null,
    counts.tool_call > 0 ? `${counts.tool_call} tool call` : null,
    counts.tool_result > 0 ? `${counts.tool_result} tool result` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProcessTraceCard({
  entries,
  isLoading,
}: ProcessTraceCardProps) {
  const hasEntries = entries.length > 0;
  const [isOpen, setIsOpen] = useState(isLoading && hasEntries);
  const userControlledRef = useRef(false);
  const summary = useMemo(() => buildInternalTraceSummary(entries), [entries]);

  // 过程卡在运行中默认展开，结束后自动折叠；
  // 用户如果手动展开/折叠，则以用户操作为准。
  useEffect(() => {
    if (!hasEntries) {
      setIsOpen(false);
      userControlledRef.current = false;
      return;
    }

    if (isLoading) {
      if (!userControlledRef.current) {
        setIsOpen(true);
      }
      return;
    }

    if (userControlledRef.current) {
      return;
    }

    const timer = setTimeout(() => setIsOpen(false), 800);
    return () => clearTimeout(timer);
  }, [hasEntries, isLoading]);

  if (!hasEntries) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/80 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => {
            userControlledRef.current = true;
            setIsOpen((value) => !value);
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-full border border-slate-200 bg-white p-2 text-slate-600">
              <Activity className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Runtime Trace
              </div>
              <div className="truncate text-sm text-slate-700">
                {summary || "Captured intermediate runtime details"}
              </div>
            </div>
          </div>
          {isOpen ? (
            <ChevronUp className="size-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-slate-500" />
          )}
        </button>

        {isOpen ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4">
            {entries.map((entry) => {
              if (entry.kind === "thinking") {
                return (
                  <Thinking
                    key={entry.key}
                    content={String(entry.payload ?? "")}
                    isStreaming={entry.isStreaming}
                  />
                );
              }

              if (entry.kind === "tool_call") {
                return (
                  <ToolCalls
                    key={entry.key}
                    toolCalls={entry.payload as AIMessage["tool_calls"]}
                  />
                );
              }

              if (entry.kind === "tool_result") {
                return (
                  <ToolResult
                    key={entry.key}
                    message={entry.payload as ToolMessage}
                  />
                );
              }

              return null;
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PendingInterruptCard({ interrupt }: PendingInterruptCardProps) {
  if (!interrupt) {
    return null;
  }

  return <div className="mx-auto w-full max-w-3xl">{renderInterrupt(interrupt)}</div>;
}
