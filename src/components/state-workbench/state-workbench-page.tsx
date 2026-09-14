"use client";

import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  Search,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useQueryState, parseAsString } from "nuqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRuntimeConfig } from "@/providers/runtime-config";
import {
  fetchChildThreadState,
  fetchRootThreadState,
  getErrorMessage,
  hasStateData,
  type ChildThreadStateResponse,
} from "./state-workbench-data";
import {
  getWorkbenchCheckpointNs,
  WORKBENCH_DOMAIN_LABELS,
  WORKBENCH_DOMAINS,
  WORKBENCH_ENVIRONMENTS,
  type WorkbenchDomain,
} from "./state-workbench-config";
import { SearchableJsonView } from "./searchable-json-view";
import type { ResourceState, WorkbenchPanelId } from "./state-workbench-types";

type ResourceKey =
  | "root"
  | `need:${WorkbenchDomain}`
  | `supply:${WorkbenchDomain}`;
type ResourceValue = Record<string, unknown> | ChildThreadStateResponse;

const EMPTY_RESOURCE: ResourceState<ResourceValue> = {
  status: "idle",
  data: null,
  error: null,
  updatedAt: null,
};

function resourceKey(
  panel: "need" | "supply",
  domain: WorkbenchDomain,
): ResourceKey {
  return `${panel}:${domain}`;
}

function collectMatches(
  value: unknown,
  query: string,
  prefix: string,
  path = "root",
) {
  const matches: Array<{ id: string; path: string }> = [];
  if (!query) return matches;
  const needle = query.toLowerCase();
  const add = (text: string, id: string) => {
    if (text.toLowerCase().includes(needle)) matches.push({ id, path });
  };
  const walk = (current: unknown, currentPath: string, field?: string) => {
    if (field) add(field, `${prefix}:${currentPath}`);
    if (current && typeof current === "object") {
      Object.entries(current).forEach(([key, child]) =>
        walk(child, `${currentPath}.${key}`, key),
      );
      return;
    }
    add(String(current ?? "null"), `${prefix}:${currentPath}:value`);
  };
  walk(value, path);
  return matches;
}

function stateLabel(state: ResourceState<ResourceValue>) {
  if (state.status === "loading") return "加载中";
  if (state.status === "error") return "请求失败";
  if (state.status === "empty") return "暂无状态";
  if (state.status === "success") return "已加载";
  return "等待查询";
}

function formatTime(timestamp: number | null) {
  return timestamp
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(timestamp)
    : "未查询";
}

function Panel({
  panel,
  title,
  domain,
  onDomainChange,
  state,
  onRefresh,
  query,
  activeMatchId,
  collapsed,
  onToggleCollapsed,
}: {
  panel: WorkbenchPanelId;
  title: string;
  domain?: WorkbenchDomain;
  onDomainChange?: (domain: WorkbenchDomain) => void;
  state: ResourceState<ResourceValue>;
  onRefresh: () => void;
  query: string;
  activeMatchId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const idPrefix = domain ? `${panel}-${domain}` : panel;
  if (collapsed) {
    return (
      <section className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:min-h-0">
        <header className="flex min-h-0 flex-1 flex-col items-center gap-3 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggleCollapsed}
            title={`展开 ${title}`}
            aria-label={`展开 ${title}`}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
          <span className="text-xs font-medium text-slate-600 [writing-mode:vertical-rl]">
            {title}
          </span>
        </header>
      </section>
    );
  }
  return (
    <section className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:min-h-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            {stateLabel(state)} · {formatTime(state.updatedAt)}
          </p>
        </div>
        {domain && onDomainChange ? (
          <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {WORKBENCH_DOMAINS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onDomainChange(item)}
                className={`rounded px-2.5 py-1 text-xs ${domain === item ? "bg-white font-medium text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {WORKBENCH_DOMAIN_LABELS[item]}
              </button>
            ))}
          </div>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onRefresh}
          title="刷新"
        >
          <RefreshCcw className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onToggleCollapsed}
          title={`折叠 ${title}`}
          aria-label={`折叠 ${title}`}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {state.status === "error" ? (
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {state.error}
          </div>
        ) : null}
        {state.status === "empty" ? (
          <div className="mb-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            当前没有可用的 state/checkpoint。
          </div>
        ) : null}
        {state.status === "loading" && !state.data ? (
          <div className="mb-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            正在加载…
          </div>
        ) : null}
        <SearchableJsonView
          value={state.data ?? {}}
          query={query}
          activeNodeId={activeMatchId}
          idPrefix={idPrefix}
        />
      </div>
    </section>
  );
}

export function StateWorkbenchPage() {
  const runtime = useRuntimeConfig();
  const [envParam, setEnvParam] = useQueryState(
    "env",
    parseAsString.withDefault("st"),
  );
  const [threadParam, setThreadParam] = useQueryState(
    "thread_id",
    parseAsString.withDefault(""),
  );
  const [needParam, setNeedParam] = useQueryState(
    "need",
    parseAsString.withDefault("gas"),
  );
  const [supplyParam, setSupplyParam] = useQueryState(
    "supply",
    parseAsString.withDefault("gas"),
  );
  const [threadDraft, setThreadDraft] = useState(threadParam);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [collapsedPanels, setCollapsedPanels] = useState<
    Record<WorkbenchPanelId, boolean>
  >({ root: false, need: false, supply: false });
  const [resources, setResources] = useState<
    Partial<Record<ResourceKey, ResourceState<ResourceValue>>>
  >({ root: EMPTY_RESOURCE });
  const resourcesRef = useRef(resources);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const autoQueryRef = useRef<string | null>(null);

  const environmentId = WORKBENCH_ENVIRONMENTS.some(
    (item) => item.id === envParam,
  )
    ? envParam
    : "st";
  const needDomain: WorkbenchDomain = needParam === "food" ? "food" : "gas";
  const supplyDomain: WorkbenchDomain = supplyParam === "food" ? "food" : "gas";
  const environment =
    runtime.environments.find((item) => item.id === environmentId) ??
    runtime.environments[0];

  useEffect(() => {
    if (runtime.environmentId !== environmentId)
      runtime.selectEnvironment(environmentId);
  }, [environmentId, runtime]);
  useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateResource = useCallback(
    (
      key: ResourceKey,
      next:
        | ResourceState<ResourceValue>
        | ((
            current: ResourceState<ResourceValue>,
          ) => ResourceState<ResourceValue>),
    ) => {
      setResources((current) => ({
        ...current,
        [key]:
          typeof next === "function"
            ? next(current[key] ?? EMPTY_RESOURCE)
            : next,
      }));
    },
    [],
  );

  const load = useCallback(
    async (
      key: ResourceKey,
      loader: (signal: AbortSignal) => Promise<ResourceValue>,
    ) => {
      const currentGeneration = generation.current;
      const previous = resourcesRef.current[key];
      updateResource(key, {
        ...(previous ?? EMPTY_RESOURCE),
        status: "loading",
        error: null,
      });
      try {
        const data = await loader(abortRef.current!.signal);
        if (currentGeneration !== generation.current) return;
        updateResource(key, {
          status: hasStateData(data) ? "success" : "empty",
          data,
          error: null,
          updatedAt: Date.now(),
        });
      } catch (error) {
        if (currentGeneration !== generation.current) return;
        updateResource(key, {
          ...(previous ?? EMPTY_RESOURCE),
          status: previous?.data ? "success" : "error",
          error: getErrorMessage(error),
        });
      }
    },
    [updateResource],
  );

  const queryThread = useCallback(
    async (threadId: string) => {
      if (!threadId || !environment) return;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      generation.current += 1;
      const currentGeneration = generation.current;
      const emptyResources = { root: EMPTY_RESOURCE };
      resourcesRef.current = emptyResources;
      setResources(emptyResources);
      const loads: Promise<void>[] = [
        load("root", (signal) =>
          fetchRootThreadState({
            apiUrl: environment.apiUrl,
            apiKey: runtime.apiKey,
            authScheme: runtime.authScheme,
            threadId,
            signal,
          }),
        ),
        load(resourceKey("need", needDomain), (signal) =>
          fetchChildThreadState({
            apiUrl: environment.apiUrl,
            apiKey: runtime.apiKey,
            authScheme: runtime.authScheme,
            threadId,
            checkpointNs: getWorkbenchCheckpointNs("need", needDomain),
            signal,
          }),
        ),
        load(resourceKey("supply", supplyDomain), (signal) =>
          fetchChildThreadState({
            apiUrl: environment.apiUrl,
            apiKey: runtime.apiKey,
            authScheme: runtime.authScheme,
            threadId,
            checkpointNs: getWorkbenchCheckpointNs("supply", supplyDomain),
            signal,
          }),
        ),
      ];
      await Promise.allSettled(loads);
      if (currentGeneration !== generation.current) return;
    },
    [
      environment,
      load,
      needDomain,
      runtime.apiKey,
      runtime.authScheme,
      supplyDomain,
    ],
  );

  const runQuery = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const threadId = threadDraft.trim();
      if (!threadId) return;
      autoQueryRef.current = `${environmentId}:${threadId}`;
      void setThreadParam(threadId);
      void queryThread(threadId);
    },
    [environmentId, queryThread, setThreadParam, threadDraft],
  );

  const activeResources = useMemo(
    () => ({
      root: resources.root ?? EMPTY_RESOURCE,
      need: resources[resourceKey("need", needDomain)] ?? EMPTY_RESOURCE,
      supply: resources[resourceKey("supply", supplyDomain)] ?? EMPTY_RESOURCE,
    }),
    [needDomain, resources, supplyDomain],
  );

  useEffect(() => {
    if (!threadParam || !environment) return;
    const key = `${environmentId}:${threadParam}`;
    if (autoQueryRef.current === key) return;
    autoQueryRef.current = key;
    setThreadDraft((current) =>
      current === threadParam ? current : threadParam,
    );
    void queryThread(threadParam);
  }, [environment, environmentId, queryThread, threadParam]);

  useEffect(() => {
    if (!threadParam || !environment || !abortRef.current) return;
    const selected: Array<[ResourceKey, "need" | "supply", WorkbenchDomain]> = [
      [resourceKey("need", needDomain), "need", needDomain],
      [resourceKey("supply", supplyDomain), "supply", supplyDomain],
    ];
    for (const [key, panel, domain] of selected) {
      if (resources[key]) continue;
      void load(key, (signal) =>
        fetchChildThreadState({
          apiUrl: environment.apiUrl,
          apiKey: runtime.apiKey,
          authScheme: runtime.authScheme,
          threadId: threadParam,
          checkpointNs: getWorkbenchCheckpointNs(panel, domain),
          signal,
        }),
      );
    }
  }, [
    environment,
    load,
    needDomain,
    resources,
    runtime.apiKey,
    runtime.authScheme,
    supplyDomain,
    threadParam,
  ]);

  const matches = useMemo(
    () => [
      ...collectMatches(activeResources.root.data, query, "root"),
      ...collectMatches(activeResources.need.data, query, `need-${needDomain}`),
      ...collectMatches(
        activeResources.supply.data,
        query,
        `supply-${supplyDomain}`,
      ),
    ],
    [
      activeResources.need.data,
      activeResources.root.data,
      activeResources.supply.data,
      needDomain,
      query,
      supplyDomain,
    ],
  );
  useEffect(
    () => setMatchIndex(0),
    [query, matches.length, needDomain, supplyDomain],
  );
  const activeMatch = matches.length
    ? matches[Math.min(matchIndex, matches.length - 1)]
    : null;

  const workbenchColumns = useMemo(() => {
    const panels: WorkbenchPanelId[] = ["root", "need", "supply"];
    const expandedCount = panels.filter(
      (panel) => !collapsedPanels[panel],
    ).length;
    if (!expandedCount) return "repeat(3, 3rem)";
    return panels
      .map((panel) => (collapsedPanels[panel] ? "3rem" : "minmax(0, 1fr)"))
      .join(" ");
  }, [collapsedPanels]);

  const toggleCollapsed = (panel: WorkbenchPanelId) => {
    setCollapsedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  };

  const navigateMatch = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
  };

  useEffect(() => {
    if (!activeMatch) return;
    const panel = activeMatch.id.startsWith("need-")
      ? "need"
      : activeMatch.id.startsWith("supply-")
        ? "supply"
        : "root";
    setCollapsedPanels((current) =>
      current[panel] ? { ...current, [panel]: false } : current,
    );
    const elementId = `json-node-${activeMatch.id
      .replace(/:value$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    let frame = 0;
    let attempts = 0;
    const scrollToMatch = () => {
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts++ < 5) frame = requestAnimationFrame(scrollToMatch);
    };
    frame = requestAnimationFrame(scrollToMatch);
    return () => cancelAnimationFrame(frame);
  }, [activeMatch]);

  const refresh = (key: ResourceKey) => {
    if (!threadParam || !environment) return;
    const controller = abortRef.current ?? new AbortController();
    abortRef.current = controller;
    const [panel, domain] = key.split(":") as
      | ["need" | "supply", WorkbenchDomain]
      | ["root", undefined];
    void load(
      key,
      panel === "root"
        ? (signal) =>
            fetchRootThreadState({
              apiUrl: environment.apiUrl,
              apiKey: runtime.apiKey,
              authScheme: runtime.authScheme,
              threadId: threadParam,
              signal,
            })
        : (signal) =>
            fetchChildThreadState({
              apiUrl: environment.apiUrl,
              apiKey: runtime.apiKey,
              authScheme: runtime.authScheme,
              threadId: threadParam,
              checkpointNs: getWorkbenchCheckpointNs(panel, domain!),
              signal,
            }),
    );
  };

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 text-slate-900 md:h-screen md:overflow-hidden">
      <form
        onSubmit={runQuery}
        className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h1 className="text-lg font-semibold">Thread State Workbench</h1>
              <p className="text-xs text-slate-500">人工 case 状态追查</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              环境
              <select
                value={environmentId}
                onChange={(event) => {
                  void setEnvParam(event.target.value);
                  setResources({ root: EMPTY_RESOURCE });
                }}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="local">本地</option>
                <option value="si">SI</option>
                <option value="st">ST</option>
                <option value="prod">生产</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              value={threadDraft}
              onChange={(event) => setThreadDraft(event.target.value)}
              placeholder="输入 thread_id"
              className="h-10 flex-1 font-mono"
            />
            <Button
              type="submit"
              variant="brand"
              className="h-10 px-5"
            >
              查询
            </Button>
            <div className="relative flex min-w-0 flex-[1.2] items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索三个 JSON 面板"
                className="h-10 pl-9"
              />
              <span className="absolute right-3 text-xs text-slate-400">
                {matches.length
                  ? `${matchIndex + 1}/${matches.length}`
                  : "0 命中"}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10"
              disabled={!matches.length}
              onClick={() => navigateMatch(-1)}
              title="上一个命中"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10"
              disabled={!matches.length}
              onClick={() => navigateMatch(1)}
              title="下一个命中"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </form>
      <div
        className="grid w-full flex-1 grid-cols-1 gap-4 p-4 md:min-h-0 md:auto-rows-fr md:grid-cols-[var(--workbench-columns)] md:p-6"
        style={
          {
            "--workbench-columns": workbenchColumns,
          } as CSSProperties
        }
      >
        <Panel
          panel="root"
          title="Root state"
          state={activeResources.root}
          onRefresh={() => refresh("root")}
          query={query}
          activeMatchId={activeMatch?.id ?? null}
          collapsed={collapsedPanels.root}
          onToggleCollapsed={() => toggleCollapsed("root")}
        />
        <Panel
          panel="need"
          title="Need specialist state"
          domain={needDomain}
          onDomainChange={(domain) => {
            void setNeedParam(domain);
          }}
          state={activeResources.need}
          onRefresh={() => refresh(resourceKey("need", needDomain))}
          query={query}
          activeMatchId={activeMatch?.id ?? null}
          collapsed={collapsedPanels.need}
          onToggleCollapsed={() => toggleCollapsed("need")}
        />
        <Panel
          panel="supply"
          title="Supply specialist state"
          domain={supplyDomain}
          onDomainChange={(domain) => {
            void setSupplyParam(domain);
          }}
          state={activeResources.supply}
          onRefresh={() => refresh(resourceKey("supply", supplyDomain))}
          query={query}
          activeMatchId={activeMatch?.id ?? null}
          collapsed={collapsedPanels.supply}
          onToggleCollapsed={() => toggleCollapsed("supply")}
        />
      </div>
    </main>
  );
}
