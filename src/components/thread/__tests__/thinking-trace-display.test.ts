import test from "node:test";
import assert from "node:assert/strict";

const { resolveThinkingTraceDisplay } = await import(
  new URL("../thinking-trace-display.ts", import.meta.url).href,
);
import type { ThinkingTraceStep } from "../analytics-types";

test("resolveThinkingTraceDisplay prefers durable snapshot when available", () => {
  const resolved = resolveThinkingTraceDisplay({
    durable: {
      runId: "run-1",
      snapshot: {
        status: "completed",
        current_phase_id: "result",
        steps: [
          {
            id: "result",
            title: "正在生成最终结果",
            status: "completed",
            entries: [],
          },
        ],
      },
    },
    thinkingState: {
      latestRunId: "run-1",
      byRunId: {
        "run-1": {
          phases: {
            result: {
              groups: {
                "main:family_main_agent": {
                  items: [
                    {
                      text: "transient",
                      agentName: "family_main_agent",
                      agentRole: "main",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });

  assert.equal(resolved.source, "durable");
  assert.equal(resolved.runId, "run-1");
  assert.equal(resolved.snapshot?.current_phase_id, "result");
  assert.ok(resolved.runBucket);
});

test("resolveThinkingTraceDisplay returns none when durable ui is absent, even if transient buckets exist", () => {
  // 新协议下 thinking 卡只认 durable `thinking_trace` UI 帧。durable 缺失时
  // 即使 transient bucket 有数据，也不再构造“transient-only 快照”——避免
  // 用 phase_id 兜底标题导致闪英文。等 durable 帧到达再渲染。
  const resolved = resolveThinkingTraceDisplay({
    durable: {
      runId: "",
      snapshot: null,
    },
    thinkingState: {
      latestRunId: "run-2",
      byRunId: {
        "run-2": {
          phases: {
            intent: {
              groups: {
                "main:family_main_agent": {
                  items: [
                    {
                      text: "先理解用户问题",
                      agentName: "family_main_agent",
                      agentRole: "main",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });

  assert.equal(resolved.source, "none");
  assert.equal(resolved.runId, null);
  assert.equal(resolved.snapshot, null);
});

test("resolveThinkingTraceDisplay does not merge child-run transient phases into the current durable run", () => {
  const resolved = resolveThinkingTraceDisplay({
    durable: {
      runId: "parent-run",
      snapshot: {
        status: "active",
        current_phase_id: "intent",
        steps: [
          {
            id: "intent",
            title: "正在理解你的需求",
            status: "completed",
            entries: [
              {
                kind: "reasoning",
                group_id: "main:family_main_agent",
                agent_name: "family_main_agent",
                agent_role: "main",
                text: "先理解用户问题",
              },
            ],
          },
        ],
      },
    },
    thinkingState: {
      latestRunId: "child-run",
      byRunId: {
        "child-run": {
          phases: {
            need_specialist: {
              groups: {
                "need:food_need_specialist": {
                  items: [
                    {
                      text: "正在读取技能文件",
                      agentName: "food_need_specialist",
                      agentRole: "need",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });

  assert.equal(resolved.source, "durable");
  assert.equal(resolved.runId, "parent-run");
  assert.ok(resolved.snapshot);
  assert.deepEqual(
    resolved.snapshot?.steps?.map((step: ThinkingTraceStep) => step.id),
    ["intent"],
  );
  const intentStep = resolved.snapshot?.steps?.find(
    (step: ThinkingTraceStep) => step.id === "intent",
  );
  assert.deepEqual(intentStep?.entries, [
    {
      kind: "reasoning",
      group_id: "main:family_main_agent",
      agent_name: "family_main_agent",
      agent_role: "main",
      text: "先理解用户问题",
    },
  ]);
  assert.equal(resolved.snapshot?.current_phase_id, "intent");
  assert.equal(resolved.runBucket, undefined);
});

test("resolveThinkingTraceDisplay keeps the durable current phase when the same run still has transient specialist buckets", () => {
  const resolved = resolveThinkingTraceDisplay({
    durable: {
      runId: "run-confirmation",
      snapshot: {
        status: "waiting_user",
        current_phase_id: "need_confirmation",
        steps: [
          {
            id: "intent",
            title: "正在理解你的意图",
            status: "completed",
            entries: [
              {
                kind: "fact",
                text: "正在查看个人画像，梳理当前用户的偏好与约束。已检索到画像：用户标签（用户年龄段：老年）",
              },
            ],
          },
          {
            id: "need_specialist",
            title: "正在使用「饮食专家」服务",
            status: "completed",
            entries: [],
          },
          {
            id: "need_confirmation",
            title: "正在整理清晰需求",
            status: "waiting_user",
            entries: [
              {
                kind: "fact",
                text: "需求专家已发出确认卡：card",
              },
            ],
          },
        ],
      },
    },
    thinkingState: {
      latestRunId: "run-confirmation",
      byRunId: {
        "run-confirmation": {
          phases: {
            need_specialist: {
              groups: {
                "need:food_need_specialist": {
                  items: [
                    {
                      text: "正在读取技能文件",
                      agentName: "food_need_specialist",
                      agentRole: "need",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });

  // 这里专门锁“durable 已经推进到确认阶段时，前端不能再用同 run 的 transient bucket
  // 把 current_phase_id 打回 need_specialist”，否则 UI 会出现阶段闪回或上一阶段消失。
  assert.equal(resolved.source, "durable");
  assert.equal(resolved.runId, "run-confirmation");
  assert.equal(resolved.snapshot?.current_phase_id, "need_confirmation");
  assert.deepEqual(
    resolved.snapshot?.steps?.map((step: ThinkingTraceStep) => ({
      id: step.id,
      title: step.title,
      status: step.status,
    })),
    [
      {
        id: "intent",
        title: "正在理解你的意图",
        status: "completed",
      },
      {
        id: "need_specialist",
        title: "正在使用「饮食专家」服务",
        status: "completed",
      },
      {
        id: "need_confirmation",
        title: "正在整理清晰需求",
        status: "waiting_user",
      },
    ],
  );
  const intentStep = resolved.snapshot?.steps?.find(
    (step: ThinkingTraceStep) => step.id === "intent",
  );
  assert.deepEqual(intentStep?.entries, [
    {
      kind: "fact",
      text: "正在查看个人画像，梳理当前用户的偏好与约束。已检索到画像：用户标签（用户年龄段：老年）",
    },
  ]);
});
