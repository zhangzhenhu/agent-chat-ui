import test from "node:test";
import assert from "node:assert/strict";

const runtimeTraceSheetSource = await import("node:fs/promises").then((fs) =>
  fs.readFile(
    new URL("../messages/runtime-trace-sheet.tsx", import.meta.url),
    "utf8",
  ),
);

test("runtime trace dialog is wider and resizable", () => {
  assert.match(
    runtimeTraceSheetSource,
    /!flex h-\[85vh\] w-\[min\(96vw,1280px\)\][\s\S]*max-w-none[\s\S]*resize[\s\S]*overflow-y-scroll/,
  );
});

test("runtime trace list uses flexible height with inner scrolling", () => {
  assert.match(
    runtimeTraceSheetSource,
    /DialogContent[\s\S]*overflow-y-scroll[\s\S]*\[&::-webkit-scrollbar\]:w-2/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /style=\{\{ scrollbarGutter: "stable" \}\}/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /sticky top-0 z-10 border-b border-slate-200 bg-white/,
  );
});

test("runtime trace rows do not shrink when the dialog viewport is crowded", () => {
  assert.match(
    runtimeTraceSheetSource,
    /className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white"/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /className="flex shrink-0 flex-col gap-3 px-6 py-4"/,
  );
});

test("runtime trace row body constrains tall payloads with its own scroller", () => {
  assert.match(
    runtimeTraceSheetSource,
    /max-h-\[60vh\][\s\S]*overflow-x-auto[\s\S]*overflow-y-scroll[\s\S]*overscroll-contain/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /select-text/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /scrollbarGutter: "stable both-edges"/,
  );
});

test("runtime trace row body exposes a copy action", () => {
  assert.match(
    runtimeTraceSheetSource,
    /Copy JSON/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /navigator\.clipboard\.writeText/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /handleCopy/,
  );
});
