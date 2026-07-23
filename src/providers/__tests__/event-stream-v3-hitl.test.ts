import test from "node:test";
import assert from "node:assert/strict";

const { getInterruptResponseOptions } = await import(
  new URL("../interrupt-response.ts", import.meta.url).href
);

test("getInterruptResponseOptions targets a root interrupt explicitly", () => {
  assert.deepEqual(
    getInterruptResponseOptions({
      id: "interrupt-1",
      value: { question: "approve?" },
    }),
    {
      interruptId: "interrupt-1",
      namespace: [],
    },
  );
});

test("getInterruptResponseOptions preserves a nested protocol namespace", () => {
  assert.deepEqual(
    getInterruptResponseOptions({
      id: "interrupt-2",
      namespace: ["food-agent:run-id"],
    }),
    {
      interruptId: "interrupt-2",
      namespace: ["food-agent:run-id"],
    },
  );
});

test("getInterruptResponseOptions rejects an interrupt without an id", () => {
  assert.throws(
    () => getInterruptResponseOptions({ value: "missing id" }),
    /interrupt id/i,
  );
});
