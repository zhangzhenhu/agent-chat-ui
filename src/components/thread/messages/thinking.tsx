"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingProps {
  /** The reasoning text content */
  content: string;
  /** Whether the agent is still generating this message */
  isStreaming: boolean;
  /**
   * External duration for the thinking phase (ms).
   * When provided, this overrides the internal calculation.
   */
  thinkingDuration?: number | null;
}

/**
 * Collapsible thinking/reasoning display.
 *
 * Design inspired by ChatGPT (o1/o3), Claude.ai, and LobeChat:
 * - Auto-expanded during streaming so the user can see the thinking
 *   process in real time.
 * - Auto-collapses when streaming completes, keeping the chat clean.
 * - Muted visual style (smaller text, gray tones, left accent border)
 *   to distinguish "internal monologue" from the final answer.
 * - Uses `<details open>` for native collapsible behavior with
 *   framer-motion for smooth open/close animation.
 */
export function Thinking({ content, isStreaming, thinkingDuration }: ThinkingProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(isStreaming);
  const [startTime] = useState(Date.now());
  const [internalDuration, setInternalDuration] = useState<number | null>(null);

  // Use external timing if provided, otherwise fall back to internal
  const displayDuration = thinkingDuration ?? internalDuration;

  // Auto-open when streaming, auto-collapse when done.
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    } else {
      // Only use internal timer if no external timing is provided
      if (thinkingDuration == null) {
        setInternalDuration(Date.now() - startTime);
      }
      // Small delay to let the user see the completed state before collapsing
      const timer = setTimeout(() => setIsOpen(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, thinkingDuration]);

  // Auto-scroll to bottom while streaming (shows latest thinking text).
  useEffect(() => {
    if (isStreaming && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming, isOpen]);

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div className="my-2">
      <details
        className="group rounded-lg border border-gray-200/60 bg-gray-50/80"
        open={isOpen}
        onToggle={(e) => setIsOpen(e.currentTarget.open)}
      >
        {/* Summary header — always visible */}
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-xs text-gray-500 list-none [&::-webkit-details-marker]:hidden">
          {/* Expand/collapse chevron */}
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-gray-400 transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />

          {/* Icon + label */}
          {isStreaming ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-purple-500" />
          ) : (
            <Brain className="size-3.5 shrink-0 text-purple-400" />
          )}

          <span className="font-medium tracking-wide text-gray-500">
            {isStreaming
              ? "思考中..."
              : displayDuration
                ? `已深度思考 (${formatDuration(displayDuration)})`
                : "已深度思考"}
          </span>
        </summary>

        {/* Collapsible content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="thinking-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div
                ref={contentRef}
                className="max-h-60 overflow-y-auto border-t border-gray-200/50 px-3 py-2"
              >
                <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500 font-mono">
                  {content}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </details>
    </div>
  );
}