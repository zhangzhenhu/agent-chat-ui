"use client";

/**
 * AssistantSelector — dropdown in the chat header that lets users switch
 * between available assistants/graphs on the connected LangGraph server.
 *
 * Why this exists:
 * The original Agent Chat UI required users to manually type an assistant ID
 * into the deployment form. Assistant IDs are UUIDs assigned by the server —
 * users can't remember them and typing them each time is painful.
 *
 * This component:
 * 1. Fetches the assistant list from the server via client.assistants.search()
 * 2. Auto-selects the first assistant if none is currently selected
 * 3. Shows a dropdown with all available assistants, with checkmark on selected
 * 4. On switch, clears the threadId to start a fresh conversation
 *
 * Used in: src/components/thread/index.tsx (chat header)
 */

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/providers/client";
import { useConfigContext } from "@/providers/Stream";
import { useQueryState } from "nuqs";
import { Assistant } from "@langchain/langgraph-sdk";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAssistantDisplayName,
  getVisibleAssistants,
  searchAllAssistants,
} from "@/lib/assistant-options";

export function AssistantSelector() {
  const { apiUrl, apiKey, authScheme, assistantId, setAssistantId } =
    useConfigContext();
  const [, setThreadId] = useQueryState("threadId");

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Fetch assistants from the server whenever the connection parameters change.
   * The selected ID is also observed so a stale URL/query selection can be
   * reconciled after the authoritative runtime graph catalog is loaded.
   */
  useEffect(() => {
    if (!apiUrl) return;
    setLoading(true);
    const client = createClient(
      apiUrl,
      apiKey || undefined,
      authScheme || undefined,
    );
    searchAllAssistants((query) =>
      client.assistants.search({ ...query, includePagination: true }),
    )
      .then((result) => {
        const list = getVisibleAssistants(result);
        setAssistants(list);
        const selected = list.find(
          (assistant) =>
            assistant.graph_id === assistantId ||
            assistant.assistant_id === assistantId,
        );
        // The URL may contain a legacy assistant UUID. Normalize it to the
        // graph ID so all subsequent requests use the langgraph.json key.
        if (list.length > 0 && selected && selected.graph_id !== assistantId) {
          setAssistantId(selected.graph_id);
          setThreadId(null);
        } else if (list.length > 0 && !selected) {
          setAssistantId(list[0].graph_id);
          setThreadId(null);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch assistants:", err);
      })
      .finally(() => setLoading(false));
  }, [apiUrl, apiKey, assistantId, authScheme, setAssistantId, setThreadId]);

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const currentAssistant = assistants.find(
    (a) => a.assistant_id === assistantId || a.graph_id === assistantId,
  );
  const displayName =
    getAssistantDisplayName(currentAssistant) ||
    assistantId ||
    "Select assistant";

  const handleSelect = (assistant: Assistant) => {
    setAssistantId(assistant.graph_id);
    setThreadId(null); // Start a new thread when switching assistants
    setOpen(false);
  };

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="max-w-[120px] truncate">{displayName}</span>
      </div>
    );
  }

  if (assistants.length === 0) {
    return (
      <span className="text-muted-foreground max-w-[150px] truncate text-sm">
        {displayName}
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex max-w-[200px] items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-gray-100"
      >
        <span className="truncate">{displayName}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground size-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-md border bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {assistants.map((assistant) => {
              const isSelected =
                assistant.assistant_id === assistantId ||
                assistant.graph_id === assistantId;
              return (
                <button
                  key={assistant.assistant_id}
                  type="button"
                  onClick={() => handleSelect(assistant)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100",
                    isSelected && "bg-gray-50 font-medium",
                  )}
                >
                  <span className="flex-1 truncate">
                    {getAssistantDisplayName(assistant)}
                  </span>
                  {isSelected && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
