import test from "node:test";
import assert from "node:assert/strict";

test("appendThinkingEvent stores reasoning deltas by run phase and group", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href,
  );

  const next = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.reasoning_delta",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      text: "补充预算",
    },
  });

  assert.deepEqual(
    next.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].items,
    [{ text: "补充预算", agentName: "food_need_specialist", agentRole: "need" }],
  );
  assert.equal(next.latestRunId, "run-1");
});

test("appendThinkingEvent clears a flushed group", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href,
  );

  const withDelta = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.reasoning_delta",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      group_id: "need:food_need_specialist",
      text: "补充预算",
    },
  });

  const flushed = appendThinkingEvent(withDelta, {
    kind: "thinking",
    event_name: "thinking.phase_flushed",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      group_id: "need:food_need_specialist",
      status: "completed",
    },
  });

  assert.deepEqual(
    flushed.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].items,
    [{ text: "补充预算", agentName: "food_need_specialist", agentRole: "need" }],
  );
  assert.equal(
    flushed.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].flushed,
    true,
  );
  assert.equal(flushed.latestRunId, "run-1");
});
