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

const threadIndexSource = await import("node:fs/promises").then((fs) =>
  fs.readFile(
    new URL("../index.tsx", import.meta.url),
    "utf8",
  ),
);

test("thinking trace header keeps runtime and telemetry but no longer includes thread state", () => {
  assert.doesNotMatch(thinkingTraceCardSource, /<ThreadStateSheet/);
  assert.match(thinkingTraceCardSource, /<RuntimeTraceSheet/);
  assert.match(thinkingTraceCardSource, /<AnalyticsSheet/);
});

test("thread index renders a thread workbench beside the chat surface", () => {
  assert.match(threadIndexSource, /<ThreadWorkbench/);
});

test("thread state dialog is wider and resizable", () => {
  assert.match(
    threadStateSheetSource,
    /w-\[min\(96vw,1280px\)\][\s\S]*max-w-none[\s\S]*resize/,
  );
});

test("thread state uses the shared code viewer for raw json", () => {
  assert.match(threadStateSheetSource, /<SyntaxHighlighter/);
  assert.match(threadStateSheetSource, /showLineNumbers/);
  assert.match(threadStateSheetSource, /Current State JSON/);
});
