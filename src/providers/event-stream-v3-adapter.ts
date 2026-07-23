import { isBaseMessage } from "@langchain/core/messages";
import { toMessageDict } from "@langchain/langgraph-sdk/ui";
import {
  isRemoveUIMessage,
  isUIMessage,
  uiMessageReducer,
  type RemoveUIMessage,
  type UIMessage,
} from "@langchain/langgraph-sdk/react-ui";

export type AppMessage = {
  id?: string;
  type: string;
  content: unknown;
  tool_calls?: unknown[];
  invalid_tool_calls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ProjectedState = Record<string, unknown> & {
  messages: AppMessage[];
  ui: UIMessage[];
};

export type CustomEventKind = "ui" | "analytics" | "thinking";

export function isRootProtocolNamespace(namespace: unknown): namespace is [] {
  return Array.isArray(namespace) && namespace.length === 0;
}

export function stableNamespaceSegment(segment: string): string {
  const separator = segment.indexOf(":");
  return separator === -1 ? segment : segment.slice(0, separator);
}

export function unwrapCustomEvent(event: unknown): unknown | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }

  const envelope = event as Record<string, unknown>;
  if (envelope.type !== "event" || envelope.method !== "custom") {
    return undefined;
  }

  const params = envelope.params;
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const { namespace, data } = params as Record<string, unknown>;
  if (
    !Array.isArray(namespace) ||
    !namespace.every((segment) => typeof segment === "string") ||
    !data ||
    typeof data !== "object" ||
    !Object.prototype.hasOwnProperty.call(data, "payload")
  ) {
    return undefined;
  }

  return (data as Record<string, unknown>).payload;
}

export function classifyCustomEvent(
  payload: unknown,
  namespace: string[],
): CustomEventKind | undefined {
  const isRoot = isRootProtocolNamespace(namespace);

  if (isUIMessage(payload) || isRemoveUIMessage(payload)) {
    return isRoot ? "ui" : undefined;
  }

  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const event = payload as Record<string, unknown>;
  if (event.kind === "analytics" || event.type === "telemetry") {
    return "analytics";
  }

  if (event.kind === "thinking" || event.type === "thinking") {
    return isRoot || event.event_name === "thinking.entry_added"
      ? "thinking"
      : undefined;
  }

  return undefined;
}

export function normalizeMessage(message: unknown): AppMessage {
  if (isBaseMessage(message)) {
    return toMessageDict(message) as AppMessage;
  }

  if (
    !message ||
    typeof message !== "object" ||
    typeof (message as { type?: unknown }).type !== "string" ||
    !Object.prototype.hasOwnProperty.call(message, "content")
  ) {
    throw new TypeError("Expected a LangGraph message");
  }

  return { ...(message as AppMessage) };
}

export function applyRootValues<T extends Record<string, unknown>>(
  previous: T,
  next: T,
  namespace: unknown,
): T {
  return isRootProtocolNamespace(namespace) ? next : previous;
}

export function composeProjectedState({
  rootValues,
  messages,
  ui,
}: {
  rootValues: Record<string, unknown>;
  messages: AppMessage[];
  ui: UIMessage[];
}): ProjectedState {
  return {
    ...rootValues,
    messages,
    ui,
  };
}

export function applyUiCustomEvent(
  current: UIMessage[],
  payload: unknown,
  namespace: string[],
): UIMessage[] {
  if (
    !isRootProtocolNamespace(namespace) ||
    (!isUIMessage(payload) && !isRemoveUIMessage(payload))
  ) {
    return current;
  }

  return uiMessageReducer(current, payload as UIMessage | RemoveUIMessage);
}
