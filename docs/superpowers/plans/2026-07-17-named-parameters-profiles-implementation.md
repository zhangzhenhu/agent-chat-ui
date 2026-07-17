# Named Parameters Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Parameters panel's single draft with browser-local, named profiles that users can create, switch, rename, and delete without losing raw JSON edits.

**Architecture:** Keep all profile persistence and immutable state transitions in `params-storage.ts`, so malformed `localStorage` and profile lifecycle rules are tested without React. `Thread` owns the selected profile store, derives the valid submit payload from the active profile, and persists the store. `ParamsPanel` becomes a controlled card UI for selecting and managing profiles alongside the existing JSON editors.

**Tech Stack:** Next.js, React 19, TypeScript, existing Radix dropdown/dialog primitives, Lucide icons, `node:test` with Node TypeScript stripping.

---

## File Structure

- Modify: `src/components/thread/params-storage.ts`
  - Versioned profile-store types, strict parsers, legacy-draft migration, and pure profile state transitions.
- Modify: `src/components/thread/__tests__/params-storage.test.ts`
  - Storage parsing, migration, and all profile lifecycle regression coverage.
- Modify: `src/components/thread/params-panel.tsx`
  - Controlled profile selector, create/rename/delete dialogs, and JSON editor callbacks.
- Modify: `src/components/thread/index.tsx`
  - Hydrate/persist the profile store, derive current `CustomParams`, and keep submissions bound to the active profile.

### Task 1: Define And Test The Profile Store

**Files:**
- Modify: `src/components/thread/params-storage.ts`
- Modify: `src/components/thread/__tests__/params-storage.test.ts`

- [ ] **Step 1: Replace the existing storage imports with the profile-store API in the test file**

Add imports for `createParamsProfile`, `createParamsProfileStore`,
`parseParamsProfileStore`, `serializeParamsProfileStore`,
`migrateStoredParamsDraft`, `updateActiveParamsProfile`,
`selectParamsProfile`, `renameActiveParamsProfile`, and
`deleteActiveParamsProfile`, plus `getActiveParamsProfile` and
`appendAndSelectParamsProfile`.

- [ ] **Step 2: Write failing tests for parsing, migration, and immutable lifecycle transitions**

Add deterministic fixtures that pass explicit IDs and timestamps. Cover these
contracts:

```ts
test("migrates the legacy raw draft into one active named profile", () => {
  const store = migrateStoredParamsDraft({
    legacyDraft: {
      configurableText: '{"temperature":',
      inputText: '{"user_id":"u-1"}',
      configurable: null,
      input: { user_id: "u-1" },
    },
    id: "profile-1",
    updatedAt: "2026-07-17T00:00:00.000Z",
  });

  assert.deepEqual(store, {
    version: 1,
    activeProfileId: "profile-1",
    profiles: [{
      id: "profile-1",
      name: "Untitled profile",
      configurableText: '{"temperature":',
      inputText: '{"user_id":"u-1"}',
      updatedAt: "2026-07-17T00:00:00.000Z",
    }],
  });
});

test("updates, selects, renames, and deletes profiles without losing an active profile", () => {
  const first = createParamsProfile({
    id: "first",
    name: "First",
    configurableText: '{"temperature":',
    inputText: "",
    updatedAt: "2026-07-17T00:00:00.000Z",
  });
  const second = createParamsProfile({
    id: "second",
    name: "Second",
    updatedAt: "2026-07-17T00:01:00.000Z",
  });
  const initial = createParamsProfileStore(first);
  const withSecond = appendAndSelectParamsProfile(initial, second);
  const renamed = renameActiveParamsProfile(withSecond, "  Production  ", "2026-07-17T00:02:00.000Z");
  const afterDelete = deleteActiveParamsProfile(renamed);

  assert.equal(afterDelete?.activeProfileId, "first");
  assert.equal(getActiveParamsProfile(afterDelete!).name, "First");
  assert.equal(getActiveParamsProfile(afterDelete!).configurableText, '{"temperature":');
});

test("rejects malformed profile storage and blank names", () => {
  assert.equal(parseParamsProfileStore("{bad json"), null);
  assert.throws(() => createParamsProfile({ name: "   ", id: "p", updatedAt: "t" }));
});
```

- [ ] **Step 3: Run the focused test to verify it fails**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/params-storage.test.ts
```

Expected: FAIL because the profile-store exports and transitions do not exist.

- [ ] **Step 4: Implement the profile-store API in `params-storage.ts`**

Replace the single-draft persistence shape with these exact public types and
functions while retaining `buildStoredParamsDraft` for deriving valid request
objects from raw text:

```ts
export const PARAMS_PROFILES_STORAGE_KEY = "agent-chat-ui:parameters-profiles";
export const LEGACY_PARAMS_STORAGE_KEY = "agent-chat-ui:custom-params-draft";

export type ParamsProfile = {
  id: string;
  name: string;
  configurableText: string;
  inputText: string;
  updatedAt: string;
};

export type ParamsProfileStore = {
  version: 1;
  activeProfileId: string;
  profiles: ParamsProfile[];
};
```

Implement the store parser to accept only `version === 1`, a non-empty profile
array, a matching active ID, and profiles with non-empty string IDs/names and
string text/timestamps. `createParamsProfile` trims the name and throws for an
empty result. `updateActiveParamsProfile` replaces raw texts and timestamp;
`selectParamsProfile` throws for a missing ID; `renameActiveParamsProfile`
uses the same name validation; `deleteActiveParamsProfile` selects the next
remaining profile and returns `null` only when the removed profile was the
last one. `getActiveParamsProfile` returns the profile matching the active ID
and throws only when a caller breaks the validated store invariant.
`appendAndSelectParamsProfile` appends one new profile and makes its ID active.
`serializeParamsProfileStore` serializes only the persistent shape.

- [ ] **Step 5: Run the focused profile-store test to verify it passes**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/params-storage.test.ts
```

Expected: all legacy-draft and profile-store tests pass.

- [ ] **Step 6: Commit the storage contract**

```bash
git add src/components/thread/params-storage.ts src/components/thread/__tests__/params-storage.test.ts
git commit -m "feat: add named parameter profile storage"
```

### Task 2: Hydrate And Persist The Active Profile In Thread

**Files:**
- Modify: `src/components/thread/index.tsx`
- Modify: `src/components/thread/params-storage.ts`
- Test: `src/components/thread/__tests__/params-storage.test.ts`

- [ ] **Step 1: Add a failing test for creating an initial store from defaults**

Add a test for an exported `createInitialParamsProfileStore` helper. Given a
default `{ configurable: { temperature: 0.7 }, input: { user_id: "u-1" } }`,
it must create one selected `Untitled profile` with pretty-printed raw text.
Given no defaults, it must create a selected empty profile. Keep all generated
values deterministic by supplying ID and timestamp arguments.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/params-storage.test.ts
```

Expected: FAIL because the initial-store helper does not yet exist.

- [ ] **Step 3: Implement `createInitialParamsProfileStore` and replace Thread's single-draft state**

In `params-storage.ts`, add the pure initial-store helper described by the
test. In `src/components/thread/index.tsx`:

1. Replace `customParams`, `paramsDraft`, and `paramsKey` with
   `paramsProfileStore: ParamsProfileStore | null`.
2. On first client load, read `PARAMS_PROFILES_STORAGE_KEY`. When valid, use
   it. Otherwise parse `LEGACY_PARAMS_STORAGE_KEY`; when present, migrate it
   and remove the legacy key only after persisting the new store. Otherwise
   fetch `/default-params.json` and create an initial store; a failed fetch
   creates an empty one.
3. Persist each non-null store with `serializeParamsProfileStore`.
4. Derive `activeParamsProfile` from `activeProfileId` and derive
   `customParams` with `buildStoredParamsDraft(activeParamsProfile)` rather
   than storing parsed objects separately.
5. Keep `handleSubmit` and `handleRegenerate` unchanged except for consuming
   that derived `customParams`.

Do not render `ParamsPanel` until the store is hydrated, preventing the empty
initial render from overwriting persisted data.

- [ ] **Step 4: Run the storage tests and static type check**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/params-storage.test.ts
./node_modules/.bin/tsc --noEmit --incremental false
```

Expected: profile storage tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the Thread persistence wiring**

```bash
git add src/components/thread/index.tsx src/components/thread/params-storage.ts src/components/thread/__tests__/params-storage.test.ts
git commit -m "feat: persist active parameter profile"
```

### Task 3: Add In-Card Profile Selection And Management

**Files:**
- Modify: `src/components/thread/params-panel.tsx`
- Modify: `src/components/thread/index.tsx`

- [ ] **Step 1: Change `ParamsPanel` to a controlled active-profile interface**

Replace `initialDraft` and `onDraftChange` with these props:

```ts
profile: ParamsProfile;
profiles: ParamsProfile[];
onSelectProfile: (profileId: string) => void;
onUpdateProfile: (texts: Pick<ParamsProfile, "configurableText" | "inputText">) => void;
onCreateProfile: (args: { name: string; mode: "copy" | "empty" }) => void;
onRenameProfile: (name: string) => void;
onDeleteProfile: () => void;
```

Use `profile.configurableText` and `profile.inputText` directly as textarea
values. Call `onUpdateProfile` from each textarea change. Parse those values
locally only to render validation errors; `Thread` remains responsible for
deriving the request payload.

- [ ] **Step 2: Add the selector and management controls using existing primitives**

Use `DropdownMenu` for profile selection and `TooltipIconButton` with Lucide
`Plus`, `Pencil`, and `Trash2` actions. The selector button must constrain a
long name with `max-w`, `truncate`, and a fixed control height. Use one
controlled `Dialog` for create/rename name entry and one confirmation `Dialog`
for deletion.

The selector shape is:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" className="h-7 max-w-48 justify-between">
      <span className="truncate">{profile.name}</span>
      <ChevronDown className="size-3" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start">
    {profiles.map((candidate) => (
      <DropdownMenuItem key={candidate.id} onSelect={() => onSelectProfile(candidate.id)}>
        {candidate.name}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

The create dialog exposes two commands: `Copy current` and `Empty`, both
require a nonblank name. The rename dialog pre-fills the active name. The
delete dialog names the profile being removed. Disable submission for a blank
trimmed name. Use tooltips and accessible labels for icon-only actions.

- [ ] **Step 3: Wire the UI callbacks in `Thread` through the pure store transitions**

Generate IDs with `crypto.randomUUID()` and timestamps with
`new Date().toISOString()` at the component boundary. Implement callbacks by
calling `setParamsProfileStore((current) => ...)` and the corresponding helper
from `params-storage.ts`:

```ts
const handleCreateParamsProfile = ({ name, mode }) => {
  setParamsProfileStore((current) => {
    if (!current) return current;
    const source = mode === "copy" ? getActiveParamsProfile(current) : undefined;
    const profile = createParamsProfile({
      id: crypto.randomUUID(),
      name,
      configurableText: source?.configurableText ?? "",
      inputText: source?.inputText ?? "",
      updatedAt: new Date().toISOString(),
    });
    return appendAndSelectParamsProfile(current, profile);
  });
};
```

`onUpdateProfile` must update both raw text fields in one transition so rapid
typing cannot cross-contaminate profiles. Deleting the final profile must
immediately replace it with a new empty `Untitled profile`, preserving the
invariant that the panel always has an active profile.

- [ ] **Step 4: Run type checking and inspect the card in a local browser**

Run:

```bash
./node_modules/.bin/tsc --noEmit --incremental false
pnpm dev
```

Open the local URL and verify: create copied and empty profiles, rename,
delete, switch between profiles with invalid JSON in one profile, refresh the
page, and send one request with a valid active profile. Confirm the sent
`input` and `config.configurable` match only the active profile.

- [ ] **Step 5: Commit the card UI**

```bash
git add src/components/thread/params-panel.tsx src/components/thread/index.tsx
git commit -m "feat: manage named parameter profiles in chat"
```

### Task 4: Final Regression Verification

**Files:**
- Verify: `src/components/thread/params-storage.ts`
- Verify: `src/components/thread/params-panel.tsx`
- Verify: `src/components/thread/index.tsx`
- Verify: `src/components/thread/__tests__/params-storage.test.ts`
- Verify: `src/components/thread/__tests__/submit-config.test.ts`

- [ ] **Step 1: Run focused parameter and submission tests**

Run:

```bash
node --experimental-strip-types --test src/components/thread/__tests__/params-storage.test.ts src/components/thread/__tests__/submit-config.test.ts
```

Expected: all tests pass, including the existing telemetry flag merge contract.

- [ ] **Step 2: Run formatting and TypeScript validation**

Run:

```bash
pnpm format:check
./node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

Expected: all commands exit successfully with no formatting, type, or
whitespace errors.

- [ ] **Step 3: Inspect the final change set and commit verification fixes if needed**

Run:

```bash
git status --short
git diff --check
```

If verification required a tracked code change, commit only those fixes using:

```bash
git add src/components/thread/params-storage.ts src/components/thread/params-panel.tsx src/components/thread/index.tsx src/components/thread/__tests__/params-storage.test.ts
git commit -m "test: cover named parameter profiles"
```
