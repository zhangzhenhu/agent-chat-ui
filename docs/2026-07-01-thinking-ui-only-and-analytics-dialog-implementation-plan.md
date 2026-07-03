# Thinking UI-Only And Analytics Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `thinking_trace` the only user-facing thinking UI shown before the corresponding AI message, while keeping `analytics` on a separate button-driven dialog with explicit direct/fallback grouping.

**Architecture:** The frontend will stop rendering thinking from raw/custom fallbacks and instead treat `thread.values.ui` `thinking_trace` as the sole formal thinking source. Analytics will remain on the `custom` stream, collected into a dedicated local store and attached to each AI response through a two-level association model: direct binding first, current-run-last-AI fallback second.

**Tech Stack:** Next.js, React 19, `@langchain/langgraph-sdk/react`, `@langchain/langgraph-sdk/react-ui`, TypeScript, existing `agent-chat-ui` thread/message components.

---

## File Structure

### Existing files to modify

- `src/providers/Stream.tsx`
  - Keep `ui` merge behavior via `onCustomEvent`
  - Add analytics-only custom-event state
  - Clear analytics state when thread / assistant context changes
  - Do **not** consume thinking custom events for rendering

- `src/components/thread/index.tsx`
  - Own transcript ordering
  - Insert `ThinkingTraceCard` before the resolved AI message instead of after it
  - Keep `ProcessTraceCard` for debug-oriented tool/process output only

- `src/components/thread/messages/ai.tsx`
  - Render AI text + message-bound result cards + analytics button
  - Accept pre-resolved thinking card content from parent rather than re-deriving it locally

- `src/components/thread/process-trace-helpers.ts`
  - Restore/debug-only process trace derivation
  - Add helpers that resolve `thinking_trace` placement and analytics association without mutating transcript order

### New files to create

- `src/components/thread/analytics-state.ts`
  - Local analytics store types and reducers
  - Direct binding and fallback binding helpers

- `src/components/thread/analytics-types.ts`
  - Analytics envelope / thinking trace UI prop types

- `src/components/thread/thinking-trace-card.tsx`
  - UI-only thinking renderer for `thinking_trace`
  - Supports both direct-bound and fallback-bound display metadata

- `src/components/thread/messages/analytics-sheet.tsx`
  - Dialog UI that displays grouped analytics rows:
    - `Directly Related`
    - `Fallback From Current Run`
    - `Thread Context`

- `src/components/thread/transcript-types.ts`
  - Narrow local types for transcript blocks so `index.tsx` can render a mixed sequence of:
    - human messages
    - thinking blocks
    - assistant messages

## Planned transcript and association rules

### Thinking placement

- Formal source: `thread.values.ui[]` where `type === "ui"` and `name === "thinking_trace"`
- Preferred placement:
  - If `metadata.message_id` exists: render before the matched AI message
  - Else if the thinking card belongs to the active run: render before the active run’s last AI message
  - Else keep it out of standalone historical transcript placement

### Analytics placement

- Formal source: `custom` events where `kind === "analytics"`
- Grouping:
  - `Directly Related`: explicit `message_id` or resolvable `tool_call_id`
  - `Fallback From Current Run`: no explicit message anchor, but event belongs to the same active run as the AI message
  - `Thread Context`: event does not safely bind to a single AI message

### Process trace boundary

- `ProcessTraceCard` remains a debug/process panel
- It must not become the formal thinking UI
- It may keep tool-call/tool-result and optional compatibility reasoning fallback if still needed for internal debugging

## Task 1: Revert the incorrect temporary behavior and restore clear responsibilities

**Files:**
- Modify: `src/components/thread/process-trace-helpers.ts`
- Modify: `src/components/thread/index.tsx`
- Test/verify: typecheck + eslint commands for these files

- [ ] **Step 1: Write the failing review checklist as comments in the plan implementation branch**

Document these expected failures before editing:

```text
1. thinking trace must not be derived from custom events for user-facing UI
2. analytics state must not leak across thread changes
3. process trace must not be emptied out entirely
4. transcript order must support ThinkingTraceCard before AIMessage
```

- [ ] **Step 2: Re-read the current helper behavior and confirm the exact regression points**

Run:

```bash
sed -n '1,220p' src/components/thread/process-trace-helpers.ts
sed -n '150,260p' src/components/thread/index.tsx
```

Expected:
- `getInternalTraceEntries(...)` is currently over-trimmed or returning the wrong data
- thinking placement is not yet modeled as a first-class transcript block

- [ ] **Step 3: Restore `getInternalTraceEntries(...)` to debug-only behavior**

Implement the helper so it once again derives process/debug entries from message history:

```ts
export function getInternalTraceEntries(
  messages: Message[],
  isLoading: boolean,
): InternalTraceEntry[] {
  const entries: InternalTraceEntry[] = [];

  for (const message of messages) {
    if (message.type === "ai" && message.id) {
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        entries.push({
          key: `tool_call:${message.id}`,
          kind: "tool_call",
          payload: message.tool_calls,
          isStreaming: isLoading,
        });
      }
      continue;
    }

    if (message.type === "tool" && message.id) {
      entries.push({
        key: `tool_result:${message.id}`,
        kind: "tool_result",
        payload: message,
        isStreaming: isLoading,
      });
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run focused verification for the restored helper behavior**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/process-trace-helpers.ts src/components/thread/index.tsx
```

Expected:
- no new lint errors in these files

- [ ] **Step 5: Commit**

```bash
git add src/components/thread/process-trace-helpers.ts src/components/thread/index.tsx
git commit -m "refactor: restore debug trace boundaries"
```

## Task 2: Add a dedicated analytics state model with direct/fallback/thread scopes

**Files:**
- Create: `src/components/thread/analytics-types.ts`
- Create: `src/components/thread/analytics-state.ts`
- Test/verify: `eslint` on both files

- [ ] **Step 1: Write the failing type contract first**

Create envelope and state types that encode the intended grouping explicitly:

```ts
export type AnalyticsEventGroup =
  | "direct"
  | "fallback_run"
  | "thread_context";

export type AnalyticsResolution = {
  group: AnalyticsEventGroup;
  messageId?: string;
  runId?: string;
};
```

- [ ] **Step 2: Verify the files do not exist yet / need replacement**

Run:

```bash
test -f src/components/thread/analytics-state.ts && echo exists
test -f src/components/thread/analytics-types.ts && echo exists
```

Expected:
- if they already exist from the abandoned attempt, they will be replaced with the stricter design

- [ ] **Step 3: Implement the minimal analytics store around the approved grouping rules**

Core reducer shape:

```ts
export type AnalyticsState = {
  byRunId: Record<string, AnalyticsEventEnvelope[]>;
  byToolCallId: Record<string, AnalyticsEventEnvelope[]>;
  threadContext: AnalyticsEventEnvelope[];
};

export function appendAnalyticsEvent(
  prev: AnalyticsState,
  event: AnalyticsEventEnvelope,
): AnalyticsState {
  const runId = getRunId(event);
  const toolCallId = getToolCallId(event);

  return {
    byRunId: runId
      ? { ...prev.byRunId, [runId]: [...(prev.byRunId[runId] ?? []), event] }
      : prev.byRunId,
    byToolCallId: toolCallId
      ? {
          ...prev.byToolCallId,
          [toolCallId]: [...(prev.byToolCallId[toolCallId] ?? []), event],
        }
      : prev.byToolCallId,
    threadContext: runId || toolCallId ? prev.threadContext : [...prev.threadContext, event],
  };
}
```

- [ ] **Step 4: Add resolution helpers that do not guess more than the plan allows**

Provide helpers like:

```ts
export function resolveAnalyticsForMessage(args: {
  message: AIMessage;
  activeRunId?: string;
  state: AnalyticsState;
}): {
  direct: AnalyticsEventEnvelope[];
  fallbackRun: AnalyticsEventEnvelope[];
  threadContext: AnalyticsEventEnvelope[];
} {
  // direct by tool_call_id
  // fallback by active run
  // thread context from global pool
}
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/analytics-state.ts src/components/thread/analytics-types.ts
```

Expected:
- no lint errors

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/analytics-state.ts src/components/thread/analytics-types.ts
git commit -m "feat: add analytics association state model"
```

## Task 3: Restrict `Stream` to analytics custom events and clear state on context changes

**Files:**
- Modify: `src/providers/Stream.tsx`
- Test/verify: eslint + targeted typecheck for this file

- [ ] **Step 1: Write the failing behavior checklist**

Expected failures before the fix:

```text
1. thinking custom events are currently consumed even though UI-only thinking is the target
2. analytics state survives thread changes
3. provider state shape does not communicate direct/fallback/thread grouping clearly
```

- [ ] **Step 2: Re-read the current provider hook and locate the custom-event branch**

Run:

```bash
sed -n '120,220p' src/providers/Stream.tsx
```

Expected:
- current `onCustomEvent` branch still contains logic that is broader than analytics-only consumption

- [ ] **Step 3: Implement analytics-only custom-event consumption**

Target shape:

```ts
onCustomEvent: (event, options) => {
  if (isUIMessage(event) || isRemoveUIMessage(event)) {
    options.mutate((prev) => ({
      ...prev,
      ui: uiMessageReducer(prev.ui ?? [], event),
    }));
    return;
  }

  if (event && typeof event === "object" && event.kind === "analytics") {
    setAnalyticsState((prev) => appendAnalyticsEvent(prev, event));
  }
}
```

- [ ] **Step 4: Clear analytics state whenever the stream context changes materially**

Add a reset effect similar to:

```ts
useEffect(() => {
  setAnalyticsState(EMPTY_ANALYTICS_STATE);
}, [threadId, assistantId, apiUrl]);
```

This is required to avoid cross-thread leakage.

- [ ] **Step 5: Run verification**

Run:

```bash
./node_modules/.bin/eslint src/providers/Stream.tsx
```

Expected:
- no new lint errors beyond any pre-existing file-level warnings

- [ ] **Step 6: Commit**

```bash
git add src/providers/Stream.tsx
git commit -m "feat: scope stream custom events to analytics"
```

## Task 4: Model transcript blocks so thinking can render before AI messages

**Files:**
- Create: `src/components/thread/transcript-types.ts`
- Modify: `src/components/thread/process-trace-helpers.ts`
- Modify: `src/components/thread/index.tsx`
- Test/verify: eslint for these files

- [ ] **Step 1: Define transcript block types before implementing order changes**

Create:

```ts
export type TranscriptBlock =
  | { kind: "human"; message: Message }
  | { kind: "thinking"; messageId: string; fallback: boolean; snapshot: ThinkingTraceSnapshot }
  | { kind: "assistant"; message: Message };
```

- [ ] **Step 2: Build a helper that resolves the active run’s last AI message**

Use a narrow helper signature:

```ts
export function resolveActiveRunLastAiMessageId(args: {
  messages: Message[];
  activeRunId?: string;
}): string | null {
  // return the last AI message id visible for the current run window
}
```

Keep this helper conservative. It must return `null` instead of guessing across thread history.

- [ ] **Step 3: Build a helper that transforms `messages + ui` into transcript blocks**

Implementation outline:

```ts
export function buildTranscriptBlocks(args: {
  messages: Message[];
  ui: UIMessage[];
  activeRunId?: string;
}): TranscriptBlock[] {
  // emit human blocks directly
  // emit thinking block before matched AI message
  // use fallback binding only when the current active run has no direct message_id binding
  // emit assistant block after the thinking block
}
```

- [ ] **Step 4: Replace direct `transcriptMessages.map(...)` rendering with `TranscriptBlock[]` rendering**

In `index.tsx`, replace the plain message loop with:

```tsx
{transcriptBlocks.map((block, index) => {
  if (block.kind === "human") {
    return <HumanMessage key={...} message={block.message} isLoading={isLoading} />;
  }

  if (block.kind === "thinking") {
    return (
      <ThinkingTraceCard
        key={`thinking-${block.messageId}`}
        snapshot={block.snapshot}
        isLoading={isLoading}
        fallback={block.fallback}
      />
    );
  }

  return (
    <AssistantMessage
      key={...}
      message={block.message}
      isLoading={isLoading}
      handleRegenerate={handleRegenerate}
    />
  );
})}
```

- [ ] **Step 5: Run verification**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/index.tsx src/components/thread/process-trace-helpers.ts src/components/thread/transcript-types.ts
```

Expected:
- no new lint errors

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/index.tsx src/components/thread/process-trace-helpers.ts src/components/thread/transcript-types.ts
git commit -m "feat: render thinking before assistant messages"
```

## Task 5: Implement the UI-only `ThinkingTraceCard`

**Files:**
- Modify: `src/components/thread/thinking-trace-card.tsx`
- Test/verify: eslint for this file

- [ ] **Step 1: Write the component API so it matches the plan**

Component signature:

```ts
type ThinkingTraceCardProps = {
  snapshot: ThinkingTraceSnapshot;
  isLoading: boolean;
  fallback: boolean;
};
```

- [ ] **Step 2: Remove any dependency on thinking custom-event buckets**

Delete any logic that merges UI snapshot details with custom-event phase text.  
The card must render only what exists in `thinking_trace.props`.

- [ ] **Step 3: Keep rendering focused on phase/status/details**

Minimal rendering responsibilities:

```tsx
{snapshot.steps?.map((step) => (
  <div key={step.id}>
    <div>{step.title}</div>
    <div>{step.status}</div>
    {step.details?.map((detail, i) => (
      <div key={`${step.id}-${i}`}>{detail.text}</div>
    ))}
  </div>
))}
```

- [ ] **Step 4: Add a lightweight fallback badge**

If `fallback === true`, render a subtle label such as:

```tsx
<span className="text-[11px] text-slate-500">Fallback run binding</span>
```

This preserves the distinction between direct and inferred placement without cluttering the main UI.

- [ ] **Step 5: Run verification**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/thinking-trace-card.tsx
```

Expected:
- no lint errors

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/thinking-trace-card.tsx
git commit -m "feat: add ui-only thinking trace card"
```

## Task 6: Implement grouped analytics dialog behavior

**Files:**
- Modify: `src/components/thread/messages/analytics-sheet.tsx`
- Modify: `src/components/thread/messages/ai.tsx`
- Modify: `src/components/thread/analytics-state.ts`
- Test/verify: eslint for these files

- [ ] **Step 1: Change the dialog props so it accepts grouped data, not a flat list**

Target props:

```ts
type AnalyticsSheetProps = {
  direct: AnalyticsEventEnvelope[];
  fallbackRun: AnalyticsEventEnvelope[];
  threadContext: AnalyticsEventEnvelope[];
};
```

- [ ] **Step 2: Add grouped sections to the dialog**

Render sections in this order:

```tsx
<Section title="Directly Related" events={direct} />
<Section title="Fallback From Current Run" events={fallbackRun} />
<Section title="Thread Context" events={threadContext} />
```

Hide empty sections entirely.

- [ ] **Step 3: Resolve grouped analytics in `AssistantMessage` instead of flattening by ad-hoc ids**

Use the reducer helper:

```ts
const analyticsGroups = resolveAnalyticsForMessage({
  message: message as AIMessage,
  activeRunId: ...,
  state: thread.analyticsState,
});
```

Then pass:

```tsx
<AnalyticsSheet
  direct={analyticsGroups.direct}
  fallbackRun={analyticsGroups.fallbackRun}
  threadContext={analyticsGroups.threadContext}
/>
```

- [ ] **Step 4: Keep the analytics button hidden when all groups are empty**

Guard:

```ts
const hasAnalytics =
  direct.length > 0 || fallbackRun.length > 0 || threadContext.length > 0;
```

- [ ] **Step 5: Run verification**

Run:

```bash
./node_modules/.bin/eslint src/components/thread/messages/analytics-sheet.tsx src/components/thread/messages/ai.tsx src/components/thread/analytics-state.ts
```

Expected:
- no new lint errors

- [ ] **Step 6: Commit**

```bash
git add src/components/thread/messages/analytics-sheet.tsx src/components/thread/messages/ai.tsx src/components/thread/analytics-state.ts
git commit -m "feat: group analytics dialog by direct and fallback scopes"
```

## Task 7: Final verification and cleanup of the abandoned attempt

**Files:**
- Modify as needed: only files touched by Tasks 1-6
- Test/verify: full targeted lint + project typecheck evidence

- [ ] **Step 1: Re-read the touched files and remove dead code from the abandoned attempt**

Check for:

```text
- thinking custom-event accumulation code still present
- messageId maps that are no longer used
- comments that mention the rejected mixed-source design
```

- [ ] **Step 2: Run focused lint across all touched files**

Run:

```bash
./node_modules/.bin/eslint \
  src/providers/Stream.tsx \
  src/components/thread/index.tsx \
  src/components/thread/messages/ai.tsx \
  src/components/thread/messages/analytics-sheet.tsx \
  src/components/thread/process-trace-helpers.ts \
  src/components/thread/thinking-trace-card.tsx \
  src/components/thread/analytics-state.ts \
  src/components/thread/analytics-types.ts \
  src/components/thread/transcript-types.ts
```

Expected:
- zero new lint errors
- only pre-existing file-structure warnings are acceptable if unchanged

- [ ] **Step 3: Run project typecheck and explicitly classify existing blockers**

Run:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
```

Expected:
- if clean, record success
- if blocked by pre-existing `.next/types/* 2.ts` duplicate artifacts, record that exact blocker and confirm no new source-file type errors remain

- [ ] **Step 4: Capture manual runtime verification steps**

After local dev startup, verify:

```text
1. thinking trace appears before the final AI message
2. normal result cards still appear after the AI message
3. analytics button opens a grouped dialog
4. thread switch clears old analytics
5. process trace still shows debug tool activity
```

- [ ] **Step 5: Commit**

```bash
git add src/providers/Stream.tsx src/components/thread/index.tsx src/components/thread/messages/ai.tsx src/components/thread/messages/analytics-sheet.tsx src/components/thread/process-trace-helpers.ts src/components/thread/thinking-trace-card.tsx src/components/thread/analytics-state.ts src/components/thread/analytics-types.ts src/components/thread/transcript-types.ts
git commit -m "feat: align thinking ui and analytics dialog behavior"
```

## Self-Review

### Spec coverage

- `thinking` only through UI: covered by Tasks 3, 4, 5
- `thinking_trace` before AIMessage: covered by Task 4
- analytics separate button/dialog: covered by Task 6
- fallback to current run’s last AI message: covered by Tasks 2, 4, 6
- keep process/debug trace separate: covered by Task 1

### Placeholder scan

- No `TODO` / `TBD`
- Every task names exact files and exact commands
- Code-shape steps include concrete signatures or snippets

### Type consistency

- `ThinkingTraceSnapshot` remains the single UI thinking prop type
- analytics grouping vocabulary is consistent: `direct`, `fallbackRun`, `threadContext`
- transcript rendering uses one local `TranscriptBlock` type rather than ad-hoc unions in component code

Plan complete and saved to `docs/2026-07-01-thinking-ui-only-and-analytics-dialog-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
