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
            detail_groups: [],
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

test("resolveThinkingTraceDisplay builds a transient shell when durable ui is temporarily absent", () => {
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

  assert.equal(resolved.source, "transient");
  assert.equal(resolved.runId, "run-2");
  assert.equal(resolved.snapshot?.status, "active");
  assert.equal(resolved.snapshot?.current_phase_id, "intent");
  assert.deepEqual(resolved.snapshot?.steps, [
    {
      id: "intent",
      title: "正在理解你的需求",
      status: "active",
      details: [],
      detail_groups: [],
    },
  ]);
});

test("resolveThinkingTraceDisplay keeps durable parent steps visible when child transient phases arrive", () => {
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
            detail_groups: [
              {
                group_id: "main:family_main_agent",
                agent_name: "family_main_agent",
                agent_role: "main",
                kind: "reasoning",
                items: ["先理解用户问题"],
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
    ["intent", "need_specialist"],
  );
  const intentStep = resolved.snapshot?.steps?.find(
    (step: ThinkingTraceStep) => step.id === "intent",
  );
  assert.deepEqual(intentStep?.detail_groups, [
    {
      group_id: "main:family_main_agent",
      agent_name: "family_main_agent",
      agent_role: "main",
      kind: "reasoning",
      items: ["先理解用户问题"],
    },
  ]);
  const needStep = resolved.snapshot?.steps?.find(
    (step: ThinkingTraceStep) => step.id === "need_specialist",
  );
  assert.equal(needStep?.status, "active");
  assert.deepEqual(needStep?.detail_groups, [
    {
      group_id: "need:food_need_specialist",
      agent_name: "food_need_specialist",
      agent_role: "need",
      kind: "reasoning",
      items: ["正在读取技能文件"],
    },
  ]);
});
