"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  ThinkingTraceSnapshot,
  ThinkingTraceStep,
} from "./analytics-types";
import type {
  ThinkingRunBucket,
  ThinkingPhaseBucket,
} from "./thinking-state";
import {
  buildRenderedFacts,
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

// 每个阶段 step 是独立可折叠的。抽成子组件，让每个 step 持有自己的展开 state。
// 跟 runtime-trace-sheet / analytics-sheet 的 Row 模式一致：useState(defaultOpen) +
// <button> header + ChevronDown/Right 切换 + {open?body:null}（无动画）。
function ThinkingTraceStepItem({
  step,
  phaseBucket,
}: {
  step: ThinkingTraceStep;
  phaseBucket?: ThinkingPhaseBucket;
}) {
  const [stepOpen, setStepOpen] = useState(true);
  const renderedGroups = buildRenderedThinkingGroups(step, phaseBucket);
  const facts = buildRenderedFacts(step, phaseBucket);

  return (
    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
      <button
        type="button"
        onClick={() => setStepOpen((value) => !value)}
        className="flex w-full items-center gap-3 text-left"
      >
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
        {stepOpen ? (
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-slate-400" />
        )}
      </button>

      {stepOpen ? (
        <>
          {facts.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {facts.map((detail, index) => (
                <div
                  key={`${step.id}-${index}`}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs leading-relaxed",
                    "border-slate-100 bg-slate-50 text-slate-600",
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
                  key={`${step.id}-${group.entryId}`}
                  className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3"
                >
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-emerald-700 uppercase">
                    {group.agentRole} · {group.agentName}
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {group.items.map((item, index) => (
                      <div
                        key={`${group.entryId}-${index}`}
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
        </>
      ) : null}
    </div>
  );
}

export function ThinkingTraceCard({
  snapshot,
  runBucket,
  isLoading,
  analyticsEvents = [],
  runtimeTraceEntries = [],
}: ThinkingTraceCardProps) {
  const steps = buildVisibleThinkingSteps(
    Array.isArray(snapshot.steps) ? snapshot.steps : [],
    runBucket ?? undefined,
  );

  // 整卡智能开合：run 进行中自动展开、结束后 800ms 自动收起、用户手动 toggle 后
  // 不再自动复位。复用 process-trace.tsx 的 userControlledRef 模式。
  const [isOpen, setIsOpen] = useState(true);
  const userControlledRef = useRef(false);

  useEffect(() => {
    const hasSteps = steps.length > 0;
    if (!hasSteps) {
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
  }, [steps.length, isLoading]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-emerald-50/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-emerald-200/80 px-4 py-3">
        {/* 左半：折叠触发 button（图标 + 标题 + chevron）。
            右半 sheet triggers 单独成 div，避免 button 嵌套 button（HTML 不合法），
            且点 sheet 不会触发整卡折叠。 */}
        <button
          type="button"
          onClick={() => {
            userControlledRef.current = true;
            setIsOpen((value) => !value);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
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
          {isOpen ? (
            <ChevronDown className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-emerald-600" />
          )}
        </button>
        <div className="flex items-center gap-1">
          <RuntimeTraceSheet entries={runtimeTraceEntries} />
          <AnalyticsSheet
            events={analyticsEvents}
          />
        </div>
      </div>

      {isOpen ? (
        <div className="flex flex-col gap-3 px-4 py-4">
          {steps.map((step) => (
            <ThinkingTraceStepItem
              key={step.id}
              step={step}
              phaseBucket={runBucket?.phases[step.id]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
