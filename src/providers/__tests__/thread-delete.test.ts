import test from "node:test";
import assert from "node:assert/strict";

const {
  buildThreadDeleteErrorMessage,
  summarizeThreadDeleteSettledResults,
} = await import(new URL("../thread-delete.ts", import.meta.url).href);

test("summarizeThreadDeleteSettledResults keeps success and failure ownership by thread id", () => {
  const summary = summarizeThreadDeleteSettledResults(
    ["thread-1", "thread-2", "thread-3"],
    [
      { status: "fulfilled", value: undefined },
      { status: "rejected", reason: new Error("delete failed") },
      { status: "fulfilled", value: undefined },
    ],
  );

  assert.deepEqual(summary.successIds, ["thread-1", "thread-3"]);
  assert.deepEqual(summary.failedIds, ["thread-2"]);
});

test("buildThreadDeleteErrorMessage distinguishes total failure from partial failure", () => {
  assert.equal(buildThreadDeleteErrorMessage(3, 3), "删除失败");
  assert.equal(
    buildThreadDeleteErrorMessage(3, 1),
    "部分会话删除成功，仍有 1 条删除失败",
  );
});
