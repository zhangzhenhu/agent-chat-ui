import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";

const {
  applyRootValues,
  applyUiCustomEvent,
  classifyCustomEvent,
  composeProjectedState,
  normalizeMessage,
  stableNamespaceSegment,
  unwrapCustomEvent,
} = await import(
  new URL("../event-stream-v3-adapter.ts", import.meta.url).href
);

test("unwrapCustomEvent returns the protocol custom payload", () => {
  const payload = {
    kind: "analytics",
    event_name: "graph.entry",
  };

  assert.deepEqual(
    unwrapCustomEvent({
      type: "event",
      method: "custom",
      params: {
        namespace: [],
        timestamp: 1,
        data: { payload },
      },
    }),
    payload,
  );
});

test("unwrapCustomEvent ignores malformed protocol envelopes", () => {
  assert.equal(unwrapCustomEvent(null), undefined);
  assert.equal(
    unwrapCustomEvent({
      type: "event",
      method: "values",
      params: {
        namespace: [],
        timestamp: 1,
        data: { payload: { type: "ui" } },
      },
    }),
    undefined,
  );
  assert.equal(
    unwrapCustomEvent({
      type: "event",
      method: "custom",
      params: {
        namespace: "root",
        timestamp: 1,
        data: { payload: { type: "ui" } },
      },
    }),
    undefined,
  );
  assert.equal(
    unwrapCustomEvent({
      type: "event",
      method: "custom",
      params: {
        namespace: [],
        timestamp: 1,
        data: {},
      },
    }),
    undefined,
  );
});

test("stableNamespaceSegment removes only the runtime suffix", () => {
  assert.equal(stableNamespaceSegment("food-agent:run-id"), "food-agent");
  assert.equal(stableNamespaceSegment("food-agent"), "food-agent");
  assert.equal(stableNamespaceSegment(":run-id"), "");
});

test("classifyCustomEvent routes UI events from root only", () => {
  const ui = {
    type: "ui",
    id: "card-1",
    name: "thinking_trace",
    props: {},
  };
  const removeUi = { type: "remove-ui", id: "card-1" };

  assert.equal(classifyCustomEvent(ui, []), "ui");
  assert.equal(classifyCustomEvent(removeUi, []), "ui");
  assert.equal(
    classifyCustomEvent(ui, ["family-main:run-id", "food-agent:run-id"]),
    undefined,
  );
});

test("classifyCustomEvent accepts analytics from root and children", () => {
  const analytics = {
    kind: "analytics",
    event_name: "graph.entry",
  };

  assert.equal(classifyCustomEvent(analytics, []), "analytics");
  assert.equal(
    classifyCustomEvent(analytics, ["family-main:run-id"]),
    "analytics",
  );
});

test("classifyCustomEvent accepts child thinking only for entry_added", () => {
  const reasoning = {
    kind: "thinking",
    event_name: "thinking.chunk",
  };
  const entryAdded = {
    kind: "thinking",
    event_name: "thinking.entry_added",
  };

  assert.equal(classifyCustomEvent(reasoning, []), "thinking");
  assert.equal(
    classifyCustomEvent(reasoning, ["family-main:run-id"]),
    undefined,
  );
  assert.equal(
    classifyCustomEvent(entryAdded, ["family-main:run-id"]),
    "thinking",
  );
});

test("classifyCustomEvent ignores unknown payloads", () => {
  assert.equal(classifyCustomEvent(null, []), undefined);
  assert.equal(classifyCustomEvent({ type: "unknown" }, []), undefined);
});

test("normalizeMessage preserves structured content and message metadata", () => {
  const message = new AIMessage({
    id: "ai-1",
    content: [{ type: "text", text: "hello" }],
    tool_calls: [
      {
        id: "tool-1",
        name: "search",
        args: { query: "weather" },
        type: "tool_call",
      },
    ],
    additional_kwargs: { reasoning_content: "checking" },
    response_metadata: { model: "test-model" },
  });

  assert.deepEqual(normalizeMessage(message), {
    id: "ai-1",
    type: "ai",
    content: [{ type: "text", text: "hello" }],
    tool_calls: [
      {
        id: "tool-1",
        name: "search",
        args: { query: "weather" },
        type: "tool_call",
      },
    ],
    invalid_tool_calls: [],
    additional_kwargs: { reasoning_content: "checking" },
    response_metadata: { model: "test-model" },
  });
});

test("normalizeMessage accepts an existing plain message without mutation", () => {
  const message = {
    id: "human-1",
    type: "human",
    content: "hello",
    additional_kwargs: {},
    response_metadata: {},
  };

  assert.deepEqual(normalizeMessage(message), message);
  assert.notEqual(normalizeMessage(message), message);
});

test("applyRootValues rejects child values", () => {
  const previous = {
    messages: [{ type: "human", content: "root" }],
    rootOnly: true,
  };
  const child = {
    messages: [{ type: "human", content: "child" }],
    childOnly: true,
  };

  assert.equal(
    applyRootValues(previous, child, ["food-agent:run-id"]),
    previous,
  );
  assert.equal(applyRootValues(previous, child, []), child);
});

test("composeProjectedState overlays one shared live message list", () => {
  const messages = [{ id: "ai-1", type: "ai", content: "streaming" }];
  const ui = [
    {
      type: "ui" as const,
      id: "card-1",
      name: "thinking_trace",
      props: {},
    },
  ];

  const values = composeProjectedState({
    rootValues: {
      messages: [{ id: "old", type: "ai", content: "old" }],
      context: { locale: "zh-CN" },
      ui: [],
    },
    messages,
    ui,
  });

  assert.equal(values.messages, messages);
  assert.equal(values.ui, ui);
  assert.deepEqual(values.context, { locale: "zh-CN" });
});

test("applyUiCustomEvent changes UI only for root events", () => {
  const initial = [
    {
      type: "ui" as const,
      id: "card-1",
      name: "thinking_trace",
      props: { status: "running" },
    },
  ];
  const replacement = {
    type: "ui" as const,
    id: "card-2",
    name: "choice",
    props: {},
  };

  assert.equal(
    applyUiCustomEvent(initial, replacement, ["food-agent:run-id"]),
    initial,
  );
  assert.deepEqual(applyUiCustomEvent(initial, replacement, []), [
    ...initial,
    replacement,
  ]);
  assert.deepEqual(
    applyUiCustomEvent(initial, { type: "remove-ui", id: "card-1" }, []),
    [],
  );
});
