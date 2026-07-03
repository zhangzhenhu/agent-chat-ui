import test from "node:test";
import assert from "node:assert/strict";

const { composeStreamContextValue } = await import(
  new URL("../stream-context-value.ts", import.meta.url).href,
);

test("composeStreamContextValue does not eagerly read stream getters", () => {
  let getterReads = 0;
  const streamValue = Object.defineProperty({}, "messages", {
    enumerable: true,
    get() {
      getterReads += 1;
      return ["m1"];
    },
  });

  const contextValue = composeStreamContextValue(streamValue, {
    analyticsState: { byRunId: {}, latestRunId: null },
    thinkingState: { byRunId: {} },
  });

  assert.equal(getterReads, 0);
  assert.deepEqual(contextValue.analyticsState, { byRunId: {}, latestRunId: null });
  assert.deepEqual(contextValue.thinkingState, { byRunId: {} });
  assert.deepEqual(contextValue.messages, ["m1"]);
  assert.equal(getterReads, 1);
});
