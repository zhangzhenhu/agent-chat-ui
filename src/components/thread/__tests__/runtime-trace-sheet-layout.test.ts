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
    /w-\[min\(96vw,1280px\)\].*max-w-none.*resize/s,
  );
});

test("runtime trace list uses flexible height with inner scrolling", () => {
  assert.match(
    runtimeTraceSheetSource,
    /min-h-0 flex-1 flex-col gap-3 overflow-y-auto/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /\[&::-webkit-scrollbar\]:w-2/,
  );
  assert.match(
    runtimeTraceSheetSource,
    /\[&::-webkit-scrollbar-thumb\]:rounded-full/,
  );
});

test("runtime trace row body constrains tall payloads with its own scroller", () => {
  assert.match(
    runtimeTraceSheetSource,
    /max-h-\[60vh\] overflow-auto overscroll-contain/,
  );
});
