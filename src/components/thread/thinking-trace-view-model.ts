import type {
  ThinkingFactEntry,
  ThinkingReasoningEntry,
  ThinkingTraceStep,
} from "./analytics-types";
import type { ThinkingPhaseBucket } from "./thinking-state";

export type RenderedThinkingGroup = {
  entryId: string;
  agentName: string;
  agentRole: string;
  items: string[];
};

function renderDurableGroups(
  entries: ThinkingTraceStep["entries"] | undefined,
): RenderedThinkingGroup[] {
  return (entries ?? [])
    .filter((entry): entry is ThinkingReasoningEntry => entry.kind === "reasoning")
    .map((entry) => ({
      entryId: entry.entry_id,
      agentName: entry.agent_name ?? "unknown-agent",
      agentRole: entry.agent_role ?? "unknown-role",
      // durable 新协议已经把一组 reasoning 片段收口成一段 text。
      // 这里继续输出 `items[]` 只是为了复用现有卡片展示模型，不再暴露后端旧 `items[]` 合同。
      items: typeof entry.text === "string" && entry.text
        ? entry.text.split("\n").filter((item) => item.length > 0)
        : [],
    }));
}

function renderTransientGroups(
  phaseBucket?: ThinkingPhaseBucket,
): RenderedThinkingGroup[] {
  return Object.entries(phaseBucket?.groups ?? {}).map(([entryId, group]) => ({
    entryId,
    agentName: group.items[0]?.agentName ?? "unknown-agent",
    agentRole: group.items[0]?.agentRole ?? "unknown-role",
    items: group.items.map((item) => item.text),
  }));
}

export function buildRenderedThinkingGroups(
  step: ThinkingTraceStep,
  phaseBucket?: ThinkingPhaseBucket,
): RenderedThinkingGroup[] {
  const durableGroups = renderDurableGroups(step.entries);
  const transientGroups = renderTransientGroups(phaseBucket).filter(
    (group) => group.items.length > 0,
  );

  const merged = new Map<string, RenderedThinkingGroup>();

  for (const group of durableGroups) {
    merged.set(group.entryId, group);
  }

  for (const group of transientGroups) {
    const existing = merged.get(group.entryId);
    if (existing) {
      const transientBucket = phaseBucket?.groups[group.entryId];
      if (transientBucket?.flushed) {
        continue;
      }
      existing.items = [...existing.items, ...group.items];
      continue;
    }
    merged.set(group.entryId, group);
  }

  // child specialist 的 reasoning 和 fact 现在都展示给用户（后端新协议下
  // child 的 entry_added / reasoning_delta 是二/三阶段的主要进度内容）。
  // 不再做 `agentRole === "main"` 过滤。
  return [...merged.values()];
}

// 合并 durable fact（step.entries 里 kind=fact）+ transient fact
// （thinking.entry_added 实时累积的 phaseBucket.facts）。按 entry_id 去重：
// durable 优先，transient 只补充 durable 没有的 entry_id；entry_id 缺失时
// 用 text 兜底做 key，避免同一条 fact 重复显示。
export function buildRenderedFacts(
  step: ThinkingTraceStep,
  phaseBucket?: ThinkingPhaseBucket,
): ThinkingFactEntry[] {
  const durableFacts = (step.entries ?? []).filter(
    (entry): entry is ThinkingFactEntry => entry.kind === "fact",
  );
  const transientFacts = phaseBucket?.facts ?? [];

  const seen = new Set<string>();
  const result: ThinkingFactEntry[] = [];
  const dedupKey = (f: ThinkingFactEntry) => f.entry_id ?? f.text ?? "";

  for (const f of durableFacts) {
    const key = dedupKey(f);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(f);
  }
  for (const f of transientFacts) {
    const key = dedupKey(f);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(f);
  }
  return result;
}

function hasDurableGroups(step: ThinkingTraceStep): boolean {
  return renderDurableGroups(step.entries).some((group) => group.items.length > 0);
}

function hasFacts(
  step: ThinkingTraceStep,
  phaseBucket?: ThinkingPhaseBucket,
): boolean {
  return buildRenderedFacts(step, phaseBucket).some(
    (f) => typeof f.text === "string" && f.text.length > 0,
  );
}

function hasRenderedGroups(groups: RenderedThinkingGroup[]): boolean {
  return groups.some((group) => group.items.length > 0);
}

export function buildVisibleThinkingSteps(
  steps: ThinkingTraceStep[],
  runBucket?: { phases: Record<string, ThinkingPhaseBucket> },
): ThinkingTraceStep[] {
  return steps.filter((step) => {
    const phaseBucket = runBucket?.phases[step.id];
    const renderedGroups = buildRenderedThinkingGroups(step, phaseBucket);

    if (step.status !== "pending") {
      return true;
    }

    return (
      hasFacts(step, phaseBucket) ||
      hasDurableGroups(step) ||
      hasRenderedGroups(renderedGroups)
    );
  });
}
