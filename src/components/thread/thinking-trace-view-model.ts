import type {
  ThinkingDetailGroup,
  ThinkingTraceStep,
} from "./analytics-types";
import type { ThinkingPhaseBucket } from "./thinking-state";

export type RenderedThinkingGroup = {
  groupId: string;
  agentName: string;
  agentRole: string;
  items: string[];
};

function renderDurableGroups(
  groups: ThinkingDetailGroup[],
): RenderedThinkingGroup[] {
  return groups.map((group) => ({
    groupId: group.group_id,
    agentName: group.agent_name,
    agentRole: group.agent_role,
    items: [...group.items],
  }));
}

function renderTransientGroups(
  phaseBucket?: ThinkingPhaseBucket,
): RenderedThinkingGroup[] {
  return Object.entries(phaseBucket?.groups ?? {}).map(([groupId, group]) => ({
    groupId,
    agentName: group.items[0]?.agentName ?? "unknown-agent",
    agentRole: group.items[0]?.agentRole ?? "unknown-role",
    items: group.items.map((item) => item.text),
  }));
}

export function buildRenderedThinkingGroups(
  step: ThinkingTraceStep,
  phaseBucket?: ThinkingPhaseBucket,
): RenderedThinkingGroup[] {
  const durableGroups = renderDurableGroups(step.detail_groups ?? []);
  const transientGroups = renderTransientGroups(phaseBucket).filter(
    (group) => group.items.length > 0,
  );

  const merged = new Map<string, RenderedThinkingGroup>();

  for (const group of durableGroups) {
    merged.set(group.groupId, group);
  }

  for (const group of transientGroups) {
    const existing = merged.get(group.groupId);
    if (existing) {
      const transientBucket = phaseBucket?.groups[group.groupId];
      if (transientBucket?.flushed) {
        continue;
      }
      existing.items = [...existing.items, ...group.items];
      continue;
    }
    merged.set(group.groupId, group);
  }

  return [...merged.values()];
}

function hasDurableDetails(step: ThinkingTraceStep): boolean {
  return Array.isArray(step.details) && step.details.length > 0;
}

function hasRenderedGroups(groups: RenderedThinkingGroup[]): boolean {
  return groups.some((group) => group.items.length > 0);
}

export function buildVisibleThinkingSteps(
  steps: ThinkingTraceStep[],
  runBucket?: { phases: Record<string, ThinkingPhaseBucket> },
): ThinkingTraceStep[] {
  return steps.filter((step) => {
    const renderedGroups = buildRenderedThinkingGroups(
      step,
      runBucket?.phases[step.id],
    );

    if (step.status !== "pending") {
      return true;
    }

    return hasDurableDetails(step) || hasRenderedGroups(renderedGroups);
  });
}
