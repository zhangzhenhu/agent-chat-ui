import type { StreamMode } from "@langchain/langgraph-sdk";

type StreamSubmitOptions = Record<string, unknown> & {
  streamMode?: StreamMode | StreamMode[];
  streamSubgraphs?: boolean;
};

const REQUIRED_STREAM_MODES: StreamMode[] = ["values", "custom", "messages"];

/**
 * The legacy FamilyAgent projector rewrites only the messages SSE family.
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
