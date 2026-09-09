import test from "node:test";
import assert from "node:assert/strict";

const {
  buildChildStateUrl,
  fetchChildThreadState,
  buildSkillsListUrl,
  buildSkillFileUrl,
  buildUserMemoryUrl,
} = await import(new URL("../thread-workbench-data.ts", import.meta.url).href);

test("fetchChildThreadState requests the latest checkpoint snapshot", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ values: { messages: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await fetchChildThreadState({
      apiUrl: "https://sidemandintel.ecej.com/api",
      threadId: "thread-1",
      checkpointNs: "specialist__food_need_specialist",
      apiKey: "key-1",
      authScheme: "internal",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Content-Type"), "application/json");
  assert.equal(request.headers.get("X-Api-Key"), "key-1");
  assert.equal(request.headers.get("X-Auth-Scheme"), "internal");
  assert.deepEqual(await request.json(), {
    checkpoint: {
      thread_id: "thread-1",
      checkpoint_ns: "specialist__food_need_specialist",
      checkpoint_id: "",
      checkpoint_map: {},
    },
    subgraphs: true,
  });
});

test("buildChildStateUrl targets the latest thread state checkpoint endpoint", () => {
  assert.equal(
    buildChildStateUrl({
      apiUrl: "https://sidemandintel.ecej.com/api",
      threadId: "thread-1",
    }),
    "https://sidemandintel.ecej.com/api/threads/thread-1/state/checkpoint",
  );
});

test("buildChildStateUrl uses the root path for deployments configured with the root runtime url", () => {
  assert.equal(
    buildChildStateUrl({
      apiUrl: "https://sidemandintel.ecej.com",
      threadId: "thread-1",
    }),
    "https://sidemandintel.ecej.com/threads/thread-1/state/checkpoint",
  );
});

test("buildSkillsListUrl omits agent_name for the all tab", () => {
  assert.equal(
    buildSkillsListUrl({
      apiUrl: "https://sidemandintel.ecej.com/api",
      agentName: null,
    }),
    "https://sidemandintel.ecej.com/api/debug/skills",
  );
});

test("buildSkillsListUrl includes agent_name for specialist tabs", () => {
  assert.equal(
    buildSkillsListUrl({
      apiUrl: "https://sidemandintel.ecej.com/api/",
      agentName: "gas_need_specialist",
    }),
    "https://sidemandintel.ecej.com/api/debug/skills?agent_name=gas_need_specialist",
  );
});

test("buildSkillsListUrl adds /api for deployments configured with the root runtime url", () => {
  assert.equal(
    buildSkillsListUrl({
      apiUrl: "https://sidemandintel.ecej.com",
      agentName: "gas_need_specialist",
    }),
    "https://sidemandintel.ecej.com/api/debug/skills?agent_name=gas_need_specialist",
  );
});

test("buildSkillFileUrl preserves the raw skill path as a query parameter", () => {
  assert.equal(
    buildSkillFileUrl({
      apiUrl: "https://sidemandintel.ecej.com/api",
      path: "/skills/workshop/standard_template_gas/SKILL.md",
    }),
    "https://sidemandintel.ecej.com/api/debug/skills/file?path=%2Fskills%2Fworkshop%2Fstandard_template_gas%2FSKILL.md",
  );
});

test("buildSkillFileUrl adds /api for deployments configured with the root runtime url", () => {
  assert.equal(
    buildSkillFileUrl({
      apiUrl: "https://sidemandintel.ecej.com",
      path: "/skills/workshop/standard_template_gas/SKILL.md",
    }),
    "https://sidemandintel.ecej.com/api/debug/skills/file?path=%2Fskills%2Fworkshop%2Fstandard_template_gas%2FSKILL.md",
  );
});

test("buildUserMemoryUrl appends debug user-memory under the configured api base", () => {
  assert.equal(
    buildUserMemoryUrl({
      apiUrl: "https://sidemandintel.ecej.com/api",
      currentUserId: "user-1",
    }),
    "https://sidemandintel.ecej.com/api/debug/user-memory?current_user_id=user-1",
  );
});

test("buildUserMemoryUrl adds /api for deployments configured with the root runtime url", () => {
  assert.equal(
    buildUserMemoryUrl({
      apiUrl: "https://sidemandintel.ecej.com",
      currentUserId: "user-1",
    }),
    "https://sidemandintel.ecej.com/api/debug/user-memory?current_user_id=user-1",
  );
});
