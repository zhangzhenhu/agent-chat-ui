import test from "node:test";
import assert from "node:assert/strict";

const {
  buildStoredParamsDraft,
  parseStoredParamsDraft,
  getStoredParamsDraftText,
} = await import(new URL("../params-storage.ts", import.meta.url).href);

test("buildStoredParamsDraft keeps raw text and parsed values together", () => {
  const draft = buildStoredParamsDraft({
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
  });

  assert.deepEqual(draft, {
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
    configurable: { temperature: 0.7 },
    input: { user_name: "Alice" },
  });
});

test("buildStoredParamsDraft preserves invalid json text while clearing parsed values", () => {
  const draft = buildStoredParamsDraft({
    configurableText: '{"temperature":',
    inputText: "",
  });

  assert.deepEqual(draft, {
    configurableText: '{"temperature":',
    inputText: "",
    configurable: null,
    input: null,
  });
});

test("parseStoredParamsDraft restores only object-shaped payloads", () => {
  const draft = parseStoredParamsDraft(
    JSON.stringify({
      configurableText: '{\n  "temperature": 0.7\n}',
      inputText: '{\n  "user_name": "Alice"\n}',
    }),
  );

  assert.deepEqual(draft, {
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
    configurable: { temperature: 0.7 },
    input: { user_name: "Alice" },
  });
});

test("getStoredParamsDraftText serializes draft for localStorage", () => {
  const text = getStoredParamsDraftText({
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
  });

  assert.equal(
    text,
    JSON.stringify({
      configurableText: '{\n  "temperature": 0.7\n}',
      inputText: '{\n  "user_name": "Alice"\n}',
    }),
  );
});
