export function buildSubmitConfig(
  configurable: Record<string, unknown> | null | undefined,
): {
  configurable: Record<string, unknown>;
} {
  return {
    configurable: {
      ...(configurable ?? {}),
      emit_telemetry_to_sse: true,
    },
  };
}
