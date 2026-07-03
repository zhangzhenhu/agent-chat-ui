import test from "node:test";
import assert from "node:assert/strict";

const { getThinkingStatusLabel } = await import(
  new URL("../thinking-trace-labels.ts", import.meta.url).href,
);

test("getThinkingStatusLabel returns localized labels", () => {
  assert.equal(getThinkingStatusLabel("pending"), "未开始");
  assert.equal(getThinkingStatusLabel("active"), "进行中");
  assert.equal(getThinkingStatusLabel("completed"), "已完成");
  assert.equal(getThinkingStatusLabel("waiting_user"), "等待你");
  assert.equal(getThinkingStatusLabel("failed"), "失败");
});
