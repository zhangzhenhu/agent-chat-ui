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
  // thinking custom 事件（reasoning_delta / entry_added / phase_started 等）只收
  // root/main，过滤 child specialist 的 `|tools|` namespace。
  //
  // 规则：用户主卡的 thinking 内容只来自 main agent；child specialist 的原始
  // reasoning / fact 不直接暴露到用户主卡。child 的进度若要展示，应由后端在
  // root 层面 merge 后再发，而非前端放行 child 事件。
  //
  // UI 帧（`onCustomEvent` 里 `isUIMessage` 分支）同理，也只收 root，避免 child
  // 卡污染 root `stateValues.ui`。analytics 事件也维持只收 root。
  return isRootStreamNamespace(namespace);
}
