import type { ThinkingTraceStep } from "./analytics-types";

export function getThinkingStatusLabel(
  status: ThinkingTraceStep["status"],
): string {
  if (status === "active") {
    return "进行中";
  }
  if (status === "completed") {
    return "已完成";
  }
  if (status === "waiting_user") {
    return "等待你";
  }
  if (status === "failed") {
    return "失败";
  }
  return "未开始";
}
