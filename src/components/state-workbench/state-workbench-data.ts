import {
  fetchChildThreadState,
  fetchRootThreadState,
  type ChildThreadStateResponse,
  type RootThreadStateResponse,
} from "@/components/thread/thread-workbench-data";

export { fetchChildThreadState, fetchRootThreadState };
export type { ChildThreadStateResponse, RootThreadStateResponse };

export function hasStateData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length > 0;
  if ("checkpoint" in value && value.checkpoint === null) return false;
  return Object.keys(value).length > 0;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "请求失败";
}
