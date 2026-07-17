import test from "node:test";
import assert from "node:assert/strict";

const {
  buildStoredParamsDraft,
  parseStoredParamsDraft,
  getStoredParamsDraftText,
  migrateStoredParamsDraft,
  appendAndSelectParamsProfile,
  createParamsProfile,
  createParamsProfileStore,
  createInitialParamsProfileStore,
  deleteActiveParamsProfile,
  getActiveParamsProfile,
  parseParamsProfileStore,
  renameActiveParamsProfile,
  serializeParamsProfileStore,
  selectParamsProfile,
  updateActiveParamsProfile,
} = await import(new URL("../params-storage.ts", import.meta.url).href);

test("buildStoredParamsDraft keeps raw text and parsed values together", () => {
  const draft = buildStoredParamsDraft({
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
  });

  assert.deepEqual(draft, {
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
    configurable: { temperature: 0.7 },
    input: { user_name: "Alice" },
  });
});

test("buildStoredParamsDraft preserves invalid json text while clearing parsed values", () => {
  const draft = buildStoredParamsDraft({
    configurableText: '{"temperature":',
    inputText: "",
  });

  assert.deepEqual(draft, {
    configurableText: '{"temperature":',
    inputText: "",
    configurable: null,
    input: null,
  });
});

test("parseStoredParamsDraft restores only object-shaped payloads", () => {
  const draft = parseStoredParamsDraft(
    JSON.stringify({
      configurableText: '{\n  "temperature": 0.7\n}',
      inputText: '{\n  "user_name": "Alice"\n}',
    }),
  );

  assert.deepEqual(draft, {
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
    configurable: { temperature: 0.7 },
    input: { user_name: "Alice" },
  });
});

test("getStoredParamsDraftText serializes draft for localStorage", () => {
  const text = getStoredParamsDraftText({
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_name": "Alice"\n}',
  });

  assert.equal(
    text,
    JSON.stringify({
      configurableText: '{\n  "temperature": 0.7\n}',
      inputText: '{\n  "user_name": "Alice"\n}',
    }),
  );
});

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
    profiles: [
      {
        id: "profile-1",
        name: "Untitled profile",
        configurableText: '{"temperature":',
        inputText: '{"user_id":"u-1"}',
        updatedAt: "2026-07-17T00:00:00.000Z",
      },
    ],
  });
});

test("keeps each named profile's raw JSON while switching and deleting", () => {
  const first = createParamsProfile({
    id: "first",
    name: "Local",
    configurableText: '{"temperature":',
    inputText: "",
    updatedAt: "2026-07-17T00:00:00.000Z",
  });
  const second = createParamsProfile({
    id: "second",
    name: "Production",
    inputText: '{"user_id":"u-2"}',
    updatedAt: "2026-07-17T00:01:00.000Z",
  });

  const withSecond = appendAndSelectParamsProfile(
    createParamsProfileStore(first),
    second,
  );
  const renamed = renameActiveParamsProfile(
    withSecond,
    "  Production profile  ",
    "2026-07-17T00:02:00.000Z",
  );
  const switched = selectParamsProfile(renamed, "first");
  const updated = updateActiveParamsProfile(
    switched,
    {
      configurableText: '{"temperature":',
      inputText: '{"user_id":"u-1"}',
    },
    "2026-07-17T00:03:00.000Z",
  );
  const afterDelete = deleteActiveParamsProfile(
    selectParamsProfile(updated, "second"),
  );

  assert.equal(afterDelete?.activeProfileId, "first");
  assert.deepEqual(getActiveParamsProfile(afterDelete!), {
    id: "first",
    name: "Local",
    configurableText: '{"temperature":',
    inputText: '{"user_id":"u-1"}',
    updatedAt: "2026-07-17T00:03:00.000Z",
  });
});

test("rejects blank profile names", () => {
  assert.throws(
    () =>
      createParamsProfile({
        id: "profile-1",
        name: "   ",
        updatedAt: "2026-07-17T00:00:00.000Z",
      }),
    /Profile name is required/,
  );
});

test("parses only complete persisted profile stores", () => {
  const store = createParamsProfileStore(
    createParamsProfile({
      id: "profile-1",
      name: "Local",
      inputText: '{"user_id":"u-1"}',
      updatedAt: "2026-07-17T00:00:00.000Z",
    }),
  );

  assert.deepEqual(
    parseParamsProfileStore(serializeParamsProfileStore(store)),
    store,
  );
  assert.equal(parseParamsProfileStore("{bad json"), null);
  assert.equal(
    parseParamsProfileStore(
      JSON.stringify({ ...store, activeProfileId: "missing" }),
    ),
    null,
  );
  assert.equal(
    parseParamsProfileStore(
      JSON.stringify({
        ...store,
        profiles: [store.profiles[0], store.profiles[0]],
      }),
    ),
    null,
  );
});

test("creates an initial profile from defaults or empty values", () => {
  const fromDefaults = createInitialParamsProfileStore({
    defaults: {
      configurable: { temperature: 0.7 },
      input: { user_id: "u-1" },
    },
    id: "defaults",
    updatedAt: "2026-07-17T00:00:00.000Z",
  });
  const empty = createInitialParamsProfileStore({
    defaults: null,
    id: "empty",
    updatedAt: "2026-07-17T00:01:00.000Z",
  });

  assert.deepEqual(getActiveParamsProfile(fromDefaults), {
    id: "defaults",
    name: "Untitled profile",
    configurableText: '{\n  "temperature": 0.7\n}',
    inputText: '{\n  "user_id": "u-1"\n}',
    updatedAt: "2026-07-17T00:00:00.000Z",
  });
  assert.deepEqual(getActiveParamsProfile(empty), {
    id: "empty",
    name: "Untitled profile",
    configurableText: "",
    inputText: "",
    updatedAt: "2026-07-17T00:01:00.000Z",
  });
});
