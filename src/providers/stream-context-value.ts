import type { AnalyticsState } from "@/components/thread/analytics-state";
import type { ThinkingState } from "@/components/thread/thinking-state";

export function composeStreamContextValue<T extends object>(
  streamValue: T,
  extras: {
    analyticsState: AnalyticsState;
    thinkingState: ThinkingState;
  },
): T & {
  analyticsState: AnalyticsState;
  thinkingState: ThinkingState;
} {
  const value = Object.create(streamValue) as T & {
    analyticsState: AnalyticsState;
    thinkingState: ThinkingState;
  };
  value.analyticsState = extras.analyticsState;
  value.thinkingState = extras.thinkingState;
  return value;
}

export function isRootStreamNamespace(namespace: string[] | undefined): boolean {
  if (!namespace || namespace.length === 0) {
    return true;
  }

  return !namespace.join("|").includes("|tools|");
}

export function shouldAcceptThinkingNamespace(
  namespace: string[] | undefined,
): boolean {
  return true;
}
