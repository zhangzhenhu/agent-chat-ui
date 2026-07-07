import type { AnalyticsEventEnvelope } from "../analytics-types";

export function formatAnalyticsEventJson(event: AnalyticsEventEnvelope): string {
  return JSON.stringify(event, null, 2);
}
