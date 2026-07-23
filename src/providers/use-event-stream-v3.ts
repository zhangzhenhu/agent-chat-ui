import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Client } from "@langchain/langgraph-sdk";
import {
  StreamController,
  type Event,
  type MessageMetadata,
  type ProjectionSpec,
  type RootSnapshot,
  type StreamRespondAllOptions,
  type StreamRespondOptions,
  type StreamStopOptions,
  type StreamSubmitOptions,
} from "@langchain/langgraph-sdk/stream";
import type { UIMessage } from "@langchain/langgraph-sdk/react-ui";
import {
  appendAnalyticsEvent,
  EMPTY_ANALYTICS_STATE,
  type AnalyticsState,
} from "../components/thread/analytics-state.ts";
import type {
  AnalyticsEventEnvelope,
  ThinkingEventEnvelope,
} from "../components/thread/analytics-types.ts";
import {
  appendThinkingEvent,
  EMPTY_THINKING_STATE,
  type ThinkingState,
} from "../components/thread/thinking-state.ts";
import {
  applyUiCustomEvent,
  classifyCustomEvent,
  composeProjectedState,
  normalizeMessage,
  unwrapCustomEvent,
  type AppMessage,
  type ProjectedState,
} from "./event-stream-v3-adapter.ts";

type Configurable = Record<string, unknown>;
type SubmitOptions = StreamSubmitOptions<ProjectedState, Configurable>;
type RespondOptions = StreamRespondOptions<Configurable>;
type RespondAllOptions = StreamRespondAllOptions<Configurable>;

type ObservableStore<T> = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
};

type AcquiredProjection<T> = {
  store: ObservableStore<T>;
  release(): void;
};

type ControllerLike = {
  rootStore: ObservableStore<RootSnapshot<Record<string, unknown>, unknown>>;
  messageMetadataStore?: ObservableStore<ReadonlyMap<string, MessageMetadata>>;
  registry: {
    acquire<T>(spec: ProjectionSpec<T>): AcquiredProjection<T>;
  };
  activate(): () => void;
  submit(input: unknown, options?: SubmitOptions): Promise<void>;
  respond(response: unknown, options?: RespondOptions): Promise<void>;
  respondAll(
    responsesById: Record<string, unknown>,
    options?: RespondAllOptions,
  ): Promise<void>;
  stop(options?: StreamStopOptions): Promise<void>;
  dispose?(): Promise<void>;
};

type CustomProjectionSnapshot = {
  event: Event | null;
  error?: unknown;
};

export type EventStreamV3Snapshot = {
  values: ProjectedState;
  messages: AppMessage[];
  isLoading: boolean;
  isThreadLoading: boolean;
  error: unknown;
  interrupt: unknown;
  interrupts: unknown[];
  analyticsState: AnalyticsState;
  thinkingState: ThinkingState;
  threadId: string | null;
};

export type EventStreamV3Value = EventStreamV3Snapshot & {
  submit(input: unknown, options?: SubmitOptions): Promise<void>;
  respond(response: unknown, options?: RespondOptions): Promise<void>;
  respondAll(
    responsesById: Record<string, unknown>,
    options?: RespondAllOptions,
  ): Promise<void>;
  stop(options?: StreamStopOptions): Promise<void>;
  getMessagesMetadata(message: AppMessage): MessageMetadata | undefined;
};

function allCustomEventsProjection(): ProjectionSpec<CustomProjectionSnapshot> {
  return {
    key: "agent-chat-ui|custom|all-namespaces",
    namespace: [],
    initial: { event: null },
    open({ thread, store }) {
      let disposed = false;
      let subscription:
        | Awaited<ReturnType<typeof thread.subscribe>>
        | undefined;

      void (async () => {
        try {
          subscription = await thread.subscribe({
            channels: ["custom"],
            namespaces: [[]],
          });
          if (disposed) {
            await subscription.unsubscribe();
            return;
          }

          for await (const event of subscription) {
            if (disposed) break;
            store.setValue({ event });
          }
        } catch (error) {
          if (!disposed) {
            store.setValue({ event: null, error });
          }
        }
      })();

      return {
        async dispose() {
          disposed = true;
          await subscription?.unsubscribe();
        },
      };
    },
  };
}

function getAuthoritativeUi(values: Record<string, unknown>): UIMessage[] {
  return Array.isArray(values.ui) ? (values.ui as UIMessage[]) : [];
}

export class EventStreamV3Session {
  readonly #controller: ControllerLike;
  readonly #listeners = new Set<() => void>();
  readonly #customProjection: AcquiredProjection<CustomProjectionSnapshot>;
  readonly #unsubscribeRoot: () => void;
  readonly #unsubscribeCustom: () => void;
  readonly #unsubscribeMetadata: () => void;

  #analyticsState: AnalyticsState = EMPTY_ANALYTICS_STATE;
  #thinkingState: ThinkingState = EMPTY_THINKING_STATE;
  #ui: UIMessage[] = [];
  #authoritativeUi: unknown;
  #customError: unknown;
  #snapshot: EventStreamV3Snapshot;
  #disposed = false;
  #activationCount = 0;
  #pendingDispose: object | undefined;

  constructor(controller: ControllerLike) {
    this.#controller = controller;
    this.#snapshot = this.#readRootSnapshot();
    this.#customProjection = controller.registry.acquire(
      allCustomEventsProjection(),
    );
    this.#unsubscribeRoot = controller.rootStore.subscribe(() => {
      this.#refresh();
    });
    this.#unsubscribeCustom = this.#customProjection.store.subscribe(() => {
      this.#handleCustomProjection();
    });
    this.#unsubscribeMetadata =
      controller.messageMetadataStore?.subscribe(() => {
        this.#refresh();
      }) ?? (() => undefined);
  }

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.#snapshot;

  activate(): () => void {
    this.#activationCount += 1;
    this.#pendingDispose = undefined;
    const releaseController = this.#controller.activate();
    let released = false;

    return () => {
      if (released) return;
      released = true;
      releaseController();
      this.#activationCount = Math.max(0, this.#activationCount - 1);
      const token = {};
      this.#pendingDispose = token;
      queueMicrotask(() => {
        if (this.#pendingDispose === token && this.#activationCount === 0) {
          this.#disposeLocal();
        }
      });
    };
  }

  submit(input: unknown, options?: SubmitOptions): Promise<void> {
    return this.#controller.submit(input, options);
  }

  respond(response: unknown, options?: RespondOptions): Promise<void> {
    return this.#controller.respond(response, options);
  }

  respondAll(
    responsesById: Record<string, unknown>,
    options?: RespondAllOptions,
  ): Promise<void> {
    return this.#controller.respondAll(responsesById, options);
  }

  stop(options?: StreamStopOptions): Promise<void> {
    return this.#controller.stop(options);
  }

  getMessagesMetadata(message: AppMessage): MessageMetadata | undefined {
    if (!message.id) return undefined;
    return this.#controller.messageMetadataStore?.getSnapshot().get(message.id);
  }

  dispose(): void {
    this.#disposeLocal();
    void this.#controller.dispose?.();
  }

  toValue(snapshot = this.#snapshot): EventStreamV3Value {
    return {
      ...snapshot,
      submit: (input, options) => this.submit(input, options),
      respond: (response, options) => this.respond(response, options),
      respondAll: (responsesById, options) =>
        this.respondAll(responsesById, options),
      stop: (options) => this.stop(options),
      getMessagesMetadata: (message) => this.getMessagesMetadata(message),
    };
  }

  #readRootSnapshot(): EventStreamV3Snapshot {
    const root = this.#controller.rootStore.getSnapshot();
    const rootValues = root.values ?? {};
    if (rootValues.ui !== this.#authoritativeUi) {
      this.#authoritativeUi = rootValues.ui;
      this.#ui = getAuthoritativeUi(rootValues);
    }

    const messages = root.messages.map(normalizeMessage);
    return {
      values: composeProjectedState({
        rootValues,
        messages,
        ui: this.#ui,
      }),
      messages,
      isLoading: root.isLoading,
      isThreadLoading: root.isThreadLoading,
      error: this.#customError ?? root.error,
      interrupt: root.interrupt,
      interrupts: root.interrupts,
      analyticsState: this.#analyticsState,
      thinkingState: this.#thinkingState,
      threadId: root.threadId,
    };
  }

  #refresh() {
    if (this.#disposed) return;
    this.#snapshot = this.#readRootSnapshot();
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #handleCustomProjection() {
    const { event, error } = this.#customProjection.store.getSnapshot();
    if (error !== undefined) {
      this.#customError = error;
      this.#refresh();
      return;
    }
    if (!event) return;

    const payload = unwrapCustomEvent(event);
    const namespace = event.params.namespace;
    const kind = classifyCustomEvent(payload, namespace);

    if (kind === "ui") {
      this.#ui = applyUiCustomEvent(this.#ui, payload, namespace);
    } else if (kind === "analytics") {
      this.#analyticsState = appendAnalyticsEvent(
        this.#analyticsState,
        payload as AnalyticsEventEnvelope,
      );
    } else if (kind === "thinking") {
      this.#thinkingState = appendThinkingEvent(
        this.#thinkingState,
        payload as ThinkingEventEnvelope,
      );
    }

    if (kind) {
      this.#refresh();
    }
  }

  #disposeLocal() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeRoot();
    this.#unsubscribeCustom();
    this.#unsubscribeMetadata();
    this.#customProjection.release();
    this.#listeners.clear();
  }
}

export type UseEventStreamV3Options = {
  apiUrl: string;
  apiKey?: string;
  assistantId: string;
  authScheme?: string;
  threadId: string | null;
  onThreadId?: (threadId: string) => void;
};

function createSession(options: UseEventStreamV3Options): EventStreamV3Session {
  const client = new Client<Record<string, unknown>>({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    ...(options.authScheme
      ? {
          defaultHeaders: {
            "X-Auth-Scheme": options.authScheme,
          },
        }
      : {}),
  });
  const controller = new StreamController<Record<string, unknown>>({
    assistantId: options.assistantId,
    client,
    threadId: options.threadId,
    onThreadId: options.onThreadId,
    initialValues: {
      messages: [],
      ui: [],
    },
  });

  return new EventStreamV3Session(controller);
}

export function useEventStreamV3(
  options: UseEventStreamV3Options,
): EventStreamV3Value {
  const { apiKey, apiUrl, assistantId, authScheme, onThreadId, threadId } =
    options;
  const session = useMemo(
    () =>
      createSession({
        apiKey,
        apiUrl,
        assistantId,
        authScheme,
        onThreadId,
        threadId,
      }),
    [apiKey, apiUrl, assistantId, authScheme, onThreadId, threadId],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  useEffect(() => session.activate(), [session]);

  return useMemo(() => session.toValue(snapshot), [session, snapshot]);
}
