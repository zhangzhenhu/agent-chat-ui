import {
  getSpecialistCheckpointNs,
  type SpecialistDomain,
} from "@/components/thread/thread-workbench-config";

export const WORKBENCH_ENVIRONMENTS = [
  { id: "local", label: "本地" },
  { id: "si", label: "SI" },
  { id: "st", label: "ST" },
  { id: "prod", label: "生产" },
] as const;

export type WorkbenchEnvironmentId =
  (typeof WORKBENCH_ENVIRONMENTS)[number]["id"];

export const WORKBENCH_DOMAINS = [
  "gas",
  "food",
  "voyage",
  "haven",
] as const satisfies readonly SpecialistDomain[];

export const WORKBENCH_DOMAIN_LABELS: Record<WorkbenchDomain, string> = {
  gas: "用气",
  food: "美食",
  voyage: "去哪玩",
  haven: "美好空间",
};

export type WorkbenchDomain = (typeof WORKBENCH_DOMAINS)[number];

export function isWorkbenchDomain(value: string): value is WorkbenchDomain {
  return WORKBENCH_DOMAINS.includes(value as WorkbenchDomain);
}

export function getWorkbenchCheckpointNs(
  panel: "need" | "supply",
  domain: WorkbenchDomain,
) {
  return getSpecialistCheckpointNs(panel, domain);
}
