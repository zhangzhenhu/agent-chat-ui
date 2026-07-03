import test from "node:test";
import assert from "node:assert/strict";

const {
  buildTranscriptBlocks,
  getInternalTraceEntries,
  resolveThinkingTrace,
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
    entries.map((entry: { kind: string; key: string }) => `${entry.kind}:${entry.key}`),
    [
      "tool_call:tool_call:a1:call_1:search_food",
      "tool_result:tool_result:tool-1",
    ],
  );
});
