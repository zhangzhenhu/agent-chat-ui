import test from "node:test";
import assert from "node:assert/strict";

const analyticsSheetSource = await import(
  "node:fs/promises"
).then((fs) =>
  fs.readFile(
    new URL("../messages/analytics-sheet.tsx", import.meta.url),
    "utf8",
  ),
);

const syntaxHighlighterSource = await import(
  "node:fs/promises"
).then((fs) =>
  fs.readFile(
    new URL("../syntax-highlighter.tsx", import.meta.url),
    "utf8",
  ),
);

test("analytics sheet dialog is wider and resizable", () => {
  assert.match(
    analyticsSheetSource,
    /!flex h-\[85vh\] w-\[min\(96vw,1280px\)\].*max-w-none.*resize.*overflow-y-scroll/s,
  );
});

test("analytics sheet json viewport owns scrolling and shows line numbers", () => {
  assert.match(
    analyticsSheetSource,
    /max-h-\[60vh\].*overflow-x-auto.*overflow-y-scroll.*overscroll-contain/s,
  );
  assert.match(
    analyticsSheetSource,
    /select-text/,
  );
  assert.match(
    analyticsSheetSource,
    /\[&::-webkit-scrollbar\]:w-2/,
  );
  assert.match(
    analyticsSheetSource,
    /\[&::-webkit-scrollbar-thumb\]:rounded-full/,
  );
  assert.match(
    analyticsSheetSource,
    /scrollbarGutter: "stable both-edges"/,
  );
  assert.match(
    analyticsSheetSource,
    /padding: "1rem 1rem 2rem"/,
  );
  assert.match(analyticsSheetSource, /showLineNumbers/);
  assert.match(analyticsSheetSource, /preTag="div"/);
});

test("analytics event json header exposes a copy action", () => {
  assert.match(
    analyticsSheetSource,
    /Copy JSON/,
  );
  assert.match(
    analyticsSheetSource,
    /navigator\.clipboard\.writeText/,
  );
  assert.match(
    analyticsSheetSource,
    /handleCopy/,
  );
});

test("analytics sheet event list exposes a visible vertical scroller", () => {
  assert.match(
    analyticsSheetSource,
    /DialogContent[\s\S]*overflow-y-scroll[\s\S]*\[&::-webkit-scrollbar\]:w-2/,
  );
  assert.match(
    analyticsSheetSource,
    /style=\{\{ scrollbarGutter: "stable" \}\}/,
  );
  assert.match(
    analyticsSheetSource,
    /sticky top-0 z-10 border-b border-slate-200 bg-white/,
  );
});

test("analytics rows do not shrink when the dialog viewport is crowded", () => {
  assert.match(
    analyticsSheetSource,
    /className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white"/,
  );
  assert.match(
    analyticsSheetSource,
    /className="flex shrink-0 flex-col gap-3 px-6 py-4"/,
  );
});

test("analytics sheet labels telemetry as a unified timeline and surfaces event metadata", () => {
  assert.match(
    analyticsSheetSource,
    /Unified timeline across root and child telemetry events/,
  );
  assert.match(
    analyticsSheetSource,
    /run \${runId}/,
  );
  assert.match(
    analyticsSheetSource,
    /tool \${toolCallId}/,
  );
});

test("syntax highlighter supports analytics-specific viewport overrides", () => {
  assert.match(syntaxHighlighterSource, /customStyle\?: CSSProperties;/);
  assert.match(syntaxHighlighterSource, /showLineNumbers\?: boolean;/);
  assert.match(syntaxHighlighterSource, /preTag\?: ElementType;/);
});
