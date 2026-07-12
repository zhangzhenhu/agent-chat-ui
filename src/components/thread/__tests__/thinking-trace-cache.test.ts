import test from "node:test";
import assert from "node:assert/strict";

const {
  parseThinkingTraceCache,
} = await import(new URL("../thinking-trace-cache.ts", import.meta.url).href);

test("parseThinkingTraceCache returns empty object for invalid payloads", () => {
  assert.deepEqual(parseThinkingTraceCache(null), {});
  assert.deepEqual(parseThinkingTraceCache("not-json"), {});
  assert.deepEqual(parseThinkingTraceCache("[]"), {});
});

test("parseThinkingTraceCache keeps valid thread-scoped thinking cards", () => {
  const cache = parseThinkingTraceCache(
    JSON.stringify({
      "thread-1": [
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
      ],
      "thread-2": [
        {
          broken: true,
        },
      ],
    }),
  );

  assert.deepEqual(cache, {
    "thread-1": [
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
    ],
  });
});
