"use client";

import type { Assistant } from "@langchain/langgraph-sdk";

type AssistantSearchResult =
  | Assistant[]
  | {
      assistants?: Assistant[];
      next?: string | null;
    }
  | null
  | undefined;

type AssistantSearch = (query: {
  limit: number;
  offset?: number;
  includePagination?: boolean;
}) => Promise<AssistantSearchResult>;

/** Fetch every assistant page so older runtime registrations are not hidden. */
export async function searchAllAssistants(
  search: AssistantSearch,
): Promise<Assistant[]> {
  const all: Assistant[] = [];
  let offset = 0;

  while (true) {
    const result = await search({
      limit: 100,
      offset,
      includePagination: true,
    });
    const page = normalizeAssistants(result);
    all.push(...page);

    if (!result || Array.isArray(result) || !result.next || page.length === 0) {
      break;
    }

    const nextOffset = Number(result.next);
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      break;
    }
    offset = nextOffset;
  }

  return all;
}

function hasMeaningfulName(name: string | undefined): boolean {
  return !!name && name.trim().length > 0 && name.trim() !== "Untitled";
}

function getAssistantPriority(assistant: Assistant): number {
  let score = 0;

  // 这里不猜“哪个 assistant 才是业务主图”，只做两个保守排序：
  // 1. 有真实名字的排前面
  // 2. 其他情况按 graph_id / assistant_id 做稳定排序
  if (hasMeaningfulName(assistant.name)) score += 40;

  return score;
}

function compareAssistants(a: Assistant, b: Assistant): number {
  const scoreDiff = getAssistantPriority(b) - getAssistantPriority(a);
  if (scoreDiff !== 0) return scoreDiff;

  const updatedAtDiff =
    new Date(b.updated_at ?? 0).getTime() -
    new Date(a.updated_at ?? 0).getTime();
  if (updatedAtDiff !== 0) return updatedAtDiff;

  return (a.graph_id ?? a.assistant_id).localeCompare(
    b.graph_id ?? b.assistant_id,
  );
}

function pickPreferredAssistant(
  current: Assistant,
  candidate: Assistant,
): Assistant {
  return compareAssistants(current, candidate) <= 0 ? current : candidate;
}

export function normalizeAssistants(
  result: AssistantSearchResult,
): Assistant[] {
  if (Array.isArray(result)) {
    return result;
  }

  if (
    result &&
    typeof result === "object" &&
    Array.isArray(result.assistants)
  ) {
    return result.assistants;
  }

  return [];
}

export function getVisibleAssistants(
  result: AssistantSearchResult,
): Assistant[] {
  const assistants = normalizeAssistants(result);

  // LangGraph keeps user-created assistant records in the same directory as
  // the runtime's one-per-graph records. When runtime records are present,
  // they are the authoritative graph catalog; historical records can point
  // at graphs that are no longer exposed by the current deployment.
  const runtimeAssistants = assistants.filter(
    (assistant) => assistant.metadata?.created_by === "system",
  );
  const visibleSource =
    runtimeAssistants.length > 0 ? runtimeAssistants : assistants;

  // 先按 graph_id 去重，避免同一图在 runtime 里累积多条历史 assistant 记录。
  const dedupedByGraph = new Map<string, Assistant>();
  for (const assistant of visibleSource) {
    const key = assistant.graph_id || assistant.assistant_id;
    const existing = dedupedByGraph.get(key);
    dedupedByGraph.set(
      key,
      existing ? pickPreferredAssistant(existing, assistant) : assistant,
    );
  }

  return Array.from(dedupedByGraph.values()).sort(compareAssistants);
}

export function getAssistantDisplayName(
  assistant: Assistant | null | undefined,
): string {
  if (!assistant) {
    return "";
  }

  // This selector is a graph selector. Assistant names are not graph IDs and
  // may be arbitrary or stale, so never use them as the visible value.
  return assistant.graph_id || assistant.assistant_id;
}
