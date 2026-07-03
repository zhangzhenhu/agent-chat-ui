import test from "node:test";
import assert from "node:assert/strict";

const {
  EMPTY_ANALYTICS_STATE,
  appendAnalyticsEvent,
  resolveLatestAnalyticsRun,
} = await import(new URL("../analytics-state.ts", import.meta.url).href);

type AnalyticsEventEnvelope = {
  type?: string;
  kind?: string;
  event_name?: string;
  event_scope?: string;
  event_phase?: string;
  context?: {
    tool_call_id?: string;
    run_id?: string;
  };
};

type AnalyticsRunResolution = {
  runId: string | null;
  events: AnalyticsEventEnvelope[];
};

function analyticsEvent(
  overrides: Partial<AnalyticsEventEnvelope> = {},
): AnalyticsEventEnvelope {
  return {
    kind: "analytics",
    event_name: "tool.executed",
    context: {},
    ...overrides,
  };
}

test("resolveLatestAnalyticsRun returns the latest run's analytics events", () => {
  let state = EMPTY_ANALYTICS_STATE;

  state = appendAnalyticsEvent(
    state,
    analyticsEvent({
      event_name: "tool.card.emitted",
      context: { tool_call_id: "call-1", run_id: "run-1" },
    }),
  );
  state = appendAnalyticsEvent(
    state,
    analyticsEvent({
      event_name: "main.llm.decision",
      context: { run_id: "run-1" },
    }),
  );

  const result: AnalyticsRunResolution = resolveLatestAnalyticsRun(state);

  assert.equal(result.runId, "run-1");
  assert.deepEqual(result.events.map((event: AnalyticsEventEnvelope) => event.event_name), [
    "tool.card.emitted",
    "main.llm.decision",
  ]);
});

test("resolveLatestAnalyticsRun keeps newer run ownership independent of messages", () => {
  let state = EMPTY_ANALYTICS_STATE;

  state = appendAnalyticsEvent(
    state,
    analyticsEvent({
      event_name: "turn.start",
      context: { run_id: "run-9" },
    }),
  );

  const result: AnalyticsRunResolution = resolveLatestAnalyticsRun(state);

  assert.equal(result.runId, "run-9");
  assert.deepEqual(result.events.map((event: AnalyticsEventEnvelope) => event.event_name), [
    "turn.start",
  ]);
});

test("resolveLatestAnalyticsRun switches to the newest run when a later run event arrives", () => {
  let state = EMPTY_ANALYTICS_STATE;

  state = appendAnalyticsEvent(
    state,
    analyticsEvent({
      event_name: "turn.start",
      context: { run_id: "run-10" },
    }),
  );
  state = appendAnalyticsEvent(
    state,
    analyticsEvent({
      event_name: "turn.progress",
      context: { run_id: "run-11" },
    }),
  );

  const result: AnalyticsRunResolution = resolveLatestAnalyticsRun(state);

  assert.equal(result.runId, "run-11");
  assert.deepEqual(result.events.map((event: AnalyticsEventEnvelope) => event.event_name), [
    "turn.progress",
  ]);
});

test("appendAnalyticsEvent ignores envelopes without run_id", () => {
  const state = appendAnalyticsEvent(
    EMPTY_ANALYTICS_STATE,
    analyticsEvent({
      event_name: "turn.end",
    }),
  );

  assert.deepEqual(state, EMPTY_ANALYTICS_STATE);
});

test("appendAnalyticsEvent accepts telemetry v1 events keyed by type telemetry", () => {
  const state = appendAnalyticsEvent(
    EMPTY_ANALYTICS_STATE,
    {
      type: "telemetry",
      schema_version: "telemetry_event/v1",
      event_name: "tool.after",
      event_scope: "tool",
      event_phase: "after",
      context: { run_id: "run-telemetry-1" },
    },
  );

  const result: AnalyticsRunResolution = resolveLatestAnalyticsRun(state);

  assert.equal(result.runId, "run-telemetry-1");
  assert.deepEqual(result.events.map((event: AnalyticsEventEnvelope) => event.event_name), [
    "tool.after",
  ]);
});
