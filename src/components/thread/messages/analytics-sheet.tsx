"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckIcon, ChevronDown, ChevronRight, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SyntaxHighlighter } from "@/components/thread/syntax-highlighter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { AnalyticsEventEnvelope } from "../analytics-types";
import { formatAnalyticsEventJson } from "./analytics-sheet-format";

type AnalyticsSheetProps = {
  events: AnalyticsEventEnvelope[];
  runId?: string | null;
};

function buildSummary(event: AnalyticsEventEnvelope): string {
  const eventName = event.event_name || "unknown_event";
  const phaseLabel =
    event.type === "telemetry"
      ? [event.event_scope, event.event_phase].filter(Boolean).join(".")
      : "";
  const componentName = event.subject?.component_name || event.subject?.agent_name || "";
  const status =
    typeof event.payload?.status === "string"
      ? event.payload.status
      : typeof event.output?.result_type === "string"
        ? event.output.result_type
        : "";
  return [phaseLabel || eventName, componentName, status].filter(Boolean).join(" · ");
}

function AnalyticsEventRow({
  event,
  defaultOpen = false,
}: {
  event: AnalyticsEventEnvelope;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const summary = useMemo(() => buildSummary(event), [event]);
  const formattedEvent = useMemo(() => formatAnalyticsEventJson(event), [event]);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(formattedEvent);
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
          <div className="text-sm font-medium text-slate-900">
            {summary || event.event_name || "analytics"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {event.emitted_at ?? ""}
          </div>
        </div>
        {open ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open ? (
        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#0b1020]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
                Event JSON
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={handleCopy}
              >
                {copied ? <CheckIcon className="size-3.5 text-emerald-400" /> : <CopyIcon className="size-3.5" />}
                <span>Copy JSON</span>
              </Button>
            </div>
            <div
              className="max-h-[60vh] select-text overflow-x-auto overflow-y-scroll overscroll-contain text-xs leading-6 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/70 [&::-webkit-scrollbar-track]:bg-slate-900/60"
              style={{ scrollbarGutter: "stable both-edges" }}
            >
              <SyntaxHighlighter
                language="js"
                className="text-xs"
                preTag="div"
                showLineNumbers
                wrapLongLines={false}
                customStyle={{
                  padding: "1rem 1rem 2rem",
                  overflow: "visible",
                }}
              >
                {formattedEvent}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AnalyticsSheet({ events, runId }: AnalyticsSheetProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500">
          <BarChart3 className="size-4" />
          <span className="ml-1">Telemetry</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="!flex h-[85vh] w-[min(96vw,1280px)] max-w-none min-w-[20rem] resize flex-col gap-0 overflow-y-scroll p-0 pr-2 sm:min-w-[48rem] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
        style={{ scrollbarGutter: "stable" }}
      >
        <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <DialogTitle>Telemetry Trace</DialogTitle>
          {runId ? (
            <div className="text-xs text-slate-500">Run: {runId}</div>
          ) : null}
        </DialogHeader>
        <div className="flex shrink-0 flex-col gap-3 px-6 py-4">
          {events.map((event, index) => (
            <AnalyticsEventRow
              key={`${event.event_name ?? "analytics"}-${event.emitted_at ?? index}-${index}`}
              event={event}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
