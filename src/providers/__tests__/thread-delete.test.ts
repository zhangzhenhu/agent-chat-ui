import test from "node:test";
import assert from "node:assert/strict";

const {
  getThreadDeletionDisabledReason,
} = await import(new URL("../thread-delete.ts", import.meta.url).href);

test("thread deletion is disabled for demandintel production hosts", () => {
  assert.match(
    getThreadDeletionDisabledReason("https://demandintel.ecej.com") ?? "",
    /禁止/,
  );
  assert.match(
    getThreadDeletionDisabledReason("https://sidemandintel.ecej.com") ?? "",
    /禁止/,
  );
});

test("thread deletion remains enabled for non-demandintel hosts", () => {
  assert.equal(
    getThreadDeletionDisabledReason("http://127.0.0.1:8000"),
    null,
  );
  assert.equal(
    getThreadDeletionDisabledReason("https://example.com/api"),
    null,
  );
});
