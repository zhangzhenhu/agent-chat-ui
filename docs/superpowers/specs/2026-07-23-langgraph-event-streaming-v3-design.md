# LangGraph Event Streaming v3 Migration Design

## Goal

Move the chat frontend from the legacy run-centric streaming API to the
thread-centric protocol that mirrors LangGraph Event Streaming v3.

The frontend will stop using `client.runs.stream()` and instead communicate
through:

- `POST /threads/{thread_id}/stream/events` for filtered protocol events.
- `POST /threads/{thread_id}/commands` for `run.start`, `input.respond`, and
  related commands.

The backend at `http://127.0.0.1:8000` already exposes and validates both
endpoints. Its `/info` response reports server version `0.10.0` and LangGraph
Python version `1.2.6`.

LangGraph calls the in-process API Event Streaming v3. The deployed wire
surface is named thread-centric protocol v2. They are two sides of the same
event model; legacy `streamMode: "events"` is a different API and is not part
of this migration.

## Scope

Replace the streaming implementation and adapt its output to the current
application-facing stream context.

The migration includes:

- SDK and peer dependency upgrades.
- Thread-centric event subscription and command dispatch.
- Message, state, lifecycle, tool, custom event, and interrupt handling.
- Explicit fork behavior for regenerate and edit flows.
- Existing thinking, analytics, UI frame, thread history, and HITL behavior.
- Focused protocol, reducer, integration, and regression tests.

The migration does not redesign the chat UI, change graph behavior, change
backend code, or introduce a second streaming implementation for long-term
use.

## Current Behavior

`src/providers/Stream.tsx` uses the legacy React `useStream` implementation
from `@langchain/langgraph-sdk@1.8.10`. That hook eventually calls
`client.runs.stream()`.

Normal submit and regenerate subscribe to `values` plus `custom`, enable
subgraph streaming, and request resumable streams. The provider routes custom
events into three application states:

- UI frames, reduced into `values.ui`.
- Analytics events, accumulated in `analyticsState`.
- Thinking events, accumulated in `thinkingState`.

The UI reads a broad legacy context surface including `values`, `submit`,
`stop`, `isLoading`, `error`, `getMessagesMetadata`, and `setBranch`.

Enabling `fetchStateHistory` also causes the installed legacy hook to inherit
the current branch checkpoint on ordinary submits. The new design must not
preserve that behavior: ordinary continuation targets the latest thread state
without an explicit fork.

## Chosen Architecture

Use `StreamController` from the current LangGraph SDK stream package as the
protocol engine, wrapped by an application-owned React adapter.

`StreamController` is preferred over using `client.threads.stream()` directly
because it already provides:

- Thread hydration.
- Root message assembly.
- `values`, tools, lifecycle, and interrupt projections.
- Optimistic input reconciliation.
- Reconnection and ordered replay.
- Explicit `submit`, `respond`, `respondAll`, and `stop` operations.
- Per-message parent checkpoint metadata.

The application adapter remains responsible for:

- Converting SDK message instances into the message dictionary shape expected
  by existing components.
- Combining streamed root messages with authoritative state fields.
- Routing custom payloads into UI, analytics, and thinking stores.
- Exposing a narrow compatibility context while call sites migrate to explicit
  operations.
- Loading and presenting branch history.

The data flow is:

```text
Agent Server protocol events
  -> StreamController
  -> application event adapter
  -> StreamContext
  -> existing chat components
```

## Dependency Contract

Upgrade `@langchain/langgraph-sdk` from `1.8.10` to a release that includes
the thread-centric protocol client and `StreamController`. The inspected
release is `1.9.28`.

Upgrade `@langchain/core` to satisfy that SDK's peer range. The inspected SDK
requires at least `1.1.48`; the project currently uses `1.1.44`.

The lockfile must resolve one compatible copy of `@langchain/protocol`. No
application code should define a competing local copy of the protocol event
types.

## Stream Context

The provider will expose the following stable application contract:

```ts
type AppStreamContext = {
  values: StateType;
  messages: Message[];
  isLoading: boolean;
  error: unknown;
  interrupt: unknown;
  interrupts: unknown[];
  analyticsState: AnalyticsState;
  thinkingState: ThinkingState;
  submit(input: StreamInput, options?: SubmitOptions): Promise<void>;
  respond(response: unknown, options?: RespondOptions): Promise<void>;
  respondAll(
    responsesById: Record<string, unknown>,
    options?: RespondOptions,
  ): Promise<void>;
  stop(): Promise<void>;
  getMessagesMetadata(message: Message): AppMessageMetadata | undefined;
  setBranch(branch: string): void;
};
```

`values.messages` and `messages` must refer to the same normalized message
list. This avoids having existing transcript components and new consumers
observe different answers during token streaming.

The adapter may preserve legacy method names where that avoids unrelated
component churn, but it must not expose legacy protocol options such as
`streamMode`, `streamSubgraphs`, `streamResumable`, or a generic `command`
field as part of the final contract.

## Event Subscriptions

The root controller subscription handles:

- `values`
- `messages`
- `tools`
- `lifecycle`
- `input`

The application opens a custom-event subscription for all namespaces because
analytics and selected thinking events intentionally include child graph
activity.

Every event is handled as a structured envelope:

```ts
type ProtocolEvent = {
  type: "event";
  event_id?: string;
  seq?: number;
  method: string;
  params: {
    namespace: string[];
    timestamp: number;
    node?: string;
    data: unknown;
  };
};
```

Ordering uses `seq`, never the wall-clock timestamp. Reconnection uses the
SDK's replay cursor and must not maintain a second application cursor.

## Namespace Rules

The protocol defines root as an empty namespace array. Namespace decisions
must use the structured path:

- Root event: `namespace.length === 0`.
- Child event: `namespace.length > 0`.
- Stable segment name: text before the segment's `:` runtime suffix.

The existing string heuristic based on `namespace.join("|")` and
`"|tools|"` is removed.

Custom event routing remains:

- UI frame and remove-UI events: root only.
- Analytics events: root and child.
- Thinking events: root only, except `thinking.entry_added`, which may come
  from child namespaces.

The custom event data boundary unwraps `params.data.payload` before applying
the existing event type guards.

## Message Assembly

The `messages` channel is the live source for assistant output. It models
message and content-block lifecycles, including text, reasoning, tool calls,
multimodal blocks, completion, usage, and errors.

The provider normalizes assembled SDK messages into the project's existing
message dictionary shape:

```ts
type Message = {
  id?: string;
  type: string;
  content: unknown;
  tool_calls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
};
```

Authoritative `values` events continue to supply non-message graph state. The
adapter overlays the assembled root message list onto the latest root values.
Child `values` events never replace root state.

UI frames are maintained as a separate custom-event projection and overlaid
onto `values.ui`. They are changed only by root UI events or authoritative
root state, not by empty child snapshots. After the new root-only subscription
is verified, the component-level `protectedUi` workaround can be removed in a
separate behavior-preserving cleanup, not in the first migration patch.

## Submission Semantics

### Normal submit

Normal user input calls:

```ts
controller.submit(input, { config });
```

It does not include `forkFrom`, `checkpoint`, or `checkpoint_id`. The server
continues from the thread's current head.

### Regenerate and edit

The controller's message metadata supplies `parentCheckpointId`. Regenerate
and edit call:

```ts
controller.submit(input, {
  config,
  forkFrom: parentCheckpointId,
});
```

The SDK folds this explicit fork into the server-compatible checkpoint field.
Absence of `parentCheckpointId` disables regenerate or edit for that message
and surfaces an unavailable action state. It must never silently fork from the
current thread head.

### Parameters

Existing custom input fields remain part of the graph input. Existing
configurable fields remain under `config.configurable`.
`buildSubmitConfig()` remains the single place that enforces required
configurable flags.

Legacy streaming-only options are removed from component call sites.

## Interrupts

HITL resumes become explicit operations:

- One interrupt: `respond(response, { interruptId, namespace, config })`.
- Multiple simultaneous interrupts: `respondAll(responsesById, { config })`.

Current call sites that use `submit({}, { command: { resume } })` migrate to
`respond`. They must await the returned promise so loading and error UI reflect
dispatch failures.

The existing "mark resolved" path that sends `command.goto` must be expressed
through the protocol controller's interrupt response options, including
`goto`, when an interrupt is active. It must not be translated into an
ordinary user submit.

Nested interrupts use the exact namespace supplied by the protocol event.

## Branch History

The streaming controller owns live message metadata, but branch selection
remains an application concern.

Create a focused history adapter that:

- Loads thread history through the SDK thread history API.
- Builds branch options for the existing `BranchSwitcher`.
- Associates messages with their parent checkpoint IDs.
- Switches the displayed historical branch without changing the server's
  current thread head.
- Uses `forkFrom` only when the user regenerates or edits from the selected
  historical point.

Branch display state must not influence ordinary submit. A normal submit
always continues from the server's latest thread state. While a non-head
historical branch is displayed, the ordinary composer is disabled and directs
the user to return to the latest branch. Regenerate and edit remain the only
actions that can explicitly fork from the displayed historical point.

## Thread Lifecycle

Changing `threadId`, `assistantId`, or `apiUrl` disposes the previous
controller and its subscriptions before creating the next controller.

Hydration behavior:

- Existing thread: fetch current state, seed messages and interrupts, then
  attach to active lifecycle events when needed.
- New thread: generate or receive a thread ID, then let the first `run.start`
  create it lazily.
- Thread switch: clear UI, thinking, and analytics projections before showing
  the new thread.

React Strict Mode cleanup must use the controller's supported activation and
release lifecycle so a development-only mount cycle does not permanently
dispose the stream.

## Error Handling

Errors are separated by boundary:

- Connection or subscription failure: set stream error and show the existing
  connection/run error UI.
- Protocol command rejection: reject the operation and keep the current
  authoritative state.
- Lifecycle failure: set a run error and end loading.
- Message-level error: finish the affected message and surface its error
  without corrupting prior messages.
- Invalid custom payload: ignore that payload and retain the subscription.

One malformed custom event must not terminate the main event pump.

## API Passthrough

The existing Next.js passthrough route remains the deployment proxy. It must
forward:

- POST request bodies for `/stream/events` and `/commands`.
- `text/event-stream` responses without buffering.
- Authentication and custom auth headers.
- Abort signals when the browser closes a subscription.

This is verified in integration tests and against the live backend before the
legacy streaming dependency is removed.

## Rollout

The migration is delivered in three reviewable stages:

1. Upgrade dependencies and add protocol event normalization plus reducer
   tests.
2. Replace the provider internals, migrate normal submit and custom events,
   and verify live first/second turns.
3. Migrate HITL, regenerate/edit, and branch history, then remove remaining
   legacy streaming options and code.

The final merged state has one production streaming path. A runtime toggle or
long-lived dual implementation is not part of the design.

## Tests

### Unit tests

- Normalize message content blocks into the existing message shape.
- Route root and child custom events according to the namespace rules.
- Reduce UI frames without child-state replacement.
- Preserve analytics and thinking event ordering.
- Map message metadata to `parentCheckpointId`.
- Map explicit edit/regenerate actions to `forkFrom`.
- Map one and multiple interrupts to `respond` and `respondAll`.

### Integration tests

Use a controlled protocol server or fetch fixture to verify:

- Event and command endpoint paths.
- Normal second-turn `run.start` contains no checkpoint field.
- Regenerate/edit contains the selected fork checkpoint.
- `seq` replay does not duplicate messages or custom events.
- Root and child subscriptions do not overwrite each other's state.
- Command errors and lifecycle failures update loading and error state.
- Next.js passthrough streams without buffering.

### Live verification

Against `http://127.0.0.1:8000`:

- Start a new thread and complete two ordinary chat turns.
- Confirm both responses stream incrementally.
- Confirm the second run continues from the latest state without a fork.
- Exercise one tool call and inspect tool lifecycle rendering.
- Exercise root and child thinking/analytics events.
- Exercise a HITL interrupt and resume it.
- Regenerate and edit a historical message and confirm an explicit branch.
- Disconnect and reconnect during a run and confirm ordered, non-duplicated
  replay.

## Acceptance Criteria

- The frontend uses `/threads/{thread_id}/stream/events` and
  `/threads/{thread_id}/commands` for chat execution.
- No ordinary submit sends checkpoint or fork semantics.
- Regenerate and edit preserve explicit branching.
- Existing transcript, thinking, analytics, UI card, parameters, history,
  tool, and HITL workflows remain functional.
- Root state is never replaced by child state.
- Reconnection does not duplicate events.
- Legacy `client.runs.stream()` is no longer used by the application.
- Focused tests, the production build, and the live backend verification pass.

## Non-Goals And Risks

This migration does not immediately expose every Event Streaming v3 channel in
the UI. New channels can be adopted after the core transport is stable.

The main compatibility risks are message-shape normalization, branch history,
HITL target selection, custom event payload wrapping, and passthrough
streaming. Each is isolated behind an adapter and covered by a focused
verification step before the legacy path is removed.
