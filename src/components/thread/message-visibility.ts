import type { Message } from "@langchain/langgraph-sdk";

export const USER_VISIBLE_KEY = "user_visible";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isUserVisibleAiMessage(message: Message): boolean {
  if (message.type !== "ai") {
    return false;
  }

  const additionalKwargs = (message as { additional_kwargs?: unknown })
    .additional_kwargs;
  return (
    isRecord(additionalKwargs) && additionalKwargs[USER_VISIBLE_KEY] === true
  );
}

export function isUserVisibleUiMessage(item: unknown): boolean {
  if (!isRecord(item) || item.type !== "ui" || !isRecord(item.metadata)) {
    return false;
  }

  return item.metadata[USER_VISIBLE_KEY] === true;
}
