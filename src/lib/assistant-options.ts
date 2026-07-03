"use client";

import type { Assistant } from "@langchain/langgraph-sdk";

type AssistantSearchResult =
  | Assistant[]
  | {
      assistants?: Assistant[];
    }
  | null
  | undefined;

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
    new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
  if (updatedAtDiff !== 0) return updatedAtDiff;

  return (a.graph_id ?? a.assistant_id).localeCompare(
    b.graph_id ?? b.assistant_id,
  );
}

function pickPreferredAssistant(current: Assistant, candidate: Assistant): Assistant {
  return compareAssistants(current, candidate) <= 0 ? current : candidate;
}

export function normalizeAssistants(result: AssistantSearchResult): Assistant[] {
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

export function getVisibleAssistants(result: AssistantSearchResult): Assistant[] {
  const assistants = normalizeAssistants(result);

  // 先按 graph_id 去重，避免同一图在 runtime 里累积多条历史 assistant 记录。
  const dedupedByGraph = new Map<string, Assistant>();
  for (const assistant of assistants) {
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

  if (hasMeaningfulName(assistant.name)) {
    return assistant.name;
  }

  return assistant.graph_id || assistant.assistant_id;
}
