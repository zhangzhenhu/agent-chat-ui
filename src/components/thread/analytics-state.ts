import type { AnalyticsEventEnvelope } from "./analytics-types";

export type AnalyticsState = {
  timeline: AnalyticsEventEnvelope[];
};

export type TelemetryTimelineResolution = {
  events: AnalyticsEventEnvelope[];
};

export type AnalyticsTriggerResolution = {
  events: AnalyticsEventEnvelope[];
  visible: boolean;
};

export const EMPTY_ANALYTICS_STATE: AnalyticsState = {
  timeline: [],
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

export function appendAnalyticsEvent(
  prev: AnalyticsState,
  event: AnalyticsEventEnvelope,
): AnalyticsState {
  const runId = getRunId(event);
  if (!runId) {
    return prev;
  }

  return {
    timeline: [...prev.timeline, event],
  };
}

export function resolveTelemetryTimeline(
  state: AnalyticsState,
): TelemetryTimelineResolution {
  return {
    events: state.timeline,
  };
}
