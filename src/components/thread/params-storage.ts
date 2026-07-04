import type { CustomParams } from "./params-panel";

export const PARAMS_STORAGE_KEY = "agent-chat-ui:custom-params-draft";

export type StoredParamsDraft = CustomParams & {
  configurableText: string;
  inputText: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJsonObjectParse(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function buildStoredParamsDraft(args: {
  configurableText: string;
  inputText: string;
}): StoredParamsDraft {
  return {
    configurableText: args.configurableText,
    inputText: args.inputText,
    configurable: safeJsonObjectParse(args.configurableText),
    input: safeJsonObjectParse(args.inputText),
  };
}

export function parseStoredParamsDraft(
  text: string | null | undefined,
): StoredParamsDraft | null {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      return null;
    }

    const configurableText =
      typeof parsed.configurableText === "string" ? parsed.configurableText : "";
    const inputText =
      typeof parsed.inputText === "string" ? parsed.inputText : "";

    return buildStoredParamsDraft({
      configurableText,
      inputText,
    });
  } catch {
    return null;
  }
}

export function getStoredParamsDraftText(args: {
  configurableText: string;
  inputText: string;
}): string {
  return JSON.stringify({
    configurableText: args.configurableText,
    inputText: args.inputText,
  });
}
