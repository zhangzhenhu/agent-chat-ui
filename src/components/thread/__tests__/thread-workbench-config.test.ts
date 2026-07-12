import test from "node:test";
import assert from "node:assert/strict";

const {
  STATE_TABS,
  SKILLS_TABS,
  getChildStateSpecialist,
  getSkillsAgentName,
  buildWorkbenchCacheKey,
} = await import(new URL("../thread-workbench-config.ts", import.meta.url).href);

test("state tabs stay fixed in the approved specialist order", () => {
  assert.deepEqual(STATE_TABS, [
    "main",
    "gas_need",
    "food_supply",
    "food_need",
    "gas_supply",
  ]);
});

test("skills tabs stay fixed in the approved specialist order", () => {
  assert.deepEqual(SKILLS_TABS, [
    "all",
    "gas_need",
    "food_supply",
    "food_need",
    "gas_supply",
  ]);
});

test("child state mapping skips main and passes through specialist ids", () => {
  assert.equal(getChildStateSpecialist("main"), null);
  assert.equal(getChildStateSpecialist("gas_need"), "gas_need");
  assert.equal(getChildStateSpecialist("food_supply"), "food_supply");
});

test("skills mapping resolves specialist tabs to backend agent names", () => {
  assert.equal(getSkillsAgentName("all"), null);
  assert.equal(getSkillsAgentName("gas_need"), "gas_need_specialist");
  assert.equal(getSkillsAgentName("food_need"), "food_need_specialist");
});

test("workbench cache key includes thread, panel, and tab", () => {
  assert.equal(
    buildWorkbenchCacheKey({
      threadId: "thread-1",
      panel: "state",
      tab: "gas_need",
    }),
    "thread-1:state:gas_need",
  );
});
