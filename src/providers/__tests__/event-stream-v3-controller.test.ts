import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";
import { StreamStore } from "@langchain/langgraph-sdk/stream";
import type {
  Event,
  ProjectionSpec,
  RootSnapshot,
} from "@langchain/langgraph-sdk/stream";

const { EventStreamV3Session } = await import(
  new URL("../use-event-stream-v3.ts", import.meta.url).href
);

function tick() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

class EventQueue implements AsyncIterable<Event> {
  readonly events: Event[] = [];
  readonly waiters: Array<(result: IteratorResult<Event>) => void> = [];
  closed = false;

  emit(event: Event) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.events.push(event);
    }
  }

  close() {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Event> {
    return {
      next: async () => {
        const event = this.events.shift();
        if (event) return { value: event, done: false };
        if (this.closed) return { value: undefined, done: true };
        return new Promise<IteratorResult<Event>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

function createRootSnapshot(): RootSnapshot<Record<string, unknown>, unknown> {
  return {
    values: { messages: [], ui: [], locale: "zh-CN" },
    messages: [],
    toolCalls: [],
    interrupts: [],
    interrupt: undefined,
    isLoading: false,
    isThreadLoading: false,
    error: undefined,
    threadId: "thread-1",
  };
}

function createFixture() {
  const customEvents = new EventQueue();
  const subscriptions: Record<string, unknown>[] = [];
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rootStore = new StreamStore(createRootSnapshot());
  let projectionRuntime: { dispose(): Promise<void> | void } | undefined;
  let projectionStore: StreamStore<Event | null> | undefined;
  let releaseCount = 0;
  let activationReleaseCount = 0;

  const thread = {
    async subscribe(params: Record<string, unknown>) {
      subscriptions.push(params);
      return Object.assign(customEvents, {
        unsubscribe: async () => customEvents.close(),
      });
    },
  };

  const controller = {
    rootStore,
    registry: {
      acquire(spec: ProjectionSpec<Event | null>) {
        projectionStore = new StreamStore(spec.initial);
        projectionRuntime = spec.open({
          thread: thread as never,
          store: projectionStore,
          rootBus: {
            channels: [],
            subscribe: () => () => undefined,
          },
        });
        return {
          store: projectionStore,
          release: () => {
            releaseCount += 1;
            void projectionRuntime?.dispose();
          },
        };
      },
    },
    activate() {
      calls.push({ method: "activate", args: [] });
      return () => {
        activationReleaseCount += 1;
      };
    },
    async submit(...args: unknown[]) {
      calls.push({ method: "submit", args });
    },
    async respond(...args: unknown[]) {
      calls.push({ method: "respond", args });
    },
    async respondAll(...args: unknown[]) {
      calls.push({ method: "respondAll", args });
    },
    async stop(...args: unknown[]) {
      calls.push({ method: "stop", args });
    },
  };

  const session = new EventStreamV3Session(controller as never);

  return {
    activationReleaseCount: () => activationReleaseCount,
    calls,
    controller,
    customEvents,
    releaseCount: () => releaseCount,
    rootStore,
    session,
    subscriptions,
  };
}

test("subscribes to custom events at every namespace depth", async () => {
  const fixture = createFixture();
  await tick();

  assert.deepEqual(fixture.subscriptions, [
    {
      channels: ["custom"],
      namespaces: [[]],
    },
  ]);

  fixture.session.dispose();
  assert.equal(fixture.releaseCount(), 1);
});

test("projects controller messages and keeps values.messages identical", () => {
  const fixture = createFixture();
  fixture.rootStore.setValue({
    ...createRootSnapshot(),
    messages: [
      new AIMessage({
        id: "ai-1",
        content: [{ type: "text", text: "streaming" }],
      }),
    ],
    isLoading: true,
  });

  const snapshot = fixture.session.getSnapshot();
  assert.equal(snapshot.values.messages, snapshot.messages);
  assert.deepEqual(snapshot.messages[0], {
    id: "ai-1",
    type: "ai",
    content: [{ type: "text", text: "streaming" }],
    tool_calls: [],
    invalid_tool_calls: [],
    additional_kwargs: {},
    response_metadata: {},
  });
  assert.equal(snapshot.values.locale, "zh-CN");
  assert.equal(snapshot.isLoading, true);
});

test("routes root and child custom payloads without terminating on malformed data", async () => {
  const fixture = createFixture();
  await tick();

  fixture.customEvents.emit({
    type: "event",
    method: "custom",
    params: {
      namespace: ["food-agent:run-id"],
      timestamp: 1,
      data: {
        payload: {
          kind: "analytics",
          event_name: "graph.entry",
          context: { run_id: "run-1" },
        },
      },
    },
  });
  fixture.customEvents.emit({
    type: "event",
    method: "custom",
    params: {
      namespace: ["food-agent:run-id"],
      timestamp: 2,
      data: {
        payload: {
          kind: "thinking",
          event_name: "thinking.entry_added",
          context: { run_id: "run-1" },
          payload: {
            phase_id: "phase-1",
            entry: { entry_id: "entry-1", text: "调用饮食能力" },
          },
        },
      },
    },
  });
  fixture.customEvents.emit({
    type: "event",
    method: "custom",
    params: {
      namespace: ["food-agent:run-id"],
      timestamp: 3,
      data: {
        payload: {
          type: "ui",
          id: "child-card",
          name: "choice",
          props: {},
        },
      },
    },
  });
  fixture.customEvents.emit({
    type: "event",
    method: "custom",
    params: {
      namespace: [],
      timestamp: 4,
      data: {
        payload: {
          type: "ui",
          id: "root-card",
          name: "choice",
          props: {},
        },
      },
    },
  });
  fixture.customEvents.emit({
    type: "event",
    method: "custom",
    params: {
      namespace: [],
      timestamp: 5,
      data: {},
    },
  } as unknown as Event);
  await tick();

  const snapshot = fixture.session.getSnapshot();
  assert.deepEqual(
    snapshot.analyticsState.timeline.map(
      (event: { event_name?: string }) => event.event_name,
    ),
    ["graph.entry"],
  );
  assert.deepEqual(
    snapshot.thinkingState.byRunId["run-1"].phases["phase-1"].facts.map(
      (entry: { entry_id?: string }) => entry.entry_id,
    ),
    ["entry-1"],
  );
  assert.deepEqual(
    snapshot.values.ui.map((event: { id: string }) => event.id),
    ["root-card"],
  );
  assert.equal(snapshot.error, undefined);
});

test("delegates submit, fork, interrupt responses, stop, and activation", async () => {
  const fixture = createFixture();
  const release = fixture.session.activate();

  await fixture.session.submit(
    { messages: [{ type: "human", content: "hello" }] },
    { config: { configurable: { user_id: "u-1" } } },
  );
  await fixture.session.submit(undefined, {
    forkFrom: "checkpoint-1",
  });
  await fixture.session.respond(
    { decisions: [{ type: "approve" }] },
    { interruptId: "interrupt-1", namespace: [] },
  );
  await fixture.session.respondAll({
    "interrupt-1": { approved: true },
    "interrupt-2": { approved: false },
  });
  await fixture.session.stop();
  release();

  assert.deepEqual(
    fixture.calls.map(({ method }) => method),
    ["activate", "submit", "submit", "respond", "respondAll", "stop"],
  );
  assert.deepEqual(fixture.calls[1].args[1], {
    config: { configurable: { user_id: "u-1" } },
  });
  assert.deepEqual(fixture.calls[2].args[1], {
    forkFrom: "checkpoint-1",
  });
  assert.equal(fixture.activationReleaseCount(), 1);
});
