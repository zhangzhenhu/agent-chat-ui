import type { AnalyticsEventEnvelope } from "./analytics-types";

export type AnalyticsState = {
  byRunId: Record<string, AnalyticsEventEnvelope[]>;
  latestRunId: string | null;
};

export type AnalyticsRunResolution = {
  runId: string | null;
  events: AnalyticsEventEnvelope[];
};

export type AnalyticsTriggerResolution = {
  runId: string | null;
  events: AnalyticsEventEnvelope[];
  visible: boolean;
};

export const EMPTY_ANALYTICS_STATE: AnalyticsState = {
  byRunId: {},
  latestRunId: null,
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function isAnalyticsStreamEvent(event: unknown): event is AnalyticsEventEnvelope {
  if (!event || typeof event !== "object") {
    return false;
  }

  const envelope = event as AnalyticsEventEnvelope;
  return envelope.kind === "analytics" || envelope.type === "telemetry";
}

function getRunId(event: AnalyticsEventEnvelope): string {
  return normalizeString(event.context?.run_id);
}

function appendEvent(
  items: AnalyticsEventEnvelope[] | undefined,
  event: AnalyticsEventEnvelope,
): AnalyticsEventEnvelope[] {
  return [...(items ?? []), event];
}

export function appendAnalyticsEvent(
  prev: AnalyticsState,
  event: AnalyticsEventEnvelope,
): AnalyticsState {
  const runId = getRunId(event);
  if (!runId) {
    return prev;
  }

  return {
    byRunId: {
      ...prev.byRunId,
      [runId]: appendEvent(prev.byRunId[runId], event),
    },
    latestRunId: runId,
  };
}

export function resolveLatestAnalyticsRun(
  state: AnalyticsState,
): AnalyticsRunResolution {
  const runId = state.latestRunId;
  return {
    runId,
    events: runId ? state.byRunId[runId] ?? [] : [],
  };
}
