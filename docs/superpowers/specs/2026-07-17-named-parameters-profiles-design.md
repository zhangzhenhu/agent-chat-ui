# Named Parameters Profiles Design

## Goal

Replace the Parameters panel's single global draft with locally persisted,
user-named parameter profiles. A profile contains the raw JSON text for both
`configurable` and `input`, so users can quickly switch between reusable run
parameter sets without losing in-progress edits after a page refresh.

Profiles are browser-local only. They are not sent to the LangGraph API and
are not scoped by `apiUrl` or `assistantId`.

## Scope

The Parameters card remains the primary workflow. It gains a compact profile
selector and actions to create, rename, and delete profiles. The existing
Configurable and Input JSON editors remain the editing surface.

This change does not introduce a separate settings page, backend storage,
profile sharing, import/export, or API URL-based grouping.

## Local Storage Model

One versioned `localStorage` record stores all profiles and the active one:

```ts
type ParametersProfile = {
  id: string;
  name: string;
  configurableText: string;
  inputText: string;
  updatedAt: string;
};

type ParametersProfileStore = {
  version: 1;
  activeProfileId: string;
  profiles: ParametersProfile[];
};
```

The raw text fields are authoritative. Parsed objects are derived only when
the UI needs to submit a run. This preserves incomplete or invalid JSON while
the user edits it.

The parser must reject malformed storage records rather than throw. Names are
trimmed and must not be empty. IDs, not names, identify profiles, so duplicate
names do not corrupt selection or editing.

## Migration And Initial Load

The current `agent-chat-ui:custom-params-draft` value is a legacy single
draft. On the first load without a valid profile store:

1. Parse the legacy draft.
2. When it exists, create one profile named `Untitled profile` using its raw
   text, and select it.
3. When it does not exist, load `public/default-params.json` as today and
   create the initial profile from its valid object fields.
4. When neither source has values, create one empty profile.

After the new store is successfully written, the legacy key can be removed.
The UI never lets a missing or deleted active ID leave the editor without a
profile: it chooses a remaining profile, or creates the empty initial profile.

## Card Interaction

The Parameters card header adds a profile selector that displays the active
profile name. The control supports:

- Selecting a profile, which immediately replaces both editor texts.
- Creating a named profile by copying the active profile's texts.
- Creating a named empty profile.
- Renaming the active profile.
- Deleting the active profile after confirmation; selection moves to the next
  remaining profile.

Typing in either JSON editor updates the active profile automatically. No
separate save operation is required. A switch first persists the current
profile, then loads the selected profile, so a quick switch cannot discard an
edit.

## Run Contract

The submission path keeps its current contract:

- Valid `input` JSON is merged into the run input alongside messages.
- Valid `configurable` JSON is merged into `config.configurable`.
- `emit_telemetry_to_sse` remains enforced by `buildSubmitConfig`.
- Invalid or non-object JSON displays its validation error and contributes no
  field to the request.

Regeneration uses the same active profile's valid `configurable` object.

## Tests

Add focused tests for the storage helpers and panel state transitions:

- Parse and serialize a valid profile store.
- Reject malformed storage without throwing.
- Migrate the legacy raw draft, including invalid JSON text.
- Create profiles by copy and as empty.
- Rename, select, and delete profiles while retaining a valid active ID.
- Preserve raw invalid JSON text across persistence and profile switching.
- Keep the existing submit-config behavior unchanged.

## Non-Goals And Risks

`localStorage` is readable by browser JavaScript on this origin. Profiles
should therefore not be used to store secrets. This feature deliberately does
not attempt cross-browser synchronization or server-side backup.

The card must use deterministic, bounded-width controls so long profile names
do not shift the message composer layout. Management actions should be
available from familiar icon buttons with accessible labels and tooltips.
