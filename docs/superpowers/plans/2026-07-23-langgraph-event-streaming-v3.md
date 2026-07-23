# LangGraph Event Streaming v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's legacy run-centric stream with the LangGraph thread-centric Event Streaming v3 protocol exposed by the backend at `http://127.0.0.1:8000`, while preserving the current transcript, custom events, branching, and HITL behavior.

**Architecture:** Use the SDK's public `StreamController` as the protocol engine and wrap it in an application-owned React adapter. Keep protocol normalization, message/state projection, custom-event routing, and branch-history mapping in small pure modules; expose a compatibility context to existing components while replacing legacy submit options with explicit `submit`, `respond`, and `forkFrom` operations.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, `@langchain/langgraph-sdk@1.9.28`, `@langchain/core>=1.1.48`, Node's built-in test runner with TypeScript stripping, LangGraph Agent Server `0.10.0`.

---

## File Structure

- Modify: `package.json`
  - Upgrade the LangGraph SDK and compatible core dependency.
- Modify: `pnpm-lock.yaml`
  - Resolve the upgraded SDK and a single compatible protocol package.
- Create: `src/providers/event-stream-v3-adapter.ts`
  - Normalize protocol envelopes and messages; route root/child custom events; compose authoritative state with live messages and UI.
- Create: `src/providers/__tests__/event-stream-v3-adapter.test.ts`
  - Pure adapter, namespace, message, state, and custom-event tests.
- Create: `src/providers/use-event-stream-v3.ts`
  - Own `StreamController`, subscriptions, React external-store updates, custom projections, activation, cleanup, and thread changes.
- Create: `src/providers/__tests__/event-stream-v3-controller.test.ts`
  - Controlled transport tests for endpoint selection, commands, replay, lifecycle, and cleanup.
- Create: `src/providers/thread-branch-history.ts`
  - Adapt SDK branch helpers into the existing message metadata and branch selection surface.
- Create: `src/providers/__tests__/thread-branch-history.test.ts`
  - Branch mapping, head detection, and explicit fork tests.
- Modify: `src/providers/stream-context-value.ts`
  - Define the application stream contract and remove legacy namespace heuristics.
- Modify: `src/providers/__tests__/stream-context-value.test.ts`
  - Context compatibility tests.
- Modify: `src/providers/__tests__/stream-namespace.test.ts`
  - Exact structured-namespace tests.
- Modify: `src/providers/Stream.tsx`
  - Replace SDK React `useStream` with the application adapter.
- Modify: `src/providers/client.ts`
  - Centralize controller/client configuration and headers.
- Modify: `src/components/thread/index.tsx`
  - Use the new submit contract and disable ordinary submit on a non-head branch.
- Modify: `src/components/thread/messages/ai.tsx`
  - Read `parentCheckpointId` and disable regenerate when unavailable.
- Modify: `src/components/thread/messages/human.tsx`
  - Edit through explicit `forkFrom`.
- Modify: `src/components/thread/generative-ui/choice.tsx`
  - Resume interrupts through `respond`.
- Modify: `src/components/thread/messages/hitl-constraints.tsx`
  - Resume interrupts through `respond`.
- Modify: `src/components/thread/agent-inbox/hooks/use-interrupted-actions.tsx`
  - Await single interrupt responses and `goto` resolution.
- Modify: `src/components/thread/agent-inbox/components/thread-actions-view.tsx`
  - Send one response containing all decisions for one multi-action interrupt.
- Create: `src/providers/__tests__/event-stream-v3-live.test.ts`
  - Opt-in live backend smoke coverage against port 8000.
- Modify: `src/app/api/[..._path]/route.ts`
  - Only if passthrough verification exposes missing streaming or abort forwarding.

### Task 1: Upgrade And Lock The SDK Contract

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Record the current missing export**

Run:

```bash
node -e 'import("@langchain/langgraph-sdk/stream").then(m => console.log(typeof m.StreamController)).catch(e => { console.error(e.code); process.exit(1) })'
```

Expected: FAIL with `ERR_PACKAGE_PATH_NOT_EXPORTED` on the current `1.8.10` installation.

- [ ] **Step 2: Upgrade the SDK and its peer dependency**

Run:

```bash
npx --yes pnpm@10.5.1 add @langchain/langgraph-sdk@1.9.28 @langchain/core@^1.1.48
```

Keep `@langchain/langgraph` unchanged unless pnpm reports a real peer conflict.

- [ ] **Step 3: Verify the required public exports and dependency graph**

Run:

```bash
node -e 'Promise.all([import("@langchain/langgraph-sdk/stream"), import("@langchain/langgraph-sdk/ui")]).then(([stream, ui]) => { console.log(typeof stream.StreamController, typeof ui.getBranchContext, typeof ui.getMessagesMetadataMap) })'
npx --yes pnpm@10.5.1 why @langchain/protocol
npx --yes pnpm@10.5.1 exec tsc --noEmit
```

Expected: the export probe prints `function function function`; the lockfile resolves one compatible protocol version; TypeScript passes before application imports are changed.

- [ ] **Step 4: Commit the dependency boundary**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: upgrade LangGraph SDK for event streaming v3"
```

### Task 2: Build The Pure Protocol Adapter

**Files:**

- Create: `src/providers/event-stream-v3-adapter.ts`
- Create: `src/providers/__tests__/event-stream-v3-adapter.test.ts`
- Modify: `src/providers/stream-context-value.ts`
- Modify: `src/providers/__tests__/stream-namespace.test.ts`

- [ ] **Step 1: Write failing namespace and envelope tests**

Cover these exact rules:

```ts
assert.equal(isRootProtocolNamespace([]), true);
assert.equal(isRootProtocolNamespace(undefined), false);
assert.equal(isRootProtocolNamespace(["family-main:run-id"]), false);
assert.equal(stableNamespaceSegment("food-agent:run-id"), "food-agent");

assert.deepEqual(
  unwrapCustomEvent({
    type: "event",
    method: "custom",
    params: {
      namespace: [],
      timestamp: 1,
      data: { payload: { kind: "analytics", event_name: "graph.entry" } },
    },
  }),
  { kind: "analytics", event_name: "graph.entry" },
);
```

Also assert that missing `params.data.payload`, a non-array namespace, or a malformed envelope returns `undefined` without throwing.

- [ ] **Step 2: Write failing custom-event routing tests**

Use table tests for:

- UI and remove-UI: root `[]` only.
- Analytics: root and child.
- Thinking `thinking.entry_added`: root and child.
- Other thinking events: root only.
- Malformed custom payload: ignored without modifying any projection.
- Input order: accepted analytics and thinking events remain in protocol delivery order.

- [ ] **Step 3: Write failing message/state composition tests**

Cover:

- SDK class messages become plain message dictionaries with `id`, `type`, `content`, `tool_calls`, `additional_kwargs`, and `response_metadata`.
- Content blocks and tool-call fields are retained instead of flattened to text.
- Root authoritative values retain all non-message state.
- Live root messages replace `values.messages`.
- `values.messages` and the separately exposed `messages` property are the same array reference.
- Child `values` never replace root values.
- Root UI events update `values.ui`; child UI and empty child snapshots cannot clear it.

- [ ] **Step 4: Run the focused tests to verify failure**

```bash
node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-adapter.test.ts src/providers/__tests__/stream-namespace.test.ts
```

Expected: FAIL because the new adapter exports do not exist and the old namespace helper treats non-empty namespaces as root.

- [ ] **Step 5: Implement the pure adapter**

Export narrow, framework-free helpers:

```ts
export function isRootProtocolNamespace(namespace: unknown): namespace is [];
export function stableNamespaceSegment(segment: string): string;
export function unwrapCustomEvent(event: unknown): unknown | undefined;
export function classifyCustomEvent(
  payload: unknown,
  namespace: string[],
): "ui" | "analytics" | "thinking" | undefined;
export function normalizeMessage(message: unknown): AppMessage;
export function composeProjectedState(args: {
  rootValues: Record<string, unknown>;
  messages: AppMessage[];
  ui: UIMessage[];
}): StateType;
```

Use SDK message conversion helpers where available. Do not infer root from a name string; root is exactly `namespace.length === 0`.

- [ ] **Step 6: Run focused tests and commit**

```bash
node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-adapter.test.ts src/providers/__tests__/stream-namespace.test.ts
npx --yes pnpm@10.5.1 exec tsc --noEmit
git add src/providers/event-stream-v3-adapter.ts src/providers/stream-context-value.ts src/providers/__tests__/event-stream-v3-adapter.test.ts src/providers/__tests__/stream-namespace.test.ts
git commit -m "test: define event streaming v3 adapter contract"
```

### Task 3: Wrap `StreamController` With A React Store

**Files:**

- Create: `src/providers/use-event-stream-v3.ts`
- Create: `src/providers/__tests__/event-stream-v3-controller.test.ts`
- Modify: `src/providers/client.ts`

- [ ] **Step 1: Add a controlled controller/transport fixture**

Build a fixture that records subscription URLs, channel filters, commands, and aborts, and can emit ordered protocol events. Keep it outside React so endpoint and reducer behavior can be tested deterministically.

- [ ] **Step 2: Write failing integration tests for transport behavior**

Assert:

- The main subscription targets `/threads/{thread_id}/stream/events` and requests `values`, `messages`, `tools`, `lifecycle`, and `input`.
- The custom subscription targets the same events endpoint and accepts all namespaces.
- Normal `submit(input, { config })` sends `run.start` to `/threads/{thread_id}/commands`.
- Its command contains no `checkpoint`, `checkpoint_id`, or `forkFrom`.
- `submit(input, { config, forkFrom: "cp-1" })` sends the SDK-supported checkpoint field.
- `respond(value, target)` sends `input.respond`.
- Replay by `seq` does not duplicate messages or custom events.
- Command rejection rejects the returned promise and keeps authoritative state.
- Lifecycle failure ends loading and exposes an error.
- Releasing the last subscriber aborts both event subscriptions.

- [ ] **Step 3: Run the controller test to verify failure**

```bash
node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-controller.test.ts
```

Expected: FAIL because the wrapper and fixture do not exist.

- [ ] **Step 4: Implement the controller-backed store**

Create one store/controller per `{apiUrl, apiKey, authScheme, assistantId, threadId}` identity. Expose:

```ts
type EventStreamV3Value = {
  values: StateType;
  messages: AppMessage[];
  isLoading: boolean;
  isThreadLoading: boolean;
  error: unknown;
  interrupt: unknown;
  interrupts: unknown[];
  submit(
    input: StreamInput | undefined,
    options?: AppSubmitOptions,
  ): Promise<void>;
  respond(value: unknown, options?: AppRespondOptions): Promise<void>;
  respondAll(
    valuesByInterruptId: Record<string, unknown>,
    options?: AppRespondOptions,
  ): Promise<void>;
  stop(): Promise<void>;
};
```

Requirements:

- Subscribe React with `useSyncExternalStore`.
- Use the controller's supported activate/release lifecycle for Strict Mode.
- Clear UI, analytics, and thinking projections when controller identity changes.
- Normalize `rootStore.messages` before composing state.
- Keep one replay cursor: the SDK/controller's cursor.
- Catch and ignore an individual malformed custom payload without closing the stream.
- Call `onThreadId` after lazy thread creation.

- [ ] **Step 5: Run tests, typecheck, and commit**

```bash
node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-controller.test.ts src/providers/__tests__/event-stream-v3-adapter.test.ts
npx --yes pnpm@10.5.1 exec tsc --noEmit
git add src/providers/use-event-stream-v3.ts src/providers/client.ts src/providers/__tests__/event-stream-v3-controller.test.ts
git commit -m "feat: add thread-centric stream controller adapter"
```

### Task 4: Replace The Provider While Preserving Its Consumer Contract

**Files:**

- Modify: `src/providers/Stream.tsx`
- Modify: `src/providers/stream-context-value.ts`
- Modify: `src/providers/__tests__/stream-context-value.test.ts`

- [ ] **Step 1: Write failing context compatibility tests**

Assert that the composed context exposes:

- `values`, `messages`, `isLoading`, `error`, `interrupt`, and `interrupts`.
- `submit`, `respond`, `respondAll`, and `stop`.
- `analyticsState` and `thinkingState`.
- `values.messages === messages`.
- No public `streamMode`, `streamSubgraphs`, `streamResumable`, or generic command option.

- [ ] **Step 2: Run the context tests to verify failure**

```bash
node --experimental-strip-types --test src/providers/__tests__/stream-context-value.test.ts
```

Expected: FAIL because the current context inherits the legacy SDK hook surface.

- [ ] **Step 3: Replace `useTypedStream` in `StreamSession`**

Use `useEventStreamV3` and keep the existing configuration gate, connectivity toast, thread-list refresh, and projection reset behavior. Remove imports from `@langchain/langgraph-sdk/react`; keep `react-ui` only for UI message types/reducer behavior that is still required.

Do not remove the component-level `protectedUi` workaround in this task.

- [ ] **Step 4: Run all provider tests and typecheck**

```bash
node --experimental-strip-types --test src/providers/__tests__/*.test.ts
npx --yes pnpm@10.5.1 exec tsc --noEmit
```

Expected: PASS. Search must show no application import of the legacy React stream hook:

```bash
rg -n 'from "@langchain/langgraph-sdk/react"|runs\.stream|fetchStateHistory' src
```

Expected: no matches.

- [ ] **Step 5: Commit the provider replacement**

```bash
git add src/providers/Stream.tsx src/providers/stream-context-value.ts src/providers/__tests__/stream-context-value.test.ts
git commit -m "feat: switch provider to event streaming v3"
```

### Task 5: Make Submit And Fork Semantics Explicit

**Files:**

- Modify: `src/components/thread/index.tsx`
- Modify: `src/components/thread/messages/ai.tsx`
- Modify: `src/components/thread/messages/human.tsx`
- Create: `src/providers/thread-branch-history.ts`
- Create: `src/providers/__tests__/thread-branch-history.test.ts`

- [ ] **Step 1: Write failing branch-history tests**

Wrap the SDK's `getBranchContext` and `getMessagesMetadataMap` and assert:

- Message metadata exposes `parentCheckpointId`.
- Branch options remain compatible with `BranchSwitcher`.
- The selected branch is identified as head or non-head.
- Selecting a branch changes displayed history only.
- Normal submit options never inherit a selected checkpoint.
- Regenerate/edit produce `{ forkFrom: parentCheckpointId }`.
- Missing `parentCheckpointId` produces a disabled action state, never a fallback to current head.

- [ ] **Step 2: Run the branch tests to verify failure**

```bash
node --experimental-strip-types --test src/providers/__tests__/thread-branch-history.test.ts
```

Expected: FAIL because the branch adapter does not exist.

- [ ] **Step 3: Implement branch history and metadata mapping**

Keep branch display state inside the history adapter. Expose `getMessagesMetadata`, `setBranch`, `isViewingHead`, and the selected displayed values/messages to the provider context.

- [ ] **Step 4: Remove legacy options from ordinary submit**

In `src/components/thread/index.tsx`, keep custom input fields in the input payload and `buildSubmitConfig()` under `config`, but remove:

```ts
streamMode;
streamSubgraphs;
streamResumable;
checkpoint;
optimisticValues;
```

Call and await:

```ts
stream.submit(submitPayload, {
  config: buildSubmitConfig(customParams.configurable),
});
```

Disable the ordinary composer while `!stream.isViewingHead`, with a concise action to return to the latest branch.

- [ ] **Step 5: Convert regenerate and edit to explicit forks**

Read `meta.parentCheckpointId`. Pass:

```ts
stream.submit(input, {
  config: buildSubmitConfig(customParams.configurable),
  forkFrom: parentCheckpointId,
});
```

Disable edit/regenerate when the parent checkpoint is missing. Preserve the current optimistic user-message behavior through the controller instead of a component callback.

- [ ] **Step 6: Verify no legacy submit options remain**

```bash
rg -n 'streamMode|streamSubgraphs|streamResumable|checkpoint:' src/components src/providers
node --experimental-strip-types --test src/providers/__tests__/thread-branch-history.test.ts src/components/thread/__tests__/submit-config.test.ts
npx --yes pnpm@10.5.1 exec tsc --noEmit
```

Expected: search has no production call-site matches; tests and typecheck pass.

- [ ] **Step 7: Commit explicit submission behavior**

```bash
git add src/providers/thread-branch-history.ts src/providers/__tests__/thread-branch-history.test.ts src/components/thread/index.tsx src/components/thread/messages/ai.tsx src/components/thread/messages/human.tsx
git commit -m "feat: make chat branching explicit"
```

### Task 6: Move HITL To Explicit Responses

**Files:**

- Modify: `src/components/thread/generative-ui/choice.tsx`
- Modify: `src/components/thread/messages/hitl-constraints.tsx`
- Modify: `src/components/thread/agent-inbox/hooks/use-interrupted-actions.tsx`
- Modify: `src/components/thread/agent-inbox/components/thread-actions-view.tsx`
- Create: `src/providers/__tests__/event-stream-v3-hitl.test.ts`

- [ ] **Step 1: Write failing HITL command-mapping tests**

Cover:

- One active interrupt calls `respond(value, { interruptId, namespace, config })`.
- Several decisions belonging to one interrupt call one `respond({ decisions })`.
- Multiple distinct protocol interrupt IDs call `respondAll(valuesById)`.
- Resolve calls `respond(undefined, { goto: END, interruptId, namespace })`.
- Missing interrupt target rejects before a command is sent.
- Component actions await the promise so rejected commands surface as errors.

- [ ] **Step 2: Run the HITL tests to verify failure**

```bash
node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-hitl.test.ts
```

Expected: FAIL because current call sites send generic `command.resume` through `submit`.

- [ ] **Step 3: Migrate all resume call sites**

Replace:

```ts
submit({}, { command: { resume: value } });
```

with:

```ts
await respond(value, {
  interruptId: interrupt.id,
  namespace: interrupt.ns,
  config,
});
```

Use the exact SDK interrupt ID and namespace fields confirmed by TypeScript. Keep all-decision batches for one interrupt in one response; reserve `respondAll` for genuinely distinct interrupt IDs.

- [ ] **Step 4: Migrate resolve/goto and error handling**

Express `goto: END` through response options on the active interrupt. Await all operations before showing success toasts; preserve rejected-command error UI.

- [ ] **Step 5: Verify and commit**

```bash
rg -n 'command:\s*\{|resume:|goto:' src/components/thread
node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-hitl.test.ts
npx --yes pnpm@10.5.1 exec tsc --noEmit
git add src/components/thread/generative-ui/choice.tsx src/components/thread/messages/hitl-constraints.tsx src/components/thread/agent-inbox/hooks/use-interrupted-actions.tsx src/components/thread/agent-inbox/components/thread-actions-view.tsx src/providers/__tests__/event-stream-v3-hitl.test.ts
git commit -m "feat: send HITL responses through protocol commands"
```

Expected: search has no generic `submit(...command...)` call; tests and typecheck pass.

### Task 7: Verify Passthrough And Live Port 8000 Behavior

**Files:**

- Create: `src/providers/__tests__/event-stream-v3-live.test.ts`
- Modify if required: `src/app/api/[..._path]/route.ts`

- [ ] **Step 1: Add an opt-in live smoke test**

Gate the test behind `LANGGRAPH_LIVE_BASE_URL`. It must:

- Read `/info`.
- Create or lazily start a thread with a configured assistant.
- Open `/threads/{thread_id}/stream/events`.
- Send a `run.start` through `/threads/{thread_id}/commands`.
- Record event `seq`, namespaces, lifecycle, and message deltas.
- Send a second ordinary turn and assert its command has no checkpoint.

Do not hardcode credentials or an assistant UUID. Read `LANGGRAPH_LIVE_ASSISTANT_ID` and the existing API-key/header environment convention.

- [ ] **Step 2: Verify the direct backend contract**

Run:

```bash
LANGGRAPH_LIVE_BASE_URL=http://127.0.0.1:8000 LANGGRAPH_LIVE_ASSISTANT_ID="$LANGGRAPH_LIVE_ASSISTANT_ID" node --experimental-strip-types --test src/providers/__tests__/event-stream-v3-live.test.ts
```

Expected: two turns stream incrementally, lifecycle completes, and the second `run.start` contains no checkpoint field. If no assistant ID is supplied, the test skips with a clear reason rather than failing.

- [ ] **Step 3: Verify the Next.js passthrough**

Start the frontend on an unused port:

```bash
npx --yes pnpm@10.5.1 dev --port 3000
```

Run the same smoke test with the application's `/api` passthrough base URL and verify:

- POST bodies reach both protocol endpoints unchanged.
- SSE chunks arrive before the run completes.
- Custom authentication headers are forwarded.
- Aborting the browser-side request closes the upstream stream.

Only modify `src/app/api/[..._path]/route.ts` if this test proves a passthrough defect.

- [ ] **Step 4: Exercise high-risk workflows manually**

Against `http://127.0.0.1:8000`, verify:

- New thread, then two ordinary turns.
- One tool call with visible lifecycle updates.
- Root and child analytics plus thinking events.
- One HITL interrupt and response.
- Regenerate and edit with an explicit historical fork.
- Switch to a non-head branch and confirm ordinary composer is disabled.
- Disconnect/reconnect during a run and confirm ordered, non-duplicated replay.

Capture request bodies or server logs showing ordinary second turn without checkpoint and regenerate/edit with a checkpoint.

- [ ] **Step 5: Commit live verification coverage**

```bash
git add src/providers/__tests__/event-stream-v3-live.test.ts 'src/app/api/[..._path]/route.ts'
git commit -m "test: cover event streaming v3 passthrough"
```

Omit the route from `git add` when it did not require a change.

### Task 8: Run Full Regression And Remove Legacy Residue

**Files:**

- Modify only files identified by verification failures.

- [ ] **Step 1: Run every TypeScript unit test**

```bash
node --experimental-strip-types --test src/providers/__tests__/*.test.ts src/components/thread/__tests__/*.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run static and production verification**

```bash
npx --yes pnpm@10.5.1 exec tsc --noEmit
npx --yes pnpm@10.5.1 format:check
npx --yes pnpm@10.5.1 build
git diff --check
```

Expected: all commands exit zero.

- [ ] **Step 3: Prove the legacy path is gone**

```bash
rg -n 'runs\.stream|@langchain/langgraph-sdk/react"|fetchStateHistory|streamMode|streamSubgraphs|streamResumable|command:\s*\{' src
```

Expected: no production matches. Test fixtures may mention forbidden fields only to assert that they are absent.

- [ ] **Step 4: Review behavior against the design**

Confirm:

- Root is exactly `[]`.
- Custom payloads unwrap `params.data.payload`.
- Child values cannot replace root state.
- `values.messages === messages`.
- Normal submit contains no fork/checkpoint.
- Edit/regenerate require `parentCheckpointId`.
- Non-head ordinary submit is disabled.
- HITL uses `respond`/`respondAll`.
- Controller/subscriptions are released on identity change and unmount.
- The first migration keeps `protectedUi`.

- [ ] **Step 5: Commit final cleanup**

```bash
git add src package.json pnpm-lock.yaml
git commit -m "chore: finish event streaming v3 migration"
```

Skip this commit when the verification pass required no changes.
