import test from "node:test";
import assert from "node:assert/strict";

const { buildSubmitConfig } = await import(
  new URL("../submit-config.ts", import.meta.url).href,
);

test("buildSubmitConfig enables telemetry sse by default", () => {
  assert.deepEqual(buildSubmitConfig(null), {
    configurable: {
      emit_telemetry_to_sse: true,
    },
  });
});

test("buildSubmitConfig preserves existing configurable fields", () => {
  assert.deepEqual(
    buildSubmitConfig({
      temperature: 0.7,
      user_name: "Alice",
    }),
    {
      configurable: {
        temperature: 0.7,
        user_name: "Alice",
        emit_telemetry_to_sse: true,
      },
    },
  );
});

test("buildSubmitConfig forces telemetry sse on even when caller disables it", () => {
  assert.deepEqual(
    buildSubmitConfig({
      emit_telemetry_to_sse: false,
      model: "gpt-5",
    }),
    {
      configurable: {
        emit_telemetry_to_sse: true,
        model: "gpt-5",
      },
    },
  );
});
