export const STATE_TABS = [
  "main",
  "gas_need",
  "food_supply",
  "food_need",
  "gas_supply",
] as const;

export const SKILLS_TABS = [
  "all",
  "gas_need",
  "food_supply",
  "food_need",
  "gas_supply",
] as const;

export type StateTabId = (typeof STATE_TABS)[number];
export type SkillsTabId = (typeof SKILLS_TABS)[number];

export const STATE_TAB_LABELS: Record<StateTabId, string> = {
  main: "main",
  gas_need: "gas_need",
  food_supply: "food_supply",
  food_need: "food_need",
  gas_supply: "gas_supply",
};

export const SKILLS_TAB_LABELS: Record<SkillsTabId, string> = {
  all: "全部",
  gas_need: "gas_need",
  food_supply: "food_supply",
  food_need: "food_need",
  gas_supply: "gas_supply",
};

const SPECIALIST_AGENT_NAMES = {
  gas_need: "gas_need_specialist",
  food_supply: "food_supply_specialist",
  food_need: "food_need_specialist",
  gas_supply: "gas_supply_specialist",
} as const;

export function getChildStateSpecialist(tab: StateTabId): string | null {
  if (tab === "main") {
    return null;
  }
  return tab;
}

export function getSkillsAgentName(tab: SkillsTabId): string | null {
  if (tab === "all") {
    return null;
  }
  return SPECIALIST_AGENT_NAMES[tab];
}

export function buildWorkbenchCacheKey(args: {
  threadId: string | null | undefined;
  panel: "state" | "skills" | "memory";
  tab: string;
}): string {
  return `${args.threadId ?? "no-thread"}:${args.panel}:${args.tab}`;
}
