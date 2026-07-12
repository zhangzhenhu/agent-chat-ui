import test from "node:test";
import assert from "node:assert/strict";

const cardSource = await import("node:fs/promises").then((fs) =>
  fs.readFile(
    new URL("../generative-ui/card.tsx", import.meta.url),
    "utf8",
  ),
);

test("card ui renders string data through MarkdownText", () => {
  assert.match(cardSource, /import \{ MarkdownText \} from "\.\.\/markdown-text";/);
  assert.match(cardSource, /if \(typeof data === "string"\) \{\s+return <MarkdownText>\{data\}<\/MarkdownText>;/);
});
