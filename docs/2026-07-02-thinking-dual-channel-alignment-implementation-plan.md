# Thinking Dual-Channel Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realign `agent-chat-ui` thinking rendering to the latest `familyagent` dual-channel model so `thinking_trace` becomes a thread-level durable process card with transient custom-event overlays, while analytics remains independently attached to the current run's last AI message.

**Architecture:** The frontend will consume `thinking` and `analytics` as separate custom-event domains. Thinking will use `values.ui` as durable truth plus a local `run -> phase -> group` transient bucket for not-yet-flushed custom deltas, rendered through one thread-level `ThinkingTraceCard`. Analytics will remain run-scoped and message-attached only to the current run's last AI message.

**Tech Stack:** Next.js, React 19, TypeScript, `@langchain/langgraph-sdk/react`, `@langchain/langgraph-sdk/react-ui`, existing `agent-chat-ui` thread/message components.

---

## File Structure

### Existing files to modify

- `src/providers/Stream.tsx`
  - Re-introduce `kind="thinking"` custom-event consumption
  - Add separate `thinkingState`
  - Reset `thinkingState` when stream context changes

- `src/components/thread/index.tsx`
  - Remove transcript-inline thinking rendering
  - Restore a thread-level `ThinkingTraceCard` region

- `src/components/thread/process-trace-helpers.ts`
  - Remove thinking transcript placement logic
  - Keep debug-only process trace helpers
  - Add durable snapshot lookup helper only

- `src/components/thread/thinking-trace-card.tsx`
  - Render durable `thinking_trace` snapshot plus transient run/phase/group overlay

- `src/components/thread/analytics-types.ts`
  - Extend shared types so thinking custom envelopes and durable step groups have explicit shape

- `src/components/thread/analytics-state.ts`
  - Keep current run-scoped analytics logic
  - Ensure no thinking-specific types or reducers remain here

### Existing files to delete

- `src/components/thread/transcript-types.ts`
  - The `thinking` transcript block union becomes obsolete once thinking returns to a thread-level card

### New files to create

- `src/components/thread/thinking-state.ts`
  - Defines `ThinkingState`
  - Reducers for `phase_started`, `reasoning_delta`, `phase_completed`, `phase_flushed`

- `src/components/thread/__tests__/thinking-state.test.ts`
  - Minimal reducer coverage for run/phase/group accumulation and flush cleanup

### Existing test files to modify

- `src/components/thread/__tests__/process-trace-helpers.test.ts`
  - Remove obsolete transcript-inline thinking expectations
  - Replace with snapshot lookup / non-inline behavior expectations

## Task 1: Replace the incorrect thinking mental model in code structure

**Files:**
- Modify: `src/components/thread/index.tsx`
- Modify: `src/components/thread/process-trace-helpers.ts`
- Modify: `src/components/thread/__tests__/process-trace-helpers.test.ts`
- Delete: `src/components/thread/transcript-types.ts`

- [ ] **Step 1: Write the failing test for “thinking is not a transcript block”**

Add a test asserting the helper no longer injects thinking into transcript ordering:

```ts
test("thinking trace is not emitted as transcript blocks", async () => {
  const { buildTranscriptBlocks } = await import(
    new URL("../process-trace-helpers.ts", import.meta.url).href,
  );

  const blocks = buildTranscriptBlocks({
    messages: [
      { id: "h1", type: "human", content: "你好" },
      { id: "a1", type: "ai", content: "最终回答" },
    ],
  });

  assert.deepEqual(
    blocks.map((block: { kind: string }) => block.kind),
    ["human", "assistant"],
  );
});
```

- [ ] **Step 2: Run the test to verify current transcript-inline implementation fails**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/process-trace-helpers.test.ts
```

Expected:
- FAIL because current helper still inserts a `thinking` block

- [ ] **Step 3: Remove transcript-inline thinking placement logic**

Update `src/components/thread/process-trace-helpers.ts` so transcript helpers only handle visible chat messages and debug traces:

```ts
export function buildTranscriptBlocks(args: {
  messages: Message[];
}): TranscriptBlock[] {
  return args.messages.flatMap((message) => {
    if (message.type === "human") {
      return [{ kind: "human", message }];
    }
    if (message.type === "ai") {
      return [{ kind: "assistant", message }];
    }
    return [];
  });
}
```

Keep a separate lookup helper:

```ts
export function getThinkingTraceUIMessage(
  ui: Array<{ type?: string; name?: string; props?: unknown; metadata?: Record<string, unknown> }> | undefined,
) {
  return (ui ?? []).find((item) => item?.type === "ui" && item?.name === "thinking_trace") ?? null;
}
```

- [ ] **Step 4: Move `ThinkingTraceCard` out of transcript rendering**

In `src/components/thread/index.tsx`, replace transcript-inline usage with a thread-level section:

```tsx
const thinkingTraceMessage = getThinkingTraceUIMessage(
  (stream.values as StateType | undefined)?.ui,
);

{transcriptBlocks.map((block, index) => {
  if (block.kind === "human") {
    return <HumanMessage key={block.message.id || `human-${index}`} message={block.message} isLoading={isLoading} />;
  }
  return (
    <AssistantMessage
      key={block.message.id || `assistant-${index}`}
      message={block.message}
      isLoading={isLoading}
      handleRegenerate={handleRegenerate}
    />
  );
})}

{thinkingTraceMessage ? (
  <ThinkingTraceCard
    snapshot={thinkingTraceMessage.props as ThinkingTraceSnapshot}
    runBucket={thinkingRunBucket}
    isLoading={isLoading}
  />
) : null}
```

Delete `src/components/thread/transcript-types.ts` and remove its imports from `index.tsx` and tests.

- [ ] **Step 5: Re-run the focused test**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/process-trace-helpers.test.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/index.tsx src/components/thread/process-trace-helpers.ts src/components/thread/__tests__/process-trace-helpers.test.ts
git rm src/components/thread/transcript-types.ts
git commit -m "refactor: restore thread-level thinking structure"
```

## Task 2: Add a dedicated dual-channel thinking reducer

**Files:**
- Create: `src/components/thread/thinking-state.ts`
- Modify: `src/components/thread/analytics-types.ts`
- Create: `src/components/thread/__tests__/thinking-state.test.ts`

- [ ] **Step 1: Write the failing reducer tests first**

Create tests for accumulation and flush:

```ts
test("appendThinkingEvent stores reasoning deltas by run phase and group", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href,
  );

  const next = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.reasoning_delta",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      text: "补充预算",
    },
  });

  assert.deepEqual(
    next.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].items,
    [{ text: "补充预算", agentName: "food_need_specialist", agentRole: "need" }],
  );
});

test("appendThinkingEvent clears a flushed group", async () => {
  const { EMPTY_THINKING_STATE, appendThinkingEvent } = await import(
    new URL("../thinking-state.ts", import.meta.url).href,
  );

  const withDelta = appendThinkingEvent(EMPTY_THINKING_STATE, {
    kind: "thinking",
    event_name: "thinking.reasoning_delta",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      group_id: "need:food_need_specialist",
      text: "补充预算",
    },
  });

  const flushed = appendThinkingEvent(withDelta, {
    kind: "thinking",
    event_name: "thinking.phase_flushed",
    context: { run_id: "run-1" },
    subject: { agent_role: "need" },
    payload: {
      phase_id: "need_specialist",
      agent_name: "food_need_specialist",
      group_id: "need:food_need_specialist",
      status: "completed",
    },
  });

  assert.deepEqual(
    flushed.byRunId["run-1"].phases["need_specialist"].groups["need:food_need_specialist"].items,
    [],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail because the reducer does not exist yet**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/thinking-state.test.ts
```

Expected:
- FAIL with module-not-found or missing export errors

- [ ] **Step 3: Define the new state and event types**

In `src/components/thread/analytics-types.ts`, add:

```ts
export type ThinkingEventEnvelope = {
  type?: string;
  kind?: string;
  schema_version?: string;
  event_name?: string;
  emitted_at?: string;
  tags?: string[];
  context?: AnalyticsEventContext;
  subject?: AnalyticsEventSubject;
  business?: AnalyticsEventBusiness;
  payload?: Record<string, unknown>;
};

export type ThinkingDetailGroup = {
  group_id: string;
  agent_name: string;
  agent_role: string;
  kind: string;
  items: string[];
};
```

- [ ] **Step 4: Implement the minimal reducer in `thinking-state.ts`**

Core shape:

```ts
export type ThinkingDeltaItem = {
  text: string;
  agentName: string;
  agentRole: string;
};

export type ThinkingState = {
  byRunId: Record<
    string,
    {
      phases: Record<
        string,
        {
          groups: Record<string, { items: ThinkingDeltaItem[] }>;
        }
      >;
    }
  >;
};

export const EMPTY_THINKING_STATE: ThinkingState = {
  byRunId: {},
};
```

Reducer rules:

```ts
if (event.event_name === "thinking.reasoning_delta") {
  // append by run -> phase -> group
}
if (event.event_name === "thinking.phase_flushed") {
  // clear that run/phase/group bucket
}
```

- [ ] **Step 5: Re-run reducer tests**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/thinking-state.test.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/thinking-state.ts src/components/thread/analytics-types.ts src/components/thread/__tests__/thinking-state.test.ts
git commit -m "feat: add dual-channel thinking state reducer"
```

## Task 3: Reconnect `Stream` to thinking custom events

**Files:**
- Modify: `src/providers/Stream.tsx`
- Test: `src/components/thread/__tests__/thinking-state.test.ts`

- [ ] **Step 1: Write the failing behavior checklist**

Expected failures before code changes:

```text
1. Stream ignores kind="thinking" events
2. thinkingState is not available in StreamContext
3. thread change does not clear thinking buckets
```

- [ ] **Step 2: Implement separate `thinkingState` in `StreamSession`**

Update context type:

```ts
type StreamContextType = ReturnType<typeof useTypedStream> & {
  analyticsState: AnalyticsState;
  thinkingState: ThinkingState;
};
```

State setup:

```ts
const [thinkingState, setThinkingState] = useState<ThinkingState>(
  EMPTY_THINKING_STATE,
);
```

Custom event handling:

```ts
if (event && typeof event === "object" && event.kind === "thinking") {
  setThinkingState((prev) =>
    appendThinkingEvent(prev, event as ThinkingEventEnvelope),
  );
  return;
}
```

Reset effect:

```ts
useEffect(() => {
  setThinkingState(EMPTY_THINKING_STATE);
}, [threadId, assistantId, apiUrl]);
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
./node_modules/.bin/eslint src/providers/Stream.tsx src/components/thread/thinking-state.ts src/components/thread/analytics-types.ts
```

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git add src/providers/Stream.tsx src/components/thread/thinking-state.ts src/components/thread/analytics-types.ts
git commit -m "feat: reconnect stream thinking custom events"
```

## Task 4: Implement durable-plus-transient thinking rendering

**Files:**
- Modify: `src/components/thread/thinking-trace-card.tsx`
- Modify: `src/components/thread/index.tsx`
- Modify: `src/components/thread/analytics-types.ts`

- [ ] **Step 1: Write the failing component test checklist**

Expected failures before the refactor:

```text
1. ThinkingTraceCard only renders snapshot.details
2. detail_groups are ignored
3. transient custom items cannot be overlaid
```

- [ ] **Step 2: Extend the snapshot type for durable grouped reasoning**

In `src/components/thread/analytics-types.ts`, update the step shape:

```ts
export type ThinkingTraceStep = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed" | "failed";
  details?: Array<{
    kind?: string;
    agent_name?: string;
    text?: string;
  }>;
  detail_groups?: ThinkingDetailGroup[];
};
```

- [ ] **Step 3: Refactor `ThinkingTraceCard` props**

New props:

```ts
type ThinkingTraceCardProps = {
  snapshot: ThinkingTraceSnapshot;
  runBucket?: ThinkingRunBucket | null;
  isLoading: boolean;
};
```

Merge algorithm:

```ts
function buildRenderedGroups(
  step: ThinkingTraceStep,
  phaseBucket?: ThinkingPhaseBucket,
) {
  const durableGroups = step.detail_groups ?? [];
  const transientGroups = phaseBucket?.groups ?? {};

  return [
    ...durableGroups.map((group) => ({
      groupId: group.group_id,
      agentName: group.agent_name,
      agentRole: group.agent_role,
      items: [...group.items],
    })),
    ...Object.entries(transientGroups)
      .filter(([groupId]) => !durableGroups.some((group) => group.group_id === groupId))
      .map(([groupId, group]) => ({
        groupId,
        agentName: group.items[0]?.agentName ?? "unknown-agent",
        agentRole: group.items[0]?.agentRole ?? "unknown-role",
        items: group.items.map((item) => item.text),
      })),
  ];
}
```

Render both:

```tsx
{step.details?.map((detail, index) => (
  <div key={`${step.id}-detail-${index}`}>
    {detail.text ?? ""}
  </div>
))}
{renderedGroups.map((group) => (
  <div key={group.groupId}>
    <div>{group.agentRole} · {group.agentName}</div>
    {group.items.map((item, index) => (
      <div key={`${group.groupId}-${index}`}>{item}</div>
    ))}
  </div>
))}
```

- [ ] **Step 4: Wire the thread-level card in `index.tsx`**

In `src/components/thread/index.tsx`, load:

```ts
const thinkingTraceMessage = getThinkingTraceUIMessage(
  (stream.values as StateType | undefined)?.ui,
);
const thinkingRunId =
  (thinkingTraceMessage?.metadata?.run_id as string | undefined) ??
  (typeof thinkingTraceMessage?.id === "string" && thinkingTraceMessage.id.startsWith("thinking:")
    ? thinkingTraceMessage.id.slice("thinking:".length)
    : undefined);
const thinkingRunBucket =
  thinkingRunId ? stream.thinkingState.byRunId[thinkingRunId] : undefined;
```

Then render:

```tsx
{thinkingTraceMessage?.props ? (
  <ThinkingTraceCard
    snapshot={thinkingTraceMessage.props as ThinkingTraceSnapshot}
    runBucket={thinkingRunBucket}
    isLoading={isLoading}
  />
) : null}
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/index.tsx src/components/thread/thinking-trace-card.tsx src/components/thread/process-trace-helpers.ts src/components/thread/analytics-types.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/index.tsx src/components/thread/thinking-trace-card.tsx src/components/thread/process-trace-helpers.ts src/components/thread/analytics-types.ts
git commit -m "feat: render dual-channel thread-level thinking card"
```

## Task 5: Preserve the run-scoped analytics model while removing cross-contamination

**Files:**
- Modify: `src/components/thread/analytics-state.ts`
- Modify: `src/components/thread/messages/ai.tsx`

- [ ] **Step 1: Re-read the analytics files and confirm there is no residual thinking coupling**

Run:

```bash
sed -n '1,220p' src/components/thread/analytics-state.ts
sed -n '1,220p' src/components/thread/messages/ai.tsx
```

Expected:
- analytics stays run-scoped
- no helper references `thinking` data structures

- [ ] **Step 2: Keep analytics attachment rule exactly as approved**

Required behavior remains:

```ts
const analytics = resolveAnalyticsForMessage({
  message: message as AIMessage,
  lastAiMessageId,
  state: thread.analyticsState,
});
```

No change should re-introduce tool-call or message-level analytics inference.

- [ ] **Step 3: Run focused verification**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/analytics-state.ts src/components/thread/messages/ai.tsx
```

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/thread/analytics-state.ts src/components/thread/messages/ai.tsx
git commit -m "refactor: keep analytics run-scoped and isolated"
```

## Task 6: Final verification and document-level closure

**Files:**
- Modify as needed: only files touched by Tasks 1-5
- Verify: tests, eslint, typecheck blocker classification

- [ ] **Step 1: Run all touched lightweight tests**

Run:

```bash
node --experimental-strip-types --test \
  src/components/thread/__tests__/analytics-state.test.ts \
  src/components/thread/__tests__/thinking-state.test.ts \
  src/components/thread/__tests__/process-trace-helpers.test.ts
```

Expected:
- all tests PASS

- [ ] **Step 2: Run targeted lint for all touched files**

Run:

```bash
./node_modules/.bin/eslint \
  src/providers/Stream.tsx \
  src/components/thread/index.tsx \
  src/components/thread/messages/ai.tsx \
  src/components/thread/process-trace-helpers.ts \
  src/components/thread/thinking-trace-card.tsx \
  src/components/thread/thinking-state.ts \
  src/components/thread/analytics-state.ts \
  src/components/thread/analytics-types.ts \
  src/components/thread/__tests__/analytics-state.test.ts \
  src/components/thread/__tests__/thinking-state.test.ts \
  src/components/thread/__tests__/process-trace-helpers.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Run project typecheck and classify only remaining external blockers**

Run:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
```

Expected:
- if clean, record success
- if blocked, only the pre-existing `.next/types/* 2.ts` duplicate artifacts remain

- [ ] **Step 4: Manual runtime verification checklist**

Verify:

```text
1. thinking card renders as a thread-level process card, not a transcript-inline block
2. reasoning deltas appear during streaming
3. after flush or completion, duplicate transient text disappears
4. page refresh still restores durable thinking card content
5. analytics button still only appears on the current run's last AI message
6. process trace still only shows debug/process entries
```

- [ ] **Step 5: Commit**

```bash
git add \
  src/providers/Stream.tsx \
  src/components/thread/index.tsx \
  src/components/thread/messages/ai.tsx \
  src/components/thread/process-trace-helpers.ts \
  src/components/thread/thinking-trace-card.tsx \
  src/components/thread/thinking-state.ts \
  src/components/thread/analytics-state.ts \
  src/components/thread/analytics-types.ts \
  src/components/thread/__tests__/analytics-state.test.ts \
  src/components/thread/__tests__/thinking-state.test.ts \
  src/components/thread/__tests__/process-trace-helpers.test.ts \
  docs/2026-07-02-thinking-dual-channel-alignment-design.md \
  docs/2026-07-02-thinking-dual-channel-alignment-implementation-plan.md
git commit -m "feat: align thinking ui with dual-channel architecture"
```

## Self-Review

### Spec coverage

- dual-channel thinking restored: Tasks 2, 3, 4
- thread-level thinking card restored: Tasks 1, 4
- durable UI plus transient custom overlay: Task 4
- analytics remains independent and run-scoped: Task 5
- process trace stays debug-only: Tasks 1, 6

### Placeholder scan

- No `TODO` / `TBD`
- All tasks have exact files and exact commands
- `transcript-types.ts` cleanup is explicitly covered
- Code-shape steps include concrete signatures, reducer rules, and render snippets without placeholders

### Type consistency

- `ThinkingEventEnvelope` is the only custom thinking event type
- `ThinkingState` uses `run -> phase -> group`
- `ThinkingTraceCard` only consumes `snapshot + runBucket`
- analytics remains separate and run-scoped
