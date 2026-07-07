"use client";

import { useMemo, useState } from "react";
import { Activity, CheckIcon, ChevronDown, ChevronRight, CopyIcon } from "lucide-react";

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

function formatRuntimeEntryPayload(entry: InternalTraceEntry): string {
  if (entry.kind === "thinking") {
    return String(entry.payload ?? "");
  }
  try {
    return JSON.stringify(entry.payload ?? null, null, 2);
  } catch {
    return String(entry.payload ?? "");
  }
}

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
  const [copied, setCopied] = useState(false);
  const title = useMemo(() => {
    if (entry.kind === "tool_call") {
      return "Tool Call";
    }
    if (entry.kind === "tool_result") {
      return "Tool Result";
    }
    return "Thinking";
  }, [entry.kind]);
  const formattedPayload = useMemo(() => formatRuntimeEntryPayload(entry), [entry]);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(formattedPayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
          <div className="mb-3 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
              onClick={handleCopy}
            >
              {copied ? <CheckIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
              <span>Copy JSON</span>
            </Button>
          </div>
          <div
            className="max-h-[60vh] select-text overflow-x-auto overflow-y-scroll overscroll-contain [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
            style={{ scrollbarGutter: "stable both-edges" }}
          >
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
      <DialogContent
        className="!flex h-[85vh] w-[min(96vw,1280px)] max-w-none min-w-[20rem] resize flex-col gap-0 overflow-y-scroll p-0 pr-2 sm:min-w-[48rem] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
        style={{ scrollbarGutter: "stable" }}
      >
        <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <DialogTitle>Runtime Trace</DialogTitle>
          <div className="text-xs text-slate-500">
            {summary || "Captured intermediate runtime details"}
          </div>
        </DialogHeader>
        <div className="flex shrink-0 flex-col gap-3 px-6 py-4">
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
