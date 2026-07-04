import type { ThinkingTraceSnapshot } from "./analytics-types";
import type { ThinkingRunBucket, ThinkingState } from "./thinking-state";
import type { ThinkingTraceResolution } from "./process-trace-helpers";

export type ThinkingTraceDisplay = {
  snapshot: ThinkingTraceSnapshot | null;
  runId: string | null;
  runBucket?: ThinkingRunBucket;
  source: "durable" | "transient" | "none";
};

function buildTransientDetailGroups(
  runBucket: ThinkingRunBucket | undefined,
  phaseId: string,
) {
  return Object.entries(runBucket?.phases[phaseId]?.groups ?? {})
    .map(([entryId, group]) => {
      const firstItem = group.items[0];
      if (!firstItem) {
        return null;
      }
      return {
        kind: "reasoning" as const,
        entry_id: entryId,
        agent_name: firstItem.agentName,
        agent_role: firstItem.agentRole,
        text: group.items.map((item) => item.text).join("\n"),
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
}

function mergeDurableSnapshotWithTransientBuckets(args: {
  durableSnapshot: ThinkingTraceSnapshot;
  transientRunBucket?: ThinkingRunBucket;
}): ThinkingTraceSnapshot {
  const { durableSnapshot, transientRunBucket } = args;
  const durableSteps = Array.isArray(durableSnapshot.steps)
    ? durableSnapshot.steps
    : [];
  const mergedSteps = [...durableSteps];
  const existingIds = new Set(durableSteps.map((step) => step.id));
  const transientPhaseIds = Object.keys(transientRunBucket?.phases ?? {});

  for (const phaseId of transientPhaseIds) {
    if (existingIds.has(phaseId)) {
      continue;
    }
    // transient-only phase（durable 卡还没覆盖到这一阶段）的 title 留空串。
    //
    // 新协议（frontend-06-thinking-sse-raw-guide.md）下阶段标题只认 durable
    // 卡的 `steps[].title`；这里不硬编码任何 phase 文案，也不再回退英文
    // phase_id——后者正是用户反馈的“阶段名称一段时间变成英文”的根因。
    // durable 帧到达后该 phase 会被中文 title 覆盖。
    mergedSteps.push({
      id: phaseId,
      title: "",
      status: phaseId === transientPhaseIds[transientPhaseIds.length - 1] ? "active" : "completed",
      // 这里给 transient-only phase 构造一份与 durable 协议同形的壳。
      // 目的不是把 transient bucket durable 化，而是让 display 层统一按 `entries[]` 理解数据。
      entries: buildTransientDetailGroups(transientRunBucket, phaseId),
    });
  }

  return {
    ...durableSnapshot,
    // durable snapshot 已经是当前 run 的正式真相时，不能再用 transient bucket
    // 把 `current_phase_id` 回退到更早的阶段。
    //
    // 真实问题背景：
    // - specialist bucket 可能晚于 durable 收口一小段时间才清掉；
    // - 如果这里总是偏向 transient 最新 phase，就会出现
    //   `need_confirmation` 被打回 `need_specialist` 的阶段闪回。
    current_phase_id: durableSnapshot.current_phase_id || "",
    steps: mergedSteps,
  };
}

export function resolveThinkingTraceDisplay(args: {
  durable: ThinkingTraceResolution;
  thinkingState: ThinkingState;
}): ThinkingTraceDisplay {
  const { durable, thinkingState } = args;

  // 新协议下 thinking 卡只认 durable `thinking_trace` UI 帧——它带完整中文
  // `steps[].title` 与 `entries[]`，且实测始终先于 transient `phase_started`
  // 到达。transient 事件（`reasoning_delta`）仅作为流式文本增量叠加在
  // durable 卡之上，不再独立构造“transient-only 快照”。
  //
  // 因此 durable 缺失时直接返回 none，不显示卡——避免再用 phase_id 兜底
  // 标题导致闪英文。
  if (durable.snapshot && durable.runId) {
    const durableRunBucket = thinkingState.byRunId[durable.runId];
    return {
      snapshot: mergeDurableSnapshotWithTransientBuckets({
        durableSnapshot: durable.snapshot,
        transientRunBucket: durableRunBucket,
      }),
      runId: durable.runId,
      runBucket: durableRunBucket,
      source: "durable",
    };
  }

  return {
    snapshot: null,
    runId: null,
    source: "none",
  };
}
