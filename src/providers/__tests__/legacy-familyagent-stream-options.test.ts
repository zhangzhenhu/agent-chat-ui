import test from "node:test";
import assert from "node:assert/strict";

const { withLegacyFamilyAgentStreamOptions } = await import(
  new URL("../legacy-familyagent-stream-options.ts", import.meta.url).href
);

test("legacy FamilyAgent options retain caller settings and request SDK-compatible projected messages", () => {
  const options = withLegacyFamilyAgentStreamOptions({
    command: { resume: "choice-1" },
    streamMode: ["values" as const],
    streamResumable: true,
  });

  assert.deepEqual(options.streamMode, ["values", "custom", "messages-tuple"]);
  assert.equal(options.streamSubgraphs, true);
  assert.equal(options.streamResumable, true);
  assert.deepEqual(options.command, { resume: "choice-1" });
});

test("legacy FamilyAgent options do not duplicate stream modes", () => {
  const options = withLegacyFamilyAgentStreamOptions({
    streamMode: ["messages-tuple" as const, "custom" as const],
  });

  assert.deepEqual(options.streamMode, ["messages-tuple", "custom", "values"]);
});
