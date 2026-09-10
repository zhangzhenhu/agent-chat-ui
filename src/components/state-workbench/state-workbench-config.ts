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
] as const satisfies readonly SpecialistDomain[];

export const WORKBENCH_DOMAIN_LABELS: Record<WorkbenchDomain, string> = {
  gas: "用气",
  food: "美食",
};

export type WorkbenchDomain = (typeof WORKBENCH_DOMAINS)[number];

export function getWorkbenchCheckpointNs(
  panel: "need" | "supply",
  domain: WorkbenchDomain,
) {
  return getSpecialistCheckpointNs(panel, domain);
}
