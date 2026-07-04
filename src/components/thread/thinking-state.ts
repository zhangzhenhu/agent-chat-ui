import type { ThinkingEventEnvelope, ThinkingFactEntry } from "./analytics-types";

export type ThinkingDeltaItem = {
  text: string;
  agentName: string;
  agentRole: string;
};

export type ThinkingGroupBucket = {
  items: ThinkingDeltaItem[];
  flushed: boolean;
};

export type ThinkingPhaseBucket = {
  groups: Record<string, ThinkingGroupBucket>;
  // thinking.entry_added 的稳定 fact 文案（如“正在调用 xxx 能力/工具”）。
  // 按 entry_id 去重，保留到达顺序。durable 帧到达后，view-model 的
  // buildRenderedFacts 会按 entry_id 与 durable fact 去重合并，避免重复。
  facts: ThinkingFactEntry[];
};

export type ThinkingRunBucket = {
  phases: Record<string, ThinkingPhaseBucket>;
};

export type ThinkingState = {
  byRunId: Record<string, ThinkingRunBucket>;
  latestRunId: string | null;
};

export const EMPTY_THINKING_STATE: ThinkingState = {
  byRunId: {},
  latestRunId: null,
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getRunId(event: ThinkingEventEnvelope): string {
  return normalizeString(event.context?.run_id);
}

function getPhaseId(event: ThinkingEventEnvelope): string {
  return normalizeString(event.payload?.phase_id);
}

function getAgentName(event: ThinkingEventEnvelope): string {
  return normalizeString(event.payload?.agent_name);
}

function getAgentRole(event: ThinkingEventEnvelope): string {
  return normalizeString(event.subject?.agent_role);
}

function getText(event: ThinkingEventEnvelope): string {
  return normalizeString(event.payload?.text);
}

// 新协议（frontend-06-thinking-sse-raw-guide.md 第 419/432 行）下，
// thinking.reasoning_delta 用 `payload.entry_id` 与 durable 卡的
// `entries[].entry_id` 对齐。后端必须显式传该字段；前端不再用
// `agentRole:agentName` 兜底拼接，避免造出与 durable entry 对不上的脏 key。
function getEntryId(event: ThinkingEventEnvelope): string {
  return normalizeString(event.payload?.entry_id);
}

// thinking.entry_added 的 fact 在 payload.entry 里（frontend-06 第 447-457 行）：
// {entry_id, kind:"fact", text, agent_name, agent_role}。这里安全解析成 ThinkingFactEntry。
function parseEntryFact(payload: ThinkingEventEnvelope["payload"]): ThinkingFactEntry | null {
  const entry = (payload as { entry?: unknown } | undefined)?.entry;
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const e = entry as Record<string, unknown>;
  const text = normalizeString(e.text);
  if (!text) {
    return null;
  }
  return {
    kind: "fact",
    entry_id: normalizeString(e.entry_id) || undefined,
    agent_name: normalizeString(e.agent_name) || undefined,
    agent_role: normalizeString(e.agent_role) || undefined,
    text,
  };
}

function ensureRunBucket(
  state: ThinkingState,
  runId: string,
): ThinkingRunBucket {
  return state.byRunId[runId] ?? { phases: {} };
}

function ensurePhaseBucket(
  runBucket: ThinkingRunBucket,
  phaseId: string,
): ThinkingPhaseBucket {
  return runBucket.phases[phaseId] ?? { groups: {}, facts: [] };
}

export function appendThinkingEvent(
  prev: ThinkingState,
  event: ThinkingEventEnvelope,
): ThinkingState {
  const runId = getRunId(event);
  const eventName = normalizeString(event.event_name);

  // thinking.phase_started 在新协议里是“非必须、可忽略”的实时增强信号
  // （frontend-06 第 154/386 行）。它的 phase_id 对前端无价值——durable 卡
  // 始终先到，已提供 phase + 中文 title。前端一旦把它写进 state，会在
  // durable 帧未对齐时触发 transient 兜底渲染，正是阶段标题闪英文的根因。
  // 因此这里直接丢弃，不创建 phase bucket。
  if (eventName === "thinking.phase_started") {
    return prev;
  }

  const phaseId = getPhaseId(event);

  // reasoning_delta 是唯一需要 phase + entry 粒度的文本增量事件。
  // thinking.completed 是 run 级收口，只需要 runId（见下方分支）。
  // 因此三要素早退只对 reasoning_delta 生效。
  if (eventName === "thinking.reasoning_delta") {
    const entryId = getEntryId(event);
    if (!phaseId || !entryId) {
      return prev;
    }
    const text = getText(event);
    const agentName = getAgentName(event);
    const agentRole = getAgentRole(event);
    if (!text || !agentName || !agentRole) {
      return prev;
    }

    const runBucket = ensureRunBucket(prev, runId);
    const phaseBucket = ensurePhaseBucket(runBucket, phaseId);
    const nextItems = [
      ...(phaseBucket.groups[entryId]?.items ?? []),
      { text, agentName, agentRole },
    ];

    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: {
            ...runBucket.phases,
            [phaseId]: {
              ...phaseBucket,
              groups: {
                ...phaseBucket.groups,
                [entryId]: {
                  items: nextItems,
                  flushed: false,
                },
              },
            },
          },
        },
      },
      latestRunId: runId,
    };
  }

  // thinking.entry_added 携带一条已成形的稳定 fact（frontend-06 第 411 行），
  // 如“正在调用 xxx 能力/工具”。按 entry_id 去重 push 到 phase 的 facts。
  // entry_id 缺失时用 text 兜底做 key，避免同一条 fact 重复堆积。
  if (eventName === "thinking.entry_added") {
    if (!phaseId) {
      return prev;
    }
    const fact = parseEntryFact(event.payload);
    if (!fact) {
      return prev;
    }
    const dedupKey = fact.entry_id ?? fact.text;
    const runBucket = ensureRunBucket(prev, runId);
    const phaseBucket = ensurePhaseBucket(runBucket, phaseId);
    const existing = phaseBucket.facts.find(
      (f) => (f.entry_id ?? f.text) === dedupKey,
    );
    if (existing) {
      return prev;
    }

    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: {
            ...runBucket.phases,
            [phaseId]: {
              ...phaseBucket,
              facts: [...phaseBucket.facts, fact],
            },
          },
        },
      },
      latestRunId: runId,
    };
  }

  // thinking.completed 表示“本轮 thinking 整体收口”（frontend-06 第 395 行），
  // 不是单个 phase 结束。这里把当前 run 下所有 phase 的所有 group 标记 flushed，
  // 让展示层知道 transient reasoning 增量已 durable 化、可以停止临时叠加。
  // transient facts 不标 flushed——它们在 durable 帧到达后由 view-model 按
  // entry_id 去重合并，不会重复显示。
  if (eventName === "thinking.completed") {
    const runBucket = ensureRunBucket(prev, runId);
    const nextPhases = Object.fromEntries(
      Object.entries(runBucket.phases).map(([existingPhaseId, phaseBucket]) => [
        existingPhaseId,
        {
          facts: phaseBucket.facts,
          groups: Object.fromEntries(
            Object.entries(phaseBucket.groups).map(([existingEntryId, group]) => [
              existingEntryId,
              {
                items: group.items,
                flushed: true,
              },
            ]),
          ),
        },
      ]),
    );
    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: nextPhases,
        },
      },
      latestRunId: runId,
    };
  }

  return prev;
}
