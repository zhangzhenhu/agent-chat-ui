import test from "node:test";
import assert from "node:assert/strict";
import type { Assistant } from "@langchain/langgraph-sdk";
import type * as AssistantOptions from "../assistant-options";

const { getAssistantDisplayName, getVisibleAssistants, searchAllAssistants } =
  (await import(
    new URL("../assistant-options.ts", import.meta.url).href
  )) as typeof AssistantOptions;

function assistant(
  graph_id: string,
  assistant_id: string,
  metadata: Record<string, unknown> = {},
): Assistant {
  return {
    graph_id,
    assistant_id,
    metadata,
    name: graph_id,
    config: {},
    context: {},
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("prefers runtime graph registrations over historical assistants", () => {
  const visible = getVisibleAssistants([
    assistant("family_main_v2", "old", {}),
    assistant("family_main", "runtime", { created_by: "system" }),
    assistant("memory_profile_worker", "worker", { created_by: "system" }),
  ]);

  assert.deepEqual(
    visible.map((item) => item.graph_id),
    ["family_main", "memory_profile_worker"],
  );
});

test("uses graph_id as the graph label even when assistant has a custom name", () => {
  assert.equal(
    getAssistantDisplayName({
      ...assistant("family_main", "assistant-1", { created_by: "system" }),
      name: "A misleading assistant name",
    }),
    "family_main",
  );
});

test("searchAllAssistants follows pagination cursors", async () => {
  const calls: Array<{ offset?: number; includePagination?: boolean }> = [];
  const result = await searchAllAssistants(async (query) => {
    calls.push(query);
    if (!query.offset) {
      return {
        assistants: [assistant("first", "1")],
        next: "100",
      };
    }
    return { assistants: [assistant("second", "2")], next: null };
  });

  assert.deepEqual(
    result.map((item) => item.graph_id),
    ["first", "second"],
  );
  assert.deepEqual(calls, [
    { limit: 100, offset: 0, includePagination: true },
    { limit: 100, offset: 100, includePagination: true },
  ]);
});
