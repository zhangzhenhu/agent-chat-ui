import test from "node:test";
import assert from "node:assert/strict";

const { buildRenderedThinkingGroups, buildVisibleThinkingSteps } = await import(
  new URL("../thinking-trace-view-model.ts", import.meta.url).href,
);

test("buildRenderedThinkingGroups appends transient items to an existing durable group", () => {
  const groups = buildRenderedThinkingGroups(
    {
      id: "need_specialist",
      title: "需求专家",
      status: "active",
      detail_groups: [
        {
          group_id: "need:food_need_specialist",
          agent_name: "food_need_specialist",
          agent_role: "need",
          kind: "reasoning",
          items: ["durable-1"],
        },
      ],
    },
    {
      groups: {
        "need:food_need_specialist": {
          items: [
            {
              text: "transient-1",
              agentName: "food_need_specialist",
              agentRole: "need",
            },
          ],
        },
      },
    },
  );

  assert.deepEqual(groups, [
    {
      groupId: "need:food_need_specialist",
      agentName: "food_need_specialist",
      agentRole: "need",
      items: ["durable-1", "transient-1"],
    },
  ]);
});

test("buildRenderedThinkingGroups keeps transient-only groups visible", () => {
  const groups = buildRenderedThinkingGroups(
    {
      id: "intent",
      title: "理解需求",
      status: "active",
      detail_groups: [],
    },
    {
      groups: {
        "main:family_main_agent": {
          items: [
            {
              text: "transient-1",
              agentName: "family_main_agent",
              agentRole: "main",
            },
          ],
        },
      },
    },
  );

  assert.deepEqual(groups, [
    {
      groupId: "main:family_main_agent",
      agentName: "family_main_agent",
      agentRole: "main",
      items: ["transient-1"],
    },
  ]);
});

test("buildRenderedThinkingGroups keeps flushed transient items visible until durable groups catch up", () => {
  const groups = buildRenderedThinkingGroups(
    {
      id: "intent",
      title: "理解需求",
      status: "active",
      detail_groups: [],
    },
    {
      groups: {
        "main:family_main_agent": {
          items: [
            {
              text: "transient-1",
              agentName: "family_main_agent",
              agentRole: "main",
            },
          ],
          flushed: true,
        },
      },
    },
  );

  assert.deepEqual(groups, [
    {
      groupId: "main:family_main_agent",
      agentName: "family_main_agent",
      agentRole: "main",
      items: ["transient-1"],
    },
  ]);
});

test("buildRenderedThinkingGroups does not duplicate flushed transient items after durable group arrives", () => {
  const groups = buildRenderedThinkingGroups(
    {
      id: "intent",
      title: "理解需求",
      status: "completed",
      detail_groups: [
        {
          group_id: "main:family_main_agent",
          agent_name: "family_main_agent",
          agent_role: "main",
          kind: "reasoning",
          items: ["transient-1"],
        },
      ],
    },
    {
      groups: {
        "main:family_main_agent": {
          items: [
            {
              text: "transient-1",
              agentName: "family_main_agent",
              agentRole: "main",
            },
          ],
          flushed: true,
        },
      },
    },
  );

  assert.deepEqual(groups, [
    {
      groupId: "main:family_main_agent",
      agentName: "family_main_agent",
      agentRole: "main",
      items: ["transient-1"],
    },
  ]);
});

test("buildVisibleThinkingSteps hides pending phases that have no durable or transient content", () => {
  const steps = buildVisibleThinkingSteps(
    [
      {
        id: "intent",
        title: "正在理解你的需求",
        status: "active",
        detail_groups: [],
      },
      {
        id: "result",
        title: "正在生成最终结果",
        status: "pending",
        detail_groups: [],
      },
    ],
    {
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
  );

  assert.deepEqual(
    steps.map((step: { id: string }) => step.id),
    ["intent"],
  );
});

test("buildVisibleThinkingSteps keeps a pending phase when it already has content", () => {
  const steps = buildVisibleThinkingSteps(
    [
      {
        id: "need_confirmation",
        title: "正在整理清晰需求",
        status: "pending",
        details: [
          {
            kind: "fact",
            text: "需要你确认需求摘要",
          },
        ],
        detail_groups: [],
      },
    ],
    {
      phases: {},
    },
  );

  assert.deepEqual(
    steps.map((step: { id: string }) => step.id),
    ["need_confirmation"],
  );
});
