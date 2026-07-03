"use client";

import { useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { InternalTraceEntry } from "../process-trace";
import { Thinking } from "./thinking";
import { ToolCalls, ToolResult } from "./tool-calls";

function buildRuntimeTraceSummary(entries: InternalTraceEntry[]): string {
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

function RuntimeTraceRow({
  entry,
  defaultOpen = false,
}: {
  entry: InternalTraceEntry;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const title = useMemo(() => {
    if (entry.kind === "tool_call") {
      return "Tool Call";
    }
    if (entry.kind === "tool_result") {
      return "Tool Result";
    }
    return "Thinking";
  }, [entry.kind]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{entry.key}</div>
        </div>
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open ? (
        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          {entry.kind === "thinking" ? (
            <Thinking
              content={String(entry.payload ?? "")}
              isStreaming={entry.isStreaming}
            />
          ) : null}
          {entry.kind === "tool_call" ? (
            <ToolCalls toolCalls={entry.payload as never} />
          ) : null}
          {entry.kind === "tool_result" ? (
            <ToolResult message={entry.payload as never} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RuntimeTraceSheet({
  entries,
}: {
  entries: InternalTraceEntry[];
}) {
  const summary = useMemo(() => buildRuntimeTraceSummary(entries), [entries]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500">
          <Activity className="size-4" />
          <span className="ml-1">Runtime Trace</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle>Runtime Trace</DialogTitle>
          <div className="text-xs text-slate-500">
            {summary || "Captured intermediate runtime details"}
          </div>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-6 py-4">
          {entries.map((entry, index) => (
            <RuntimeTraceRow
              key={entry.key}
              entry={entry}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
