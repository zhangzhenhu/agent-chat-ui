"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/providers/client";
import { useConfigContext } from "@/providers/Stream";
import { useQueryState } from "nuqs";
import { Assistant } from "@langchain/langgraph-sdk";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AssistantSelector() {
  const { apiUrl, apiKey, authScheme, assistantId, setAssistantId } =
    useConfigContext();
  const [, setThreadId] = useQueryState("threadId");

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch assistants on mount and when apiUrl changes
  useEffect(() => {
    if (!apiUrl) return;
    setLoading(true);
    const client = createClient(apiUrl, apiKey || undefined, authScheme || undefined);
    client.assistants
      .search({ limit: 100 })
      .then((result) => {
        const list = Array.isArray(result) ? result : [];
        setAssistants(list);
        // Auto-select first assistant if none is selected yet
        if (!assistantId && list.length > 0) {
          setAssistantId(list[0].assistant_id);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch assistants:", err);
      })
      .finally(() => setLoading(false));
  }, [apiUrl, apiKey, authScheme]); // intentional: only re-fetch when connection params change

  // Close on outside click
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
    (a) => a.assistant_id === assistantId,
  );
  const displayName = currentAssistant?.name || assistantId || "Select assistant";

  const handleSelect = (assistant: Assistant) => {
    setAssistantId(assistant.assistant_id);
    setThreadId(null); // Start a new thread
    setOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="truncate max-w-[120px]">{displayName}</span>
      </div>
    );
  }

  if (assistants.length === 0) {
    return (
      <span className="text-sm text-muted-foreground truncate max-w-[150px]">
        {displayName}
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-gray-100 transition-colors max-w-[200px]"
      >
        <span className="truncate">{displayName}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {assistants.map((assistant) => {
              const isSelected = assistant.assistant_id === assistantId;
              return (
                <button
                  key={assistant.assistant_id}
                  type="button"
                  onClick={() => handleSelect(assistant)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 transition-colors",
                    isSelected && "bg-gray-50 font-medium",
                  )}
                >
                  <span className="flex-1 truncate">
                    {assistant.name || assistant.assistant_id}
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