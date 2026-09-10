"use client";

import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function jsonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Highlight({
  text,
  query,
  active,
}: {
  text: string;
  query: string;
  active: boolean;
}) {
  if (!query) return <>{text}</>;
  const parts = text.split(
    new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"),
  );
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className={cn(
              "rounded px-0.5 text-slate-950",
              active ? "bg-amber-300" : "bg-yellow-200",
            )}
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function isExpandable(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return Boolean(value && typeof value === "object");
}

function nodeContains(value: unknown, query: string): boolean {
  if (!query) return false;
  return jsonText(value).toLowerCase().includes(query.toLowerCase());
}

function getMessageRunId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const additionalKwargs = item.additional_kwargs;
  const metadata = item.metadata;
  const candidates = [
    item.run_id,
    additionalKwargs && typeof additionalKwargs === "object"
      ? (additionalKwargs as Record<string, unknown>).run_id
      : null,
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).run_id
      : null,
  ];
  const runId = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return runId?.trim() ?? null;
}

function RunGroup({ runId, children }: { runId: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        aria-label={`${open ? "折叠" : "展开"} run id ${runId}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="my-2 flex w-full items-center gap-2 px-2 font-mono text-[10px] leading-5 text-slate-400 hover:text-slate-200"
      >
        <span className="h-px flex-1 bg-slate-700" />
        <span className="flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 text-amber-300">
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          <span>------ run_id: {runId} ------</span>
        </span>
        <span className="h-px flex-1 bg-slate-700" />
      </button>
      {open ? children : null}
    </div>
  );
}

function Node({
  field,
  value,
  path,
  query,
  activeNodeId,
  idPrefix,
}: {
  field?: string;
  value: unknown;
  path: string;
  query: string;
  activeNodeId: string | null;
  idPrefix: string;
}) {
  const expandable = isExpandable(value);
  // `root` is level 0, so visible JSON levels 1 through 4 open by default.
  const [open, setOpen] = useState(() => path.split(".").length - 1 <= 4);
  const nodeId = path;
  const entries = expandable ? Object.entries(value) : [];
  const fieldMatched = Boolean(field && nodeContains(field, query));
  const valueMatched = !expandable && nodeContains(value, query);
  const isMessagesArray = field === "messages" && Array.isArray(value);

  const renderChild = ([childField, childValue]: [string, unknown]) => (
    <Node
      field={childField}
      value={childValue}
      path={`${path}.${childField}`}
      query={query}
      activeNodeId={activeNodeId}
      idPrefix={idPrefix}
    />
  );

  const renderChildren = () => {
    if (!isMessagesArray) {
      return entries.map((entry) => (
        <Fragment key={`${path}.${entry[0]}`}>{renderChild(entry)}</Fragment>
      ));
    }

    const groups: Array<{
      runId: string | null;
      entries: Array<[string, unknown]>;
    }> = [];
    for (const entry of entries) {
      const runId = getMessageRunId(entry[1]);
      const previous = groups[groups.length - 1];
      if (previous?.runId === runId) previous.entries.push(entry);
      else groups.push({ runId, entries: [entry] });
    }

    return groups.map((group, groupIndex) => {
      const groupEntries = group.entries.map((entry) => (
        <Fragment key={`${path}.${entry[0]}`}>{renderChild(entry)}</Fragment>
      ));
      return group.runId ? (
        <RunGroup
          key={`${path}.run.${groupIndex}`}
          runId={group.runId}
        >
          {groupEntries}
        </RunGroup>
      ) : (
        groupEntries
      );
    });
  };

  return (
    <div className="ml-3 border-l border-slate-800/70 pl-3">
      <div
        id={`json-node-${idPrefix}-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
        className="flex min-h-7 items-start gap-1 font-mono text-xs leading-6"
      >
        {expandable ? (
          <button
            type="button"
            className="mt-1 flex size-5 shrink-0 items-center justify-center text-slate-400 hover:text-white"
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? "折叠" : "展开"}
          >
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block size-5" />
        )}
        {field ? (
          <span className="text-sky-300">
            "
            <Highlight
              text={field}
              query={query}
              active={activeNodeId === `${idPrefix}:${nodeId}`}
            />
            "
          </span>
        ) : null}
        {field ? <span className="text-slate-500">: </span> : null}
        {expandable ? (
          <span className="text-slate-300">
            {Array.isArray(value) ? "[" : "{"}
            {!open && (
              <span className="text-slate-500"> … {entries.length} 项 </span>
            )}
            {!open && (Array.isArray(value) ? "]" : "}")}
          </span>
        ) : (
          <span
            className={
              typeof value === "string"
                ? "text-emerald-300"
                : typeof value === "number"
                  ? "text-amber-300"
                  : typeof value === "boolean"
                    ? "text-violet-300"
                    : "text-slate-400"
            }
          >
            {typeof value === "string" ? '"' : null}
            <Highlight
              text={jsonText(value)}
              query={query}
              active={activeNodeId === `${idPrefix}:${nodeId}:value`}
            />
            {typeof value === "string" ? '"' : null}
          </span>
        )}
      </div>
      {expandable && open ? <div>{renderChildren()}</div> : null}
      {expandable && open ? (
        <div className="ml-6 font-mono text-xs leading-6 text-slate-300">
          {Array.isArray(value) ? "]" : "}"}
        </div>
      ) : null}
    </div>
  );
}

export function SearchableJsonView({
  value,
  query,
  activeNodeId,
  idPrefix,
}: {
  value: unknown;
  query: string;
  activeNodeId: string | null;
  idPrefix: string;
}) {
  const copy = async () =>
    navigator.clipboard?.writeText(JSON.stringify(value ?? null, null, 2));
  const rootValue =
    value && typeof value === "object" ? value : { value: value ?? null };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0b1020]">
      <div className="flex items-center justify-end border-b border-white/10 px-3 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={copy}
          title="复制 JSON"
        >
          <Copy className="size-3.5" />
          <span>复制</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-slate-100">
        <Node
          value={rootValue}
          path="root"
          query={query}
          activeNodeId={activeNodeId}
          idPrefix={idPrefix}
        />
      </div>
    </div>
  );
}
