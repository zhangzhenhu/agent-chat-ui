import type { ThinkingTraceSnapshot, ThinkingTraceStep } from "./analytics-types";
import type { ThinkingRunBucket, ThinkingState } from "./thinking-state";
import type { ThinkingTraceResolution } from "./process-trace-helpers";

export type ThinkingTraceDisplay = {
  snapshot: ThinkingTraceSnapshot | null;
  runId: string | null;
  runBucket?: ThinkingRunBucket;
  source: "durable" | "transient" | "none";
};

const FALLBACK_PHASE_TITLES: Record<string, string> = {
  intent: "正在理解你的需求",
  need_specialist: "正在调用需求专家",
  need_confirmation: "正在整理清晰需求",
  supply_specialist: "正在匹配合适方案",
  result: "正在生成最终结果",
};

function buildTransientDetailGroups(
  runBucket: ThinkingRunBucket | undefined,
  phaseId: string,
) {
  return Object.entries(runBucket?.phases[phaseId]?.groups ?? {})
    .map(([groupId, group]) => {
      const firstItem = group.items[0];
      if (!firstItem) {
        return null;
      }
      return {
        group_id: groupId,
        agent_name: firstItem.agentName,
        agent_role: firstItem.agentRole,
        kind: "reasoning",
        items: group.items.map((item) => item.text),
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
}

function buildTransientSnapshot(runBucket: ThinkingRunBucket): ThinkingTraceSnapshot | null {
  const phaseIds = Object.keys(runBucket.phases);
  if (phaseIds.length === 0) {
    return null;
  }

  const steps: ThinkingTraceStep[] = phaseIds.map((phaseId, index) => ({
    id: phaseId,
    title: FALLBACK_PHASE_TITLES[phaseId] ?? phaseId,
    status: index === phaseIds.length - 1 ? "active" : "completed",
    details: [],
    detail_groups: [],
  }));

  return {
    status: "active",
    current_phase_id: phaseIds[phaseIds.length - 1] ?? "",
    steps,
  };
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
    mergedSteps.push({
      id: phaseId,
      title: FALLBACK_PHASE_TITLES[phaseId] ?? phaseId,
      status: phaseId === transientPhaseIds[transientPhaseIds.length - 1] ? "active" : "completed",
      details: [],
      detail_groups: buildTransientDetailGroups(transientRunBucket, phaseId),
    });
  }

  const latestTransientPhaseId =
    transientPhaseIds.length > 0
      ? transientPhaseIds[transientPhaseIds.length - 1] ?? ""
      : "";

  return {
    ...durableSnapshot,
    current_phase_id:
      latestTransientPhaseId || durableSnapshot.current_phase_id || "",
    steps: mergedSteps,
  };
}

export function resolveThinkingTraceDisplay(args: {
  durable: ThinkingTraceResolution;
  thinkingState: ThinkingState;
}): ThinkingTraceDisplay {
  const { durable, thinkingState } = args;

  if (durable.snapshot && durable.runId) {
    const latestRunBucket = thinkingState.latestRunId
      ? thinkingState.byRunId[thinkingState.latestRunId]
      : undefined;
    return {
      snapshot: mergeDurableSnapshotWithTransientBuckets({
        durableSnapshot: durable.snapshot,
        transientRunBucket: latestRunBucket,
      }),
      runId: durable.runId,
      runBucket:
        thinkingState.byRunId[durable.runId] ?? latestRunBucket,
      source: "durable",
    };
  }

  const runId = thinkingState.latestRunId;
  if (!runId) {
    return {
      snapshot: null,
      runId: null,
      source: "none",
    };
  }

  const runBucket = thinkingState.byRunId[runId];
  if (!runBucket) {
    return {
      snapshot: null,
      runId: null,
      source: "none",
    };
  }

  const snapshot = buildTransientSnapshot(runBucket);
  if (!snapshot) {
    return {
      snapshot: null,
      runId: null,
      source: "none",
    };
  }

  return {
    snapshot,
    runId,
    runBucket,
    source: "transient",
  };
}
