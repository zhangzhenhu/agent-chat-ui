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
    /w-\[min\(96vw,1280px\)\].*max-w-none.*resize/s,
  );
});

test("analytics sheet json viewport owns scrolling and shows line numbers", () => {
  assert.match(
    analyticsSheetSource,
    /max-h-\[60vh\] overflow-auto overscroll-contain/,
  );
  assert.match(
    analyticsSheetSource,
    /\[&::-webkit-scrollbar\]:w-2/,
  );
  assert.match(
    analyticsSheetSource,
    /\[&::-webkit-scrollbar-thumb\]:rounded-full/,
  );
  assert.match(analyticsSheetSource, /showLineNumbers/);
  assert.match(analyticsSheetSource, /preTag="div"/);
});

test("analytics sheet event list exposes a visible vertical scroller", () => {
  assert.match(
    analyticsSheetSource,
    /overflow-y-auto px-6 py-4 \[&::-webkit-scrollbar\]:w-2/,
  );
});

test("syntax highlighter supports analytics-specific viewport overrides", () => {
  assert.match(syntaxHighlighterSource, /customStyle\?: CSSProperties;/);
  assert.match(syntaxHighlighterSource, /showLineNumbers\?: boolean;/);
  assert.match(syntaxHighlighterSource, /preTag\?: ElementType;/);
});
