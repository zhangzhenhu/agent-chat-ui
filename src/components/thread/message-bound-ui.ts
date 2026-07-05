import type { Message } from "@langchain/langgraph-sdk";
import type { UIMessage } from "@langchain/langgraph-sdk/react-ui";

type MessageBoundUiCandidate = {
  type?: string;
  name?: string;
  metadata?: {
    message_id?: string;
  };
};

const SYSTEM_UI_NAMES = new Set(["thinking_trace"]);

export function isMessageBoundUiForMessage(
  item: unknown,
  messageId: string | undefined,
): item is UIMessage {
  if (!messageId || !item || typeof item !== "object") {
    return false;
  }
  const candidate = item as MessageBoundUiCandidate;
  if (candidate.name && SYSTEM_UI_NAMES.has(candidate.name)) {
    return false;
  }
  return (
    candidate.type === "ui" &&
    candidate.metadata?.message_id === messageId
  );
}

export function getMessageBoundUiMessages(
  ui: unknown[] | undefined,
  message: Message,
): UIMessage[] {
  return (ui ?? []).filter((item): item is UIMessage =>
    isMessageBoundUiForMessage(item, message.id),
  );
}

export function hasMessageBoundUi(
  ui: unknown[] | undefined,
  message: Message,
): boolean {
  return getMessageBoundUiMessages(ui, message).length > 0;
}
