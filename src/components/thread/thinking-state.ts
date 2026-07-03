import type { ThinkingEventEnvelope } from "./analytics-types";

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

function getGroupId(event: ThinkingEventEnvelope): string {
  const explicit = normalizeString(event.payload?.group_id);
  if (explicit) {
    return explicit;
  }
  const agentRole = getAgentRole(event);
  const agentName = getAgentName(event);
  if (!agentRole || !agentName) {
    return "";
  }
  return `${agentRole}:${agentName}`;
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
  return runBucket.phases[phaseId] ?? { groups: {} };
}

export function appendThinkingEvent(
  prev: ThinkingState,
  event: ThinkingEventEnvelope,
): ThinkingState {
  const runId = getRunId(event);
  const phaseId = getPhaseId(event);
  const groupId = getGroupId(event);

  if (!runId || !phaseId || !groupId) {
    return prev;
  }

  const runBucket = ensureRunBucket(prev, runId);
  const phaseBucket = ensurePhaseBucket(runBucket, phaseId);
  const eventName = normalizeString(event.event_name);

  if (eventName === "thinking.reasoning_delta") {
    const text = getText(event);
    const agentName = getAgentName(event);
    const agentRole = getAgentRole(event);
    if (!text || !agentName || !agentRole) {
      return prev;
    }

    const nextItems = [
      ...(phaseBucket.groups[groupId]?.items ?? []),
      { text, agentName, agentRole },
    ];

    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: {
            ...runBucket.phases,
            [phaseId]: {
              groups: {
                ...phaseBucket.groups,
                [groupId]: {
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

  if (eventName === "thinking.phase_started") {
    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: {
            ...runBucket.phases,
            [phaseId]: {
              groups: {
                ...phaseBucket.groups,
                [groupId]: phaseBucket.groups[groupId] ?? { items: [], flushed: false },
              },
            },
          },
        },
      },
      latestRunId: runId,
    };
  }

  if (eventName === "thinking.phase_flushed") {
    return {
      byRunId: {
        ...prev.byRunId,
        [runId]: {
          phases: {
            ...runBucket.phases,
            [phaseId]: {
              groups: {
                ...phaseBucket.groups,
                [groupId]: {
                  items: phaseBucket.groups[groupId]?.items ?? [],
                  flushed: true,
                },
              },
            },
          },
        },
      },
      latestRunId: runId,
    };
  }

  return prev;
}
