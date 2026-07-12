import test from "node:test";
import assert from "node:assert/strict";

const {
  buildTranscriptBlocks,
  getInternalTraceEntries,
  getInternalTraceEntriesForRun,
  mapHistoricalThinkingTraceCards,
  mergeThinkingTraceCards,
  resolveThinkingTrace,
  resolveThinkingTraceCards,
  splitTranscriptBlocksForThinking,
} = await import(
  new URL("../process-trace-helpers.ts", import.meta.url).href
);
import type { Message } from "@langchain/langgraph-sdk";
import type { TranscriptBlock } from "../process-trace-helpers";

function humanMessage(id: string, text: string): Message {
  return {
    id,
    type: "human",
    content: text,
  };
}

function aiMessage(id: string, text: string): Message {
  return {
    id,
    type: "ai",
    content: text,
  };
}

test("buildTranscriptBlocks keeps thinking out of transcript ordering", () => {
  const blocks: TranscriptBlock[] = buildTranscriptBlocks({
    messages: [humanMessage("h1", "你好"), aiMessage("a1", "最终回答")],
  });

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["human", "assistant"],
  );
});

test("buildTranscriptBlocks only emits visible human and assistant messages", () => {
  const blocks: TranscriptBlock[] = buildTranscriptBlocks({
    messages: [
      humanMessage("h1", "你好"),
      aiMessage("a1", "中间回答"),
      aiMessage("a2", "最终回答"),
    ],
  });

  assert.deepEqual(
    blocks.map((block: TranscriptBlock) =>
      block.kind === "assistant" ? `${block.kind}:${block.message.id}` : block.kind,
    ),
    ["human", "assistant:a1", "assistant:a2"],
  );
});

test("buildTranscriptBlocks skips ai messages that still contain tool calls", () => {
  const blocks: TranscriptBlock[] = buildTranscriptBlocks({
    messages: [
      humanMessage("h1", "你好"),
      {
        id: "a-tool",
        type: "ai",
        content: "这条不应进入正式 transcript",
        tool_calls: [
          {
            id: "call_1",
            name: "search_food",
            args: { query: "晚饭" },
            type: "tool_call",
          },
        ],
      } as Message,
      aiMessage("a-final", "最终回答"),
    ],
  });

  assert.deepEqual(
    blocks.map((block: TranscriptBlock) =>
      block.kind === "assistant" ? `${block.kind}:${block.message.id}` : block.kind,
    ),
    ["human", "assistant:a-final"],
  );
});

test("resolveThinkingTrace prefers the latest thinking card in ui state", () => {
  const resolved = resolveThinkingTrace([
    {
      type: "ui",
      id: "thinking:run-1",
      name: "thinking_trace",
      props: { status: "completed", current_phase_id: "result", steps: [] },
      metadata: { run_id: "run-1" },
    },
    {
      type: "ui",
      id: "thinking:run-2",
      name: "thinking_trace",
      props: { status: "active", current_phase_id: "intent", steps: [] },
      metadata: { run_id: "run-2" },
    },
  ]);

  assert.equal(resolved.runId, "run-2");
  assert.deepEqual(resolved.snapshot, {
    status: "active",
    current_phase_id: "intent",
    steps: [],
  });
});

test("resolveThinkingTraceCards keeps all durable thinking cards with run and message ids", () => {
  const cards = resolveThinkingTraceCards([
    {
      type: "ui",
      id: "thinking:run-1",
      name: "thinking_trace",
      props: { status: "completed", current_phase_id: "result", steps: [] },
      metadata: { run_id: "run-1", message_id: "human-1" },
    },
    {
      type: "ui",
      id: "thinking:run-2",
      name: "thinking_trace",
      props: { status: "active", current_phase_id: "intent", steps: [] },
      metadata: { run_id: "run-2", message_id: "human-2" },
    },
  ]);

  assert.deepEqual(cards, [
    {
      uiId: "thinking:run-1",
      runId: "run-1",
      messageId: "human-1",
      snapshot: {
        status: "completed",
        current_phase_id: "result",
        steps: [],
      },
    },
    {
      uiId: "thinking:run-2",
      runId: "run-2",
      messageId: "human-2",
      snapshot: {
        status: "active",
        current_phase_id: "intent",
        steps: [],
      },
    },
  ]);
});

test("mapHistoricalThinkingTraceCards maps by explicit message id and falls back by human turn order", () => {
  const mapped = mapHistoricalThinkingTraceCards({
    humanMessageIds: ["human-1", "human-2", "human-3"],
    cards: [
      {
        uiId: "thinking:run-1",
        runId: "run-1",
        messageId: "human-1",
        snapshot: { status: "completed", current_phase_id: "result", steps: [] },
      },
      {
        uiId: "thinking:run-2",
        runId: "run-2",
        messageId: "",
        snapshot: { status: "completed", current_phase_id: "result", steps: [] },
      },
    ],
  });

  assert.deepEqual(Object.keys(mapped), ["human-1", "human-2"]);
  assert.equal(mapped["human-1"]?.[0]?.runId, "run-1");
  assert.equal(mapped["human-2"]?.[0]?.runId, "run-2");
});

test("mergeThinkingTraceCards preserves history order and upserts the latest card by ui id", () => {
  const merged = mergeThinkingTraceCards(
    [
      {
        uiId: "thinking:run-1",
        runId: "run-1",
        messageId: "human-1",
        snapshot: { status: "completed", current_phase_id: "result", steps: [] },
      },
    ],
    [
      {
        uiId: "thinking:run-1",
        runId: "run-1",
        messageId: "human-1",
        snapshot: { status: "completed", current_phase_id: "done", steps: [] },
      },
      {
        uiId: "thinking:run-2",
        runId: "run-2",
        messageId: "human-2",
        snapshot: { status: "active", current_phase_id: "intent", steps: [] },
      },
    ],
  );

  assert.deepEqual(
    merged.map((card: { uiId: string; runId: string; snapshot: { current_phase_id?: string } }) => ({
      uiId: card.uiId,
      runId: card.runId,
      phase: card.snapshot.current_phase_id,
    })),
    [
      {
        uiId: "thinking:run-1",
        runId: "run-1",
        phase: "done",
      },
      {
        uiId: "thinking:run-2",
        runId: "run-2",
        phase: "intent",
      },
    ],
  );
});

test("splitTranscriptBlocksForThinking places the thinking panel after the latest human block", () => {
  const blocks: TranscriptBlock[] = buildTranscriptBlocks({
    messages: [
      humanMessage("h1", "旧问题"),
      aiMessage("a1", "旧回答"),
      humanMessage("h2", "新问题"),
      aiMessage("a2", "新回答"),
    ],
  });

  const split = splitTranscriptBlocksForThinking(blocks);

  assert.deepEqual(
    split.beforeThinking.map((block: TranscriptBlock) => `${block.kind}:${block.message.id}`),
    ["human:h1", "assistant:a1", "human:h2"],
  );
  assert.deepEqual(
    split.afterThinking.map((block: TranscriptBlock) => `${block.kind}:${block.message.id}`),
    ["assistant:a2"],
  );
});

test("getInternalTraceEntries only keeps tool calls and tool results for runtime trace", () => {
  const entries = getInternalTraceEntries(
    [
      humanMessage("h1", "你好"),
      {
        id: "a1",
        type: "ai",
        content: "最终回答",
        metadata: { run_id: "run-1" },
        tool_calls: [
          {
            id: "call_1",
            name: "search_food",
            args: { query: "晚饭" },
            type: "tool_call",
          },
        ],
      } as Message,
      {
        id: "tool-1",
        type: "tool",
        content: "返回结果",
        tool_call_id: "call_1",
        name: "search_food",
      } as Message,
    ],
    false,
  );

  assert.deepEqual(
    entries.map((entry: { kind: string; key: string; runId?: string }) =>
      `${entry.kind}:${entry.key}:${entry.runId ?? ""}`,
    ),
    [
      "tool_call:tool_call:a1:call_1:search_food:run-1",
      "tool_result:tool_result:tool-1:run-1",
    ],
  );
});

test("getInternalTraceEntriesForRun only keeps entries for the requested run", () => {
  const entries = getInternalTraceEntries(
    [
      {
        id: "a1",
        type: "ai",
        content: "工具调用 1",
        metadata: { run_id: "run-1" },
        tool_calls: [
          {
            id: "call_1",
            name: "search_food",
            args: { query: "晚饭" },
            type: "tool_call",
          },
        ],
      } as Message,
      {
        id: "tool-1",
        type: "tool",
        content: "返回结果 1",
        tool_call_id: "call_1",
        name: "search_food",
      } as Message,
      {
        id: "a2",
        type: "ai",
        content: "工具调用 2",
        metadata: { run_id: "run-2" },
        tool_calls: [
          {
            id: "call_2",
            name: "search_gas",
            args: { query: "缴费" },
            type: "tool_call",
          },
        ],
      } as Message,
      {
        id: "tool-2",
        type: "tool",
        content: "返回结果 2",
        tool_call_id: "call_2",
        name: "search_gas",
      } as Message,
    ],
    false,
  );

  const result = getInternalTraceEntriesForRun(entries, "run-2");

  assert.deepEqual(
    result.map((entry: { kind: string; key: string }) => `${entry.kind}:${entry.key}`),
    [
      "tool_call:tool_call:a2:call_2:search_gas",
      "tool_result:tool_result:tool-2",
    ],
  );
});
