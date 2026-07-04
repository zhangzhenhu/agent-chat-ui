import test from "node:test";
import assert from "node:assert/strict";

const { buildRenderedFacts, buildRenderedThinkingGroups, buildVisibleThinkingSteps } = await import(
  new URL("../thinking-trace-view-model.ts", import.meta.url).href,
);

test("buildRenderedThinkingGroups appends transient items to an existing durable main group", () => {
  const groups = buildRenderedThinkingGroups(
    {
      id: "need_specialist",
      title: "需求专家",
      status: "active",
      entries: [
        {
          kind: "reasoning",
          entry_id: "main:family_main_agent",
          agent_name: "family_main_agent",
          agent_role: "main",
          text: "durable-1",
        },
      ],
    },
    {
      facts: [],
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
      entryId: "main:family_main_agent",
      agentName: "family_main_agent",
      agentRole: "main",
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
      entries: [],
    },
    {
      facts: [],
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
      entryId: "main:family_main_agent",
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
      entries: [],
    },
    {
      facts: [],
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
      entryId: "main:family_main_agent",
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
      entries: [
        {
          kind: "reasoning",
          entry_id: "main:family_main_agent",
          agent_name: "family_main_agent",
          agent_role: "main",
          text: "transient-1",
        },
      ],
    },
    {
      facts: [],
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
      entryId: "main:family_main_agent",
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
        entries: [],
      },
      {
        id: "result",
        title: "正在生成最终结果",
        status: "pending",
        entries: [],
      },
    ],
    {
      phases: {
        intent: {
          facts: [],
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
        entries: [
          {
            kind: "fact",
            text: "需要你确认需求摘要",
          },
        ],
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

test("buildVisibleThinkingSteps keeps a pending phase when raw child durable groups exist but are hidden from the user-facing card", () => {
  const steps = buildVisibleThinkingSteps(
    [
      {
        id: "need_specialist",
        title: "正在调用需求专家",
        status: "pending",
        entries: [
          {
            kind: "reasoning",
            entry_id: "need:food_need_specialist",
            agent_name: "food_need_specialist",
            agent_role: "need",
            text: "正在补全预算约束",
          },
        ],
      },
    ],
    {
      phases: {},
    },
  );

  assert.deepEqual(
    steps.map((step: { id: string }) => step.id),
    ["need_specialist"],
  );
});

test("buildRenderedThinkingGroups shows child specialist transient groups alongside main", () => {
  // 去掉 main 过滤后，child specialist 的 transient reasoning 也展示给用户——
  // 它是二阶段"正在使用 xxx 服务"下的主要进度内容。
  const groups = buildRenderedThinkingGroups(
    {
      id: "need_specialist",
      title: "正在调用需求专家",
      status: "active",
      entries: [],
    },
    {
      facts: [],
      groups: {
        "need:food_need_specialist": {
          items: [
            {
              text: "正在补全预算约束",
              agentName: "food_need_specialist",
              agentRole: "need",
            },
          ],
        },
        "main:family_main_agent": {
          items: [
            {
              text: "先判断是否需要需求专家",
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
      entryId: "need:food_need_specialist",
      agentName: "food_need_specialist",
      agentRole: "need",
      items: ["正在补全预算约束"],
    },
    {
      entryId: "main:family_main_agent",
      agentName: "family_main_agent",
      agentRole: "main",
      items: ["先判断是否需要需求专家"],
    },
  ]);
});

test("buildRenderedThinkingGroups shows child specialist durable groups alongside main", () => {
  const groups = buildRenderedThinkingGroups(
    {
      id: "need_specialist",
      title: "正在调用需求专家",
      status: "completed",
      entries: [
        {
          kind: "reasoning",
          entry_id: "main:family_main_agent",
          agent_name: "family_main_agent",
          agent_role: "main",
          text: "主 agent 判断需要继续需求澄清",
        },
        {
          kind: "reasoning",
          entry_id: "need:food_need_specialist",
          agent_name: "food_need_specialist",
          agent_role: "need",
          text: "正在补全预算约束",
        },
      ],
    },
    undefined,
  );

  assert.deepEqual(groups, [
    {
      entryId: "main:family_main_agent",
      agentName: "family_main_agent",
      agentRole: "main",
      items: ["主 agent 判断需要继续需求澄清"],
    },
    {
      entryId: "need:food_need_specialist",
      agentName: "food_need_specialist",
      agentRole: "need",
      items: ["正在补全预算约束"],
    },
  ]);
});

test("buildRenderedFacts merges durable + transient facts and dedupes by entry_id", () => {
  // durable fact 与 transient fact（entry_added）可能含同一 entry_id。
  // buildRenderedFacts 按 entry_id 去重：durable 优先，transient 只补 durable 没有的。
  const facts = buildRenderedFacts(
    {
      id: "need_specialist",
      title: "正在调用需求专家",
      status: "active",
      entries: [
        {
          kind: "fact",
          entry_id: "fact:need:food_need_specialist:1",
          agent_name: "food_need_specialist",
          agent_role: "need",
          text: "正在调用 food-need-intelligence 能力",
        },
      ],
    },
    {
      facts: [
        // 与 durable 同 entry_id → 去重，不重复显示。
        {
          kind: "fact",
          entry_id: "fact:need:food_need_specialist:1",
          agent_name: "food_need_specialist",
          agent_role: "need",
          text: "正在调用 food-need-intelligence 能力",
        },
        // durable 没有的新 entry_id → 补充显示。
        {
          kind: "fact",
          entry_id: "fact:need:food_need_specialist:2",
          agent_name: "food_need_specialist",
          agent_role: "need",
          text: "正在调用 publish_need_confirmation 工具",
        },
      ],
      groups: {},
    },
  );

  assert.deepEqual(
    facts.map((f: { entry_id?: string; text?: string }) => ({ id: f.entry_id, text: f.text })),
    [
      { id: "fact:need:food_need_specialist:1", text: "正在调用 food-need-intelligence 能力" },
      { id: "fact:need:food_need_specialist:2", text: "正在调用 publish_need_confirmation 工具" },
    ],
  );
});
