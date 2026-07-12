import test from "node:test";
import assert from "node:assert/strict";

const {
  buildChildStateUrl,
  buildSkillsListUrl,
  buildSkillFileUrl,
  buildUserMemoryUrl,
} = await import(new URL("../thread-workbench-data.ts", import.meta.url).href);

test("buildChildStateUrl appends debug child-state under the configured api base", () => {
  assert.equal(
    buildChildStateUrl({
      apiUrl: "https://sidemandintel.ecej.com/api",
      specialist: "food_need",
      threadId: "thread-1",
    }),
    "https://sidemandintel.ecej.com/api/debug/child-state?specialist=food_need&thread_id=thread-1",
  );
});

test("buildChildStateUrl adds /api for deployments configured with the root runtime url", () => {
  assert.equal(
    buildChildStateUrl({
      apiUrl: "https://sidemandintel.ecej.com",
      specialist: "food_need",
      threadId: "thread-1",
    }),
    "https://sidemandintel.ecej.com/api/debug/child-state?specialist=food_need&thread_id=thread-1",
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
