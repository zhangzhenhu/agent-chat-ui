import test from "node:test";
import assert from "node:assert/strict";

const { formatAnalyticsEventJson } = await import(
  new URL("../messages/analytics-sheet-format.ts", import.meta.url).href
);

test("formatAnalyticsEventJson keeps the full event in one formatted json block", () => {
  const formatted = formatAnalyticsEventJson({
    type: "telemetry",
    event_name: "tool.after",
    event_scope: "tool",
    event_phase: "after",
    emitted_at: "2026-07-07T10:00:00.000Z",
    context: {
      run_id: "run-1",
      thread_id: "thread-1",
    },
    subject: {
      component_name: "payment_agent",
    },
    payload: {
      status: "ok",
      nested: {
        amount: 188,
      },
    },
  });

  assert.match(formatted, /"event_name": "tool\.after"/);
  assert.match(formatted, /"run_id": "run-1"/);
  assert.match(formatted, /"nested": \{\n\s+"amount": 188\n\s+\}/);
});

test("formatAnalyticsEventJson keeps array data readable for line-by-line inspection", () => {
  const formatted = formatAnalyticsEventJson({
    event_name: "analytics.trace",
    payload: {
      events: [
        { step: "start", ok: true },
        { step: "finish", ok: false },
      ],
    },
  });

  assert.match(formatted, /"events": \[/);
  assert.match(formatted, /\{\n\s+"step": "start",\n\s+"ok": true\n\s+\}/);
  assert.match(formatted, /\{\n\s+"step": "finish",\n\s+"ok": false\n\s+\}/);
});
