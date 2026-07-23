export type InterruptResponseOptions = {
  interruptId: string;
  namespace: string[];
};

export function getInterruptResponseOptions(
  interrupt: unknown,
): InterruptResponseOptions {
  if (!interrupt || typeof interrupt !== "object") {
    throw new Error("Cannot respond without an interrupt id");
  }

  const candidate = interrupt as {
    id?: unknown;
    namespace?: unknown;
    ns?: unknown;
  };
  if (typeof candidate.id !== "string" || !candidate.id) {
    throw new Error("Cannot respond without an interrupt id");
  }

  const namespace = candidate.namespace ?? candidate.ns ?? [];
  if (
    !Array.isArray(namespace) ||
    !namespace.every((segment) => typeof segment === "string")
  ) {
    throw new Error("Interrupt namespace must be a string array");
  }

  return {
    interruptId: candidate.id,
    namespace,
  };
}
