import test from "node:test";
import assert from "node:assert/strict";

const thinkingTraceCardSource = await import("node:fs/promises").then((fs) =>
  fs.readFile(
    new URL("../thinking-trace-card.tsx", import.meta.url),
    "utf8",
  ),
);

const threadStateSheetSource = await import("node:fs/promises").then((fs) =>
  fs.readFile(
    new URL("../messages/thread-state-sheet.tsx", import.meta.url),
    "utf8",
  ),
);

test("thinking trace header includes thread state entry beside runtime and telemetry", () => {
  assert.match(thinkingTraceCardSource, /<ThreadStateSheet/);
});

test("thread state dialog is wider and resizable", () => {
  assert.match(
    threadStateSheetSource,
    /w-\[min\(96vw,1280px\)\].*max-w-none.*resize/s,
  );
});

test("thread state uses the shared code viewer for raw json", () => {
  assert.match(threadStateSheetSource, /<SyntaxHighlighter/);
  assert.match(threadStateSheetSource, /showLineNumbers/);
  assert.match(threadStateSheetSource, /Current State JSON/);
});
