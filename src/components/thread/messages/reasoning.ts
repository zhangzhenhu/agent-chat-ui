import type { Message } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";

/**
 * Extract reasoning content from a message.
 *
 * Reasoning content lives in ``additional_kwargs.reasoning_content``
 * after being injected by ``ReasoningChatOpenAI`` on the backend.
 * This function is the single point of extraction — if the backend
 * changes the storage format, only this function needs to update.
 */
export function getReasoningContent(message: {
  content: unknown;
  additional_kwargs?: Record<string, unknown>;
}): string | null {
  const reasoning = (message.additional_kwargs as any)?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim().length > 0) {
    return reasoning;
  }
  return null;
}

/**
 * Check if a message has reasoning content available.
 */
export function hasReasoning(message: {
  content: unknown;
  additional_kwargs?: Record<string, unknown>;
}): boolean {
  return getReasoningContent(message) !== null;
}

/**
 * Get the display text from a message, excluding reasoning.
 * Uses the same logic as getContentString but also checks
 * ``additional_kwargs.reasoning_content``.
 */
export function getDisplayContent(content: unknown): string {
  return getContentString(content as Message["content"]);
}