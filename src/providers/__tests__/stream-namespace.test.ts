import test from "node:test";
import assert from "node:assert/strict";

const { isRootProtocolNamespace } = await import(
  new URL("../event-stream-v3-adapter.ts", import.meta.url).href
);

test("isRootProtocolNamespace accepts only the empty namespace", () => {
  assert.equal(isRootProtocolNamespace([]), true);
  assert.equal(isRootProtocolNamespace(undefined), false);
  assert.equal(isRootProtocolNamespace(null), false);
  assert.equal(isRootProtocolNamespace(""), false);
  assert.equal(isRootProtocolNamespace(["family-main:run-id"]), false);
});

test("isRootProtocolNamespace does not inspect legacy namespace strings", () => {
  assert.equal(isRootProtocolNamespace(["family-main|tools|food-need"]), false);
  assert.equal(
    isRootProtocolNamespace([
      "family-main:run-id",
      "family-main|tools|food-need",
    ]),
    false,
  );
});
