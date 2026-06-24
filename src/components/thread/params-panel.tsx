"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronDown, Settings2, AlertCircle } from "lucide-react";

export interface CustomParams {
  configurable: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
}

function JsonEditor({
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  error: string | null;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className={cn(
            "w-full resize-none rounded-md border bg-white px-3 py-2 font-mono text-xs",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
            error
              ? "border-red-400 focus:ring-red-500/50"
              : "border-gray-200",
          )}
          spellCheck={false}
        />
        {error && (
          <div className="mt-1 flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="size-3" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function safeJsonParse(text: string): { value: Record<string, unknown> | null; error: string | null } {
  if (!text.trim()) return { value: null, error: null };
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { value: null, error: "Must be a JSON object" };
    }
    return { value: parsed, error: null };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

interface ParamsPanelProps {
  params: CustomParams;
  onChange: (params: CustomParams) => void;
}

export function ParamsPanel({ params, onChange }: ParamsPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"configurable" | "input">("configurable");

  const [configurableText, setConfigurableText] = useState(() =>
    params.configurable ? JSON.stringify(params.configurable, null, 2) : "",
  );
  const [inputText, setInputText] = useState(() =>
    params.input ? JSON.stringify(params.input, null, 2) : "",
  );

  const configurableParse = safeJsonParse(configurableText);
  const inputParse = safeJsonParse(inputText);

  const handleConfigurableChange = (text: string) => {
    setConfigurableText(text);
    const parsed = safeJsonParse(text);
    onChange({ ...params, configurable: parsed.value });
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    const parsed = safeJsonParse(text);
    onChange({ ...params, input: parsed.value });
  };

  const hasContent =
    configurableText.trim() !== "" || inputText.trim() !== "";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs transition-colors",
          hasContent
            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
            : "text-gray-400 hover:text-gray-600",
        )}
      >
        <Settings2 className="size-3" />
        <span>Parameters</span>
        {hasContent && (
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
            !
          </span>
        )}
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="params-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
              <div className="mb-3 flex gap-1 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setActiveTab("configurable")}
                  className={cn(
                    "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTab === "configurable"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  Configurable
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("input")}
                  className={cn(
                    "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTab === "input"
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  Input
                </button>
              </div>

              {activeTab === "configurable" && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Runtime config passed as <code>config.configurable</code>.
                    Accessible in your graph nodes via{" "}
                    <code>config.configurable</code>.
                  </p>
                  <JsonEditor
                    label="Configurable JSON"
                    value={configurableText}
                    onChange={handleConfigurableChange}
                    error={configurableParse.error}
                    placeholder={`{"model": "openai", "temperature": 0.7}`}
                  />
                </div>
              )}

              {activeTab === "input" && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Additional state fields merged into the graph input.
                    These are accessible in your graph's state.
                  </p>
                  <JsonEditor
                    label="Input JSON"
                    value={inputText}
                    onChange={handleInputChange}
                    error={inputParse.error}
                    placeholder={`{"user_name": "Alice", "language": "zh"}`}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}