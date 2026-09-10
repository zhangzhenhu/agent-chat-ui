export type WorkbenchPanelId = "root" | "need" | "supply";
export type WorkbenchDomain = "gas" | "food";

export type ResourceStatus = "idle" | "loading" | "success" | "empty" | "error";

export type ResourceState<T> = {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
  updatedAt: number | null;
};

export type JsonMatch = {
  id: string;
  panel: WorkbenchPanelId;
  path: string;
  kind: "field" | "value";
};
