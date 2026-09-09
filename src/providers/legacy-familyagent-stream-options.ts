import type { StreamMode } from "@langchain/langgraph-sdk";

type StreamSubmitOptions = Record<string, unknown> & {
  streamMode?: StreamMode | StreamMode[];
  streamSubgraphs?: boolean;
};

// 当前 LangGraph SDK 的 useStream 只会把裸 messages / messages|namespace
// 事件交给 MessageTupleManager；legacy projector 的 messages/partial 生命周期
// 是后端兼容协议，但不会被该 SDK 的事件分发器消费。因此 UI 默认请求
// messages-tuple，让 projector 输出的增量消息能进入前端消息状态。
const REQUIRED_STREAM_MODES: StreamMode[] = [
  "values",
  "custom",
  "messages-tuple",
];

/**
 * The legacy FamilyAgent projector rewrites the messages SSE family.
 * The UI requests messages-tuple because the installed LangGraph SDK consumes
 * that event family; the backend still supports the cumulative messages mode.
 * Keep subgraph frames enabled because a specialist can call deliver_user.
 */
export function withLegacyFamilyAgentStreamOptions<
  T extends StreamSubmitOptions,
>(
  options?: T,
): Omit<T, "streamMode" | "streamSubgraphs"> & {
  streamMode: StreamMode[];
  streamSubgraphs: true;
} {
  const existingModes = options?.streamMode
    ? Array.isArray(options.streamMode)
      ? options.streamMode
      : [options.streamMode]
    : [];

  return {
    ...options,
    streamMode: [...new Set([...existingModes, ...REQUIRED_STREAM_MODES])],
    streamSubgraphs: true,
  } as Omit<T, "streamMode" | "streamSubgraphs"> & {
    streamMode: StreamMode[];
    streamSubgraphs: true;
  };
}
