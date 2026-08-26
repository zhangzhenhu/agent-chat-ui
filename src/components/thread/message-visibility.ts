import type { Message } from "@langchain/langgraph-sdk";

export const USER_VISIBLE_KEYS = [
  "user_visible",
  "familyagent_user_visible",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasUserVisibleFlag(metadata: Record<string, unknown>): boolean {
  return USER_VISIBLE_KEYS.some((key) => metadata[key] === true);
}

export function isUserVisibleAiMessage(message: Message): boolean {
  if (message.type !== "ai") {
    return false;
  }

  const additionalKwargs = (message as { additional_kwargs?: unknown })
    .additional_kwargs;
  return isRecord(additionalKwargs) && hasUserVisibleFlag(additionalKwargs);
}

export function isUserVisibleHumanMessage(message: Message): boolean {
  if (message.type !== "human") {
    return false;
  }

  const additionalKwargs = (message as { additional_kwargs?: unknown })
    .additional_kwargs;
  if (!isRecord(additionalKwargs)) {
    return true;
  }

  // User input is unmarked; only explicitly internal synthetic messages are hidden.
  return !USER_VISIBLE_KEYS.some((key) => additionalKwargs[key] === false);
}

export function isUserVisibleUiMessage(item: unknown): boolean {
  if (!isRecord(item) || item.type !== "ui" || !isRecord(item.metadata)) {
    return false;
  }

  return hasUserVisibleFlag(item.metadata);
}
