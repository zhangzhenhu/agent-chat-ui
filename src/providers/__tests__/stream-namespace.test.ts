import test from "node:test";
import assert from "node:assert/strict";

const { isRootStreamNamespace, shouldAcceptThinkingNamespace } = await import(
  new URL("../stream-context-value.ts", import.meta.url).href,
);

test("isRootStreamNamespace accepts root stream events", () => {
  assert.equal(isRootStreamNamespace(undefined), true);
  assert.equal(isRootStreamNamespace([]), true);
  assert.equal(
    isRootStreamNamespace(["family-main:6c1e18e4-8b8f-54e4-1e9d-03654ecdef07"]),
    true,
  );
});

test("isRootStreamNamespace rejects child tool namespaces", () => {
  assert.equal(
    isRootStreamNamespace(["family-main|tools|food-need"]),
    false,
  );
  assert.equal(
    isRootStreamNamespace([
      "family-main:6c1e18e4-8b8f-54e4-1e9d-03654ecdef07",
      "family-main|tools|food-need",
    ]),
    false,
  );
});

test("shouldAcceptThinkingNamespace allows child tool namespaces", () => {
  assert.equal(shouldAcceptThinkingNamespace(undefined), true);
  assert.equal(
    shouldAcceptThinkingNamespace(["family-main|tools|food-need"]),
    true,
  );
  assert.equal(
    shouldAcceptThinkingNamespace([
      "family-main:6c1e18e4-8b8f-54e4-1e9d-03654ecdef07",
      "family-main|tools|food-need",
    ]),
    true,
  );
});
