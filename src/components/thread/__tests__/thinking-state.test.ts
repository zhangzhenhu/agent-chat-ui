import test from "node:test";
import assert from "node:assert/strict";

test("appendThinkingEvent stores reasoning deltas by run phase and entry_id", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href
  );

  // 新协议下 reasoning_delta 用 `payload.entry_id` 与 durable `entries[].entry_id` 对齐；
  // 前端不再用 agentRole:agentName 兜底拼接 group key。
  const next = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.reasoning_delta",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      entry_id: "need:food_need_specialist",
      text: "补充预算",
    },
  });

  assert.deepEqual(
    next.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].items,
    [{ text: "补充预算", agentName: "food_need_specialist", agentRole: "need" }],
  );
  assert.equal(next.latestRunId, "run-1");
});

test("appendThinkingEvent keeps the first timestamp for canonical thinking.chunk", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href,
  );

  const first = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.chunk",
    context: { run_id: "run-1" },
    subject: { agent_role: "main" },
    payload: {
      phase_id: "intent",
      agent_name: "family_main_agent",
      entry_id: "main:family_main_agent",
      entry_created_at: "2026-07-12T14:32:18.456+08:00",
      text: "先理解用户需求",
    },
  });
  const second = appendThinkingEvent(first, {
    kind: "thinking",
    event_name: "thinking.chunk",
    context: { run_id: "run-1" },
    subject: { agent_role: "main" },
    payload: {
      phase_id: "intent",
      agent_name: "family_main_agent",
      entry_id: "main:family_main_agent",
      entry_created_at: "2026-07-12T14:32:20.000+08:00",
      text: "再决定是否委派专家",
    },
  });

  const group = second.byRunId["run-1"].phases.intent.groups["main:family_main_agent"];
  assert.equal(group.createdAt, "2026-07-12T14:32:18.456+08:00");
  assert.equal(group.items.length, 2);
});

test("appendThinkingEvent ignores thinking.phase_started (durable card already carries phase + title)", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href
  );

  const next = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.phase_started",
    context: { run_id: "run-1" },
    subject: { agent_role: "main" },
    payload: {
      phase_id: "intent",
      default_title: "正在理解你的意图",
      status: "active",
      agent_name: "family_main_agent",
      source: "middleware",
    },
  });

  // phase_started 不再写入 state——避免 transient 兜底渲染闪英文标题。
  assert.deepEqual(next, EMPTY_THINKING_STATE);
});

test("appendThinkingEvent marks all run phases flushed when the run-level thinking.completed arrives", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href
  );

  const withDelta = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.reasoning_delta",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      entry_id: "need:food_need_specialist",
      text: "补充预算",
    },
  });

  const completed = appendThinkingEvent(withDelta, {
    kind: "thinking",
    event_name: "thinking.completed",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      status: "completed",
      run_status: "completed",
      workflow_status: "completed",
      result_kind: "confirmation_card",
    },
  });

  // thinking.completed 是 run 级收口：当前 run 下所有 phase 的所有 entry 都应 flushed。
  assert.deepEqual(
    completed.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].items,
    [{ text: "补充预算", agentName: "food_need_specialist", agentRole: "need" }],
  );
  assert.equal(
    completed.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].flushed,
    true,
  );
  assert.equal(completed.latestRunId, "run-1");
});

test("appendThinkingEvent stores entry_added facts by phase and dedupes by entry_id", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href
  );

  // thinking.entry_added 携带一条已成形的 fact（如“正在调用 xxx 能力”），
  // 前端按 entry_id 去重存入 phase.facts，让二/三阶段实时显示进度文案。
  const next = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.entry_added",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      card_id: "thinking:run-1",
      entry: {
        entry_id: "fact:need:food_need_specialist:1",
        kind: "fact",
        agent_name: "food_need_specialist",
        agent_role: "need",
        text: "正在调用 food-need-intelligence 能力",
        created_at: "2026-07-12T14:32:18.456+08:00",
      },
    },
  });

  assert.deepEqual(next.byRunId["run-1"].phases["need_specialist"].facts, [
    {
      kind: "fact",
      entry_id: "fact:need:food_need_specialist:1",
      agent_name: "food_need_specialist",
      agent_role: "need",
      text: "正在调用 food-need-intelligence 能力",
      created_at: "2026-07-12T14:32:18.456+08:00",
    },
  ]);
  assert.equal(next.latestRunId, "run-1");

  // 同 entry_id 重复发 → 去重，不重复堆积。
  const dup = appendThinkingEvent(next, {
    kind: "thinking",
    event_name: "thinking.entry_added",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      card_id: "thinking:run-1",
      entry: {
        entry_id: "fact:need:food_need_specialist:1",
        kind: "fact",
        agent_name: "food_need_specialist",
        agent_role: "need",
        text: "正在调用 food-need-intelligence 能力",
      },
    },
  });
  assert.equal(dup.byRunId["run-1"].phases["need_specialist"].facts.length, 1);

  // 不同 entry_id 的新 fact → 追加。
  const next2 = appendThinkingEvent(next, {
    kind: "thinking",
    event_name: "thinking.entry_added",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      card_id: "thinking:run-1",
      entry: {
        entry_id: "fact:need:food_need_specialist:2",
        kind: "fact",
        agent_name: "food_need_specialist",
        agent_role: "need",
        text: "正在调用 publish_need_confirmation 工具",
      },
    },
  });
  assert.equal(next2.byRunId["run-1"].phases["need_specialist"].facts.length, 2);
});
