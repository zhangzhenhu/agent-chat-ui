import type { Message, Thread } from "@langchain/langgraph-sdk";

/**
 * Extracts a string summary from a message's content, supporting multimodal (text, image, file, etc.).
 * - If text is present, returns the joined text.
 * - If not, returns a label for the first non-text modality (e.g., 'Image', 'Other').
 * - If unknown, returns 'Multimodal message'.
 */
export function getContentString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  const texts = content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text);
  return texts.join(" ");
}

/**
 * Resolves the display label for a thread in the history sidebar.
 * Priority:
 *   1. A user-set custom name stored in `metadata.user_title` (set via Rename).
 *   2. The first message's text content.
 *   3. The raw thread id as a last resort.
 */
export function getThreadTitle(t: Thread): string {
  const customTitle = t.metadata?.user_title;
  if (typeof customTitle === "string" && customTitle.trim().length > 0) {
    return customTitle;
  }
  if (
    typeof t.values === "object" &&
    t.values &&
    "messages" in t.values &&
    Array.isArray(t.values.messages) &&
    t.values.messages?.length > 0
  ) {
    const firstMessage = t.values.messages[0];
    return getContentString(firstMessage.content);
  }
  return t.thread_id;
}
