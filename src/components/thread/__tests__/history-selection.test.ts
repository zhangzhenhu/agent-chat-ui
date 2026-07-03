import test from "node:test";
import assert from "node:assert/strict";

const { pruneSelectedThreadIds } = await import(
  new URL("../history/selection.ts", import.meta.url).href,
);

function thread(threadId: string) {
  return { thread_id: threadId };
}

test("pruneSelectedThreadIds removes ids that no longer exist in the thread list", () => {
  const next = pruneSelectedThreadIds(
    ["thread-2", "thread-1", "thread-missing"],
    [thread("thread-1"), thread("thread-2")] as never[],
  );

  assert.deepEqual(next, ["thread-2", "thread-1"]);
});

test("pruneSelectedThreadIds deduplicates while preserving the first surviving order", () => {
  const next = pruneSelectedThreadIds(
    ["thread-2", "thread-2", "thread-3", "thread-1"],
    [thread("thread-1"), thread("thread-2"), thread("thread-3")] as never[],
  );

  assert.deepEqual(next, ["thread-2", "thread-3", "thread-1"]);
});
