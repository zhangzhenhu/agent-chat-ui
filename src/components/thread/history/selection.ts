import type { Thread } from "@langchain/langgraph-sdk";

export function pruneSelectedThreadIds(
  selectedIds: string[],
  threads: Thread[],
): string[] {
  if (selectedIds.length === 0) {
    return selectedIds;
  }

  const threadIdSet = new Set(threads.map((thread) => thread.thread_id));
  const seen = new Set<string>();

  return selectedIds.filter((id) => {
    if (!threadIdSet.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}
