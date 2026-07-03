import { AIMessage, ToolMessage } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Route, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

export function ToolCalls({
  toolCalls,
}: {
  toolCalls: AIMessage["tool_calls"];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return (
          <div
            key={idx}
            className={cn(
              "overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/70 shadow-sm",
              "backdrop-blur-sm",
            )}
          >
            <div className="border-b border-slate-200 bg-slate-100/80 px-4 py-2.5">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                <Route className="h-3.5 w-3.5" />
                Internal Tool Call
              </div>
              <h3 className="font-medium text-slate-900">
                {tc.name}
                {tc.id && (
                  <code className="ml-2 rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                    {tc.id}
                  </code>
                )}
              </h3>
            </div>
            {hasArgs ? (
              <table className="min-w-full divide-y divide-slate-200">
                <tbody className="divide-y divide-slate-200">
                  {Object.entries(args).map(([key, value], argIdx) => (
                    <tr key={argIdx}>
                      <td className="px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-900">
                        {key}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-600">
                        {isComplexValue(value) ? (
                          <code className="rounded-xl bg-white px-2 py-1 font-mono text-sm break-all text-slate-700">
                            {JSON.stringify(value, null, 2)}
                          </code>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <code className="block p-3 text-sm text-slate-700">{"{}"}</code>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ToolResult({ message }: { message: ToolMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);

  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (typeof message.content === "string") {
      parsedContent = JSON.parse(message.content);
      isJsonContent = isComplexValue(parsedContent);
    }
  } catch {
    // Content is not JSON, use as is
    parsedContent = message.content;
  }

  const contentStr = isJsonContent
    ? JSON.stringify(parsedContent, null, 2)
    : String(message.content);
  const contentLines = contentStr.split("\n");
  const shouldTruncate = contentLines.length > 4 || contentStr.length > 500;
  const displayedContent =
    shouldTruncate && !isExpanded
      ? contentStr.length > 500
        ? contentStr.slice(0, 500) + "..."
        : contentLines.slice(0, 4).join("\n") + "\n..."
      : contentStr;

  return (
    <div className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2">
      <div className="overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/70 shadow-sm backdrop-blur-sm">
        <div className="border-b border-amber-200/90 bg-amber-100/70 px-4 py-2.5">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-amber-700 uppercase">
            <Wrench className="h-3.5 w-3.5" />
            Internal Tool Result
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {message.name ? (
              <h3 className="font-medium text-amber-950">
                Tool Result:{" "}
                <code className="rounded-full bg-white px-2 py-1 text-xs text-amber-800">
                  {message.name}
                </code>
              </h3>
            ) : (
              <h3 className="font-medium text-amber-950">Tool Result</h3>
            )}
            {message.tool_call_id && (
              <code className="ml-2 rounded-full bg-white px-2 py-1 text-xs text-amber-800">
                {message.tool_call_id}
              </code>
            )}
          </div>
        </div>
        <motion.div
          className="min-w-full bg-amber-50/60"
          initial={false}
          animate={{ height: "auto" }}
          transition={{ duration: 0.3 }}
        >
          <div className="p-3">
            <AnimatePresence
              mode="wait"
              initial={false}
            >
              <motion.div
                key={isExpanded ? "expanded" : "collapsed"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                {isJsonContent ? (
                  <table className="min-w-full divide-y divide-slate-200">
                    <tbody className="divide-y divide-slate-200">
                      {(Array.isArray(parsedContent)
                        ? isExpanded
                          ? parsedContent
                          : parsedContent.slice(0, 5)
                        : Object.entries(parsedContent)
                      ).map((item, argIdx) => {
                        const [key, value] = Array.isArray(parsedContent)
                          ? [argIdx, item]
                          : [item[0], item[1]];
                        return (
                          <tr key={argIdx}>
                            <td className="px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-900">
                              {key}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-600">
                              {isComplexValue(value) ? (
                                <code className="rounded-xl bg-white px-2 py-1 font-mono text-sm break-all text-slate-700">
                                  {JSON.stringify(value, null, 2)}
                                </code>
                              ) : (
                                String(value)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <code className="block text-sm text-amber-950/90">{displayedContent}</code>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          {((shouldTruncate && !isJsonContent) ||
            (isJsonContent &&
              Array.isArray(parsedContent) &&
              parsedContent.length > 5)) && (
            <motion.button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex w-full cursor-pointer items-center justify-center border-t-[1px] border-amber-200/90 py-2 text-amber-700 transition-all duration-200 ease-in-out hover:bg-amber-100/60 hover:text-amber-900"
              initial={{ scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isExpanded ? <ChevronUp /> : <ChevronDown />}
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
