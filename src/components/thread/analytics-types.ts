export type AnalyticsEventContext = {
  thread_id?: string;
  run_id?: string;
  assistant_id?: string;
  graph_id?: string;
  checkpoint_ns?: string;
  tool_call_id?: string;
  parent_tool_call_id?: string;
  sequence_id?: number;
};

export type AnalyticsEventSubject = {
  producer_type?: string;
  component_type?: string;
  component_name?: string;
  agent_name?: string;
  agent_role?: string;
  domain?: string;
  graph_scope?: string;
};

export type AnalyticsEventBusiness = {
  scene?: string;
  request_kind?: string;
  artifact_type?: string;
};

export type TelemetryStateSummary = Record<string, unknown>;

export type TelemetryStateSnapshot = Record<string, unknown>;

export type TelemetryStateEnvelope = {
  summary?: TelemetryStateSummary;
  snapshot?: TelemetryStateSnapshot;
};

export type AnalyticsEventEnvelope = {
  type?: string;
  kind?: string;
  schema_version?: string;
  event_name?: string;
  event_scope?: string;
  event_phase?: string;
  emitted_at?: string;
  tags?: string[];
  context?: AnalyticsEventContext;
  subject?: AnalyticsEventSubject;
  business?: AnalyticsEventBusiness;
  payload?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  state?: TelemetryStateEnvelope;
  metrics?: Record<string, unknown>;
  error?: unknown;
  state_context?: Record<string, unknown>;
};

export type ThinkingEventEnvelope = {
  type?: string;
  kind?: string;
  schema_version?: string;
  event_name?: string;
  emitted_at?: string;
  tags?: string[];
  context?: AnalyticsEventContext;
  subject?: AnalyticsEventSubject;
  business?: AnalyticsEventBusiness;
  payload?: Record<string, unknown>;
};

export type ThinkingFactEntry = {
  kind: "fact";
  entry_id?: string;
  // 历史 durable 卡可能没有该字段；新后端 entry 一律写入固定服务时区的创建时间。
  created_at?: string;
  agent_name?: string;
  agent_role?: string;
  text?: string;
};

export type ThinkingReasoningEntry = {
  kind: "reasoning";
  entry_id: string;
  // 与 fact 相同：这是 logical entry 首次产生的时间，不是某个 SSE 帧的 emitted_at。
  created_at?: string;
  agent_name?: string;
  agent_role?: string;
  text?: string;
};

export type ThinkingTraceEntry = ThinkingFactEntry | ThinkingReasoningEntry;

export type ThinkingTraceStep = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed" | "waiting_user" | "failed";
  // durable thinking 协议已经统一成一个 `entries[]`：
  // - `fact` 表示稳定事实
  // - `reasoning` 表示已经 durable 化的推理文本
  //
  // 这里不再暴露 `details/detail_groups`，避免前端继续维护两套合同。
  entries?: ThinkingTraceEntry[];
};

export type ThinkingTraceSnapshot = {
  status?: "active" | "completed" | "waiting_user" | "failed";
  current_phase_id?: string;
  steps?: ThinkingTraceStep[];
};
