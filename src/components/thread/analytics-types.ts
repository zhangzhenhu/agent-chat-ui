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

export type ThinkingDetailGroup = {
  group_id: string;
  agent_name: string;
  agent_role: string;
  kind: string;
  items: string[];
};

export type ThinkingTraceStep = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed" | "waiting_user" | "failed";
  details?: Array<{
    kind?: string;
    agent_name?: string;
    text?: string;
  }>;
  detail_groups?: ThinkingDetailGroup[];
};

export type ThinkingTraceSnapshot = {
  status?: "active" | "completed" | "waiting_user" | "failed";
  current_phase_id?: string;
  steps?: ThinkingTraceStep[];
};
