"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { AnalyticsEventEnvelope } from "../analytics-types";

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

function buildDetailLines(event: AnalyticsEventEnvelope): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ["type", event.type ?? ""],
    ["event_name", event.event_name ?? ""],
    ["event_scope", event.event_scope ?? ""],
    ["event_phase", event.event_phase ?? ""],
    ["emitted_at", event.emitted_at ?? ""],
    ["run_id", event.context?.run_id ?? ""],
    ["thread_id", event.context?.thread_id ?? ""],
    ["graph_id", event.context?.graph_id ?? ""],
    ["checkpoint_ns", event.context?.checkpoint_ns ?? ""],
    ["assistant_id", event.context?.assistant_id ?? ""],
    ["tool_call_id", event.context?.tool_call_id ?? ""],
    ["parent_tool_call_id", event.context?.parent_tool_call_id ?? ""],
    ["component", event.subject?.component_name ?? ""],
    ["agent", event.subject?.agent_name ?? ""],
    ["agent_role", event.subject?.agent_role ?? ""],
    ["domain", event.subject?.domain ?? ""],
    ["graph_scope", event.subject?.graph_scope ?? ""],
    ["scene", event.business?.scene ?? ""],
    ["request_kind", event.business?.request_kind ?? ""],
    ["input", JSON.stringify(event.input ?? {}, null, 2)],
    ["output", JSON.stringify(event.output ?? {}, null, 2)],
    ["state", JSON.stringify(event.state ?? {}, null, 2)],
    ["metrics", JSON.stringify(event.metrics ?? {}, null, 2)],
    ["error", JSON.stringify(event.error ?? null, null, 2)],
    ["state_context", JSON.stringify(event.state_context ?? {}, null, 2)],
    ["payload", JSON.stringify(event.payload ?? {}, null, 2)],
  ];
  return lines.filter(([, value]) => value.trim().length > 0);
}

function AnalyticsEventRow({
  event,
  defaultOpen = false,
}: {
  event: AnalyticsEventEnvelope;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const summary = useMemo(() => buildSummary(event), [event]);
  const details = useMemo(() => buildDetailLines(event), [event]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
          <div className="flex flex-col gap-3">
            {details.map(([label, value]) => (
              <div key={label} className="grid gap-1">
                <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  {label}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
                  {value}
                </pre>
              </div>
            ))}
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
          <span className="ml-1">Analytics</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle>Analytics Trace</DialogTitle>
          {runId ? (
            <div className="text-xs text-slate-500">Run: {runId}</div>
          ) : null}
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-6 py-4">
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
