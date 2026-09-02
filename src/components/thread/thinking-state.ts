import type {
  ThinkingEventEnvelope,
  ThinkingFactEntry,
  ThinkingTraceStep,
} from "./analytics-types";

export type ThinkingDeltaItem = {
  text: string;
  agentName: string;
  agentRole: string;
};

export type ThinkingGroupBucket = {
  items: ThinkingDeltaItem[];
  // raw chunk 可能早于 durable 卡到达，因此需要在 transient bucket 固定 entry 的首次时间。
  createdAt?: string;
  flushed: boolean;
};

export type ThinkingPhaseBucket = {
  groups: Record<string, ThinkingGroupBucket>;
  // thinking.entry_added 的稳定 fact 文案（如“正在调用 xxx 能力/工具”）。
  // 按 entry_id 去重，保留到达顺序。durable 帧到达后，view-model 的
  // buildRenderedFacts 会按 entry_id 与 durable fact 去重合并，避免重复。
  facts: ThinkingFactEntry[];
  // phase_started/updated 在 durable 卡到达前提供实时阶段标题和状态。
  title?: string;
  status?: ThinkingTraceStep["status"];
  sequence?: number;
};

export type ThinkingRunBucket = {
  phases: Record<string, ThinkingPhaseBucket>;
  activePhaseId?: string;
  activePhaseSequence?: number;
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

function getEntryCreatedAt(event: ThinkingEventEnvelope): string {
  return normalizeString(event.payload?.entry_created_at);
}

function getPhaseTitle(event: ThinkingEventEnvelope): string {
  const payload = event.payload;
  return (
    normalizeString(payload?.title) || normalizeString(payload?.default_title)
  );
}

function getPhaseStatus(
  event: ThinkingEventEnvelope,
): ThinkingTraceStep["status"] {
  const status = normalizeString(event.payload?.status);
  return ["pending", "active", "completed", "waiting_user", "failed"].includes(
    status,
  )
    ? (status as ThinkingTraceStep["status"])
    : "active";
}

function getSequence(event: ThinkingEventEnvelope): number | undefined {
  const sequence = event.payload?.sequence;
  return typeof sequence === "number" && Number.isFinite(sequence)
    ? sequence
    : undefined;
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
function parseEntryFact(
  payload: ThinkingEventEnvelope["payload"],
): ThinkingFactEntry | null {
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
    created_at: normalizeString(e.created_at) || undefined,
    agent_name: normalizeString(e.agent_name) || undefined,
    agent_role: normalizeString(e.agent_role) || undefined,
    text,
    status: normalizeString(e.status) || undefined,
    source: normalizeString(e.source) || undefined,
    updated_at: normalizeString(e.updated_at) || undefined,
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

  const phaseId = getPhaseId(event);

  // phase 事件是 specialist 进入新阶段时的实时提示。它可能先于 root durable
  // snapshot 到达，因此必须保存标题和状态；sequence 用于丢弃乱序的旧事件。
  if (
    eventName === "thinking.phase_started" ||
    eventName === "thinking.phase_updated"
  ) {
    if (!phaseId) {
      return prev;
    }
    const runBucket = ensureRunBucket(prev, runId);
    const phaseBucket = ensurePhaseBucket(runBucket, phaseId);
    const sequence = getSequence(event);
    if (
      sequence !== undefined &&
      phaseBucket.sequence !== undefined &&
      sequence < phaseBucket.sequence
    ) {
      return prev;
    }
    const status = getPhaseStatus(event);
    const title = getPhaseTitle(event) || phaseBucket.title;
    const nextRunBucket: ThinkingRunBucket = {
      ...runBucket,
      phases: {
        ...runBucket.phases,
        [phaseId]: {
          ...phaseBucket,
          ...(title ? { title } : {}),
          status,
          ...(sequence !== undefined ? { sequence } : {}),
        },
      },
    };
    if (
      status === "active" &&
      (sequence === undefined ||
        nextRunBucket.activePhaseSequence === undefined ||
        sequence >= nextRunBucket.activePhaseSequence)
    ) {
      nextRunBucket.activePhaseId = phaseId;
      nextRunBucket.activePhaseSequence = sequence;
    }
    return {
      byRunId: { ...prev.byRunId, [runId]: nextRunBucket },
      latestRunId: runId,
    };
  }

  // reasoning chunk 是唯一需要 phase + entry 粒度的文本增量事件。
  // thinking.completed 是 run 级收口，只需要 runId（见下方分支）。
  // `thinking.chunk` 是当前协议；旧名称仅作为渐进部署时的读兼容。
  if (
    eventName === "thinking.chunk" ||
    eventName === "thinking.reasoning_delta"
  ) {
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
    const existingGroup = phaseBucket.groups[entryId];
    // 同一 entry 的后续 chunk 只能复用首时间，不能让迟到事件改写用户看到的顺序。
    const createdAt =
      existingGroup?.createdAt || getEntryCreatedAt(event) || undefined;

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
                  createdAt,
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

  // 新增的兼容事件：旧前端没有该分支时会忽略它，最终 durable snapshot 仍提供正确结果；
  // 当前代码按稳定 entry_id 覆盖已有 fact，缺失时降级为追加。
  if (eventName === "thinking.entry_updated") {
    if (!phaseId) {
      return prev;
    }
    const fact = parseEntryFact(event.payload);
    if (!fact) {
      return prev;
    }
    const runBucket = ensureRunBucket(prev, runId);
    const phaseBucket = ensurePhaseBucket(runBucket, phaseId);
    const key = fact.entry_id ?? fact.text;
    const index = phaseBucket.facts.findIndex(
      (item) => (item.entry_id ?? item.text) === key,
    );
    const facts = [...phaseBucket.facts];
    if (index >= 0) {
      facts[index] = fact;
    } else {
      facts.push(fact);
    }
    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: {
            ...runBucket.phases,
            [phaseId]: { ...phaseBucket, facts },
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
            Object.entries(phaseBucket.groups).map(
              ([existingEntryId, group]) => [
                existingEntryId,
                {
                  items: group.items,
                  createdAt: group.createdAt,
                  flushed: true,
                },
              ],
            ),
          ),
        },
      ]),
    );
    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: nextPhases,
          activePhaseId: runBucket.activePhaseId,
          activePhaseSequence: runBucket.activePhaseSequence,
        },
      },
      latestRunId: runId,
    };
  }

  return prev;
}
