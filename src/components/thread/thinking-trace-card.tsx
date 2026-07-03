"use client";

import { Brain, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  ThinkingTraceSnapshot,
  ThinkingTraceStep,
} from "./analytics-types";
import type {
  ThinkingRunBucket,
} from "./thinking-state";
import {
  buildRenderedThinkingGroups,
  buildVisibleThinkingSteps,
} from "./thinking-trace-view-model";
import { getThinkingStatusLabel } from "./thinking-trace-labels";
import { AnalyticsSheet } from "./messages/analytics-sheet";
import { RuntimeTraceSheet } from "./messages/runtime-trace-sheet";
import type { AnalyticsEventEnvelope } from "./analytics-types";
import type { InternalTraceEntry } from "./process-trace";

type ThinkingTraceCardProps = {
  snapshot: ThinkingTraceSnapshot;
  runBucket?: ThinkingRunBucket | null;
  isLoading: boolean;
  analyticsEvents?: AnalyticsEventEnvelope[];
  analyticsRunId?: string | null;
  runtimeTraceEntries?: InternalTraceEntry[];
};

function statusIcon(status: ThinkingTraceStep["status"]) {
  if (status === "active") {
    return <Loader2 className="size-4 animate-spin text-emerald-600" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="size-4 text-emerald-600" />;
  }
  if (status === "waiting_user") {
    return <Circle className="size-4 text-amber-500" />;
  }
  if (status === "failed") {
    return <XCircle className="size-4 text-red-600" />;
  }
  return <Circle className="size-4 text-slate-300" />;
}

export function ThinkingTraceCard({
  snapshot,
  runBucket,
  isLoading,
  analyticsEvents = [],
  analyticsRunId,
  runtimeTraceEntries = [],
}: ThinkingTraceCardProps) {
  const steps = buildVisibleThinkingSteps(
    Array.isArray(snapshot.steps) ? snapshot.steps : [],
    runBucket ?? undefined,
  );

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-emerald-50/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-emerald-200/80 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-full border border-emerald-200 bg-white p-2 text-emerald-600">
            <Brain className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-[0.12em] text-emerald-700 uppercase">
              Thinking Trace
            </div>
            <div className="text-sm text-emerald-950">
              {isLoading ? "实时思考过程" : "本轮思考过程"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {runtimeTraceEntries.length > 0 ? (
            <RuntimeTraceSheet entries={runtimeTraceEntries} />
          ) : null}
          {analyticsEvents.length > 0 ? (
            <AnalyticsSheet
              events={analyticsEvents}
              runId={analyticsRunId}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        {steps.map((step) => {
          const phaseBucket = runBucket?.phases[step.id];
          const renderedGroups = buildRenderedThinkingGroups(step, phaseBucket);

          return (
            <div key={step.id} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
              <div className="flex items-center gap-3">
                {statusIcon(step.status)}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{step.title}</div>
                </div>
                <div
                  className={cn(
                    "rounded-full px-2 py-1 text-[11px] font-medium",
                    step.status === "active" && "bg-emerald-100 text-emerald-800",
                    step.status === "completed" && "bg-slate-100 text-slate-700",
                    step.status === "waiting_user" && "bg-amber-100 text-amber-800",
                    step.status === "failed" && "bg-red-100 text-red-800",
                    step.status === "pending" && "bg-slate-100 text-slate-500",
                  )}
                >
                  {getThinkingStatusLabel(step.status)}
                </div>
              </div>

              {Array.isArray(step.details) && step.details.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {step.details.map((detail, index) => (
                    <div
                      key={`${step.id}-${index}`}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-xs leading-relaxed",
                        detail.kind === "reasoning"
                          ? "border-emerald-100 bg-emerald-50/70 font-mono text-slate-700"
                          : "border-slate-100 bg-slate-50 text-slate-600",
                      )}
                    >
                      {detail.text ?? ""}
                    </div>
                  ))}
                </div>
              ) : null}

              {renderedGroups.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3">
                  {renderedGroups.map((group) => (
                    <div
                      key={`${step.id}-${group.groupId}`}
                      className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3"
                    >
                      <div className="text-[11px] font-semibold tracking-[0.08em] text-emerald-700 uppercase">
                        {group.agentRole} · {group.agentName}
                      </div>
                      <div className="mt-2 flex flex-col gap-2">
                        {group.items.map((item, index) => (
                          <div
                            key={`${group.groupId}-${index}`}
                            className="rounded-lg border border-white/70 bg-white/90 px-3 py-2 font-mono text-xs leading-relaxed text-slate-700"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
