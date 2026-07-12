"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  BookCopy,
  CheckIcon,
  CopyIcon,
  Database,
  RefreshCcw,
  ScrollText,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { MarkdownText } from "./markdown-text";
import { SyntaxHighlighter } from "./syntax-highlighter";
import {
  buildWorkbenchCacheKey,
  getChildStateSpecialist,
  getSkillsAgentName,
  SKILLS_TAB_LABELS,
  SKILLS_TABS,
  STATE_TAB_LABELS,
  STATE_TABS,
  type SkillsTabId,
  type StateTabId,
} from "./thread-workbench-config";
import {
  type ChildThreadStateResponse,
  type SkillFileResponse,
  type SkillsListResponse,
  type UserMemoryResponse,
  fetchChildThreadState,
  fetchSkillFile,
  fetchSkillsList,
  fetchUserMemory,
} from "./thread-workbench-data";

type WorkbenchPanelId = "state" | "skills" | "memory";

type ResourceState<T> = {
  status: "idle" | "loading" | "success" | "empty" | "error";
  data: T | null;
  error: string | null;
  updatedAt: number | null;
  refreshing: boolean;
};

type ThreadWorkbenchProps = {
  apiUrl: string;
  apiKey?: string | null;
  authScheme?: string | null;
  threadId?: string | null;
  threadState: unknown;
  chatStarted: boolean;
  isLargeScreen: boolean;
};

const EMPTY_CHILD_STATE: ResourceState<ChildThreadStateResponse> = {
  status: "idle",
  data: null,
  error: null,
  updatedAt: null,
  refreshing: false,
};

const EMPTY_SKILLS_LIST: ResourceState<SkillsListResponse> = {
  status: "idle",
  data: null,
  error: null,
  updatedAt: null,
  refreshing: false,
};

const EMPTY_SKILL_FILE: ResourceState<SkillFileResponse> = {
  status: "idle",
  data: null,
  error: null,
  updatedAt: null,
  refreshing: false,
};

const EMPTY_USER_MEMORY: ResourceState<UserMemoryResponse> = {
  status: "idle",
  data: null,
  error: null,
  updatedAt: null,
  refreshing: false,
};

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatTimestamp(value: number | null): string {
  if (!value) {
    return "未刷新";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function buildErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "请求失败";
}

function ToolDockButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-12 items-center justify-center rounded-2xl border transition-colors",
        active
          ? "border-teal-300 bg-teal-50 text-teal-700 shadow-sm"
          : "border-slate-200 bg-white/95 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700",
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function PanelTabs<T extends string>({
  tabs,
  labels,
  activeTab,
  onChange,
}: {
  tabs: readonly T[];
  labels: Record<T, string>;
  activeTab: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            activeTab === tab
              ? "border-teal-300 bg-teal-50 text-teal-700"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
          )}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

function JsonViewport({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  const formatted = useMemo(() => formatJson(value), [value]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#0b1020]">
      <div className="border-b border-white/10 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain text-xs leading-6">
        <SyntaxHighlighter
          language="js"
          className="text-xs"
          preTag="div"
          showLineNumbers
          wrapLongLines={false}
          customStyle={{
            padding: "1rem",
            overflow: "visible",
          }}
        >
          {formatted}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

function WorkbenchShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function StatePanel({
  activeTab,
  onTabChange,
  threadState,
  threadId,
  stateCache,
  onRefresh,
}: {
  activeTab: StateTabId;
  onTabChange: (tab: StateTabId) => void;
  threadState: unknown;
  threadId?: string | null;
  stateCache: Record<string, ResourceState<ChildThreadStateResponse>>;
  onRefresh: (tab: StateTabId) => void;
}) {
  const specialist = getChildStateSpecialist(activeTab);
  const stateKey = buildWorkbenchCacheKey({
    threadId,
    panel: "state",
    tab: activeTab,
  });
  const cached = stateCache[stateKey] ?? EMPTY_CHILD_STATE;
  const title =
    activeTab === "main"
      ? "Main Thread State"
      : `${STATE_TAB_LABELS[activeTab]} Child State`;
  const subtitle =
    activeTab === "main"
      ? "Source: current stream.values"
      : threadId
        ? `GET child-state specialist=${specialist} thread_id=${threadId}`
        : "当前还没有可查询的 thread_id";
  const jsonValue = activeTab === "main" ? threadState : cached.data;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatJson(jsonValue));
  };

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
        <PanelTabs
          tabs={STATE_TABS}
          labels={STATE_TAB_LABELS}
          activeTab={activeTab}
          onChange={onTabChange}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{title}</span>
          <span>•</span>
          <span>{subtitle}</span>
          {activeTab !== "main" ? (
            <>
              <span>•</span>
              <span>更新时间 {formatTimestamp(cached.updatedAt)}</span>
            </>
          ) : null}
          {cached.refreshing ? (
            <>
              <span>•</span>
              <span className="text-teal-600">后台刷新中</span>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => onRefresh(activeTab)}
          >
            <RefreshCcw className="size-3.5" />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleCopy}
          >
            <CopyIcon className="size-3.5" />
            <span>Copy JSON</span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
        {activeTab !== "main" && cached.status === "loading" && !cached.data ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            正在加载 {STATE_TAB_LABELS[activeTab]} 的 child state…
          </div>
        ) : null}
        {activeTab !== "main" && cached.status === "error" && !cached.data ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
            {cached.error ?? "child state 请求失败"}
          </div>
        ) : null}
        {activeTab !== "main" && cached.status === "empty" ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            {threadId
              ? `当前 specialist 暂无 child state: ${STATE_TAB_LABELS[activeTab]}`
              : "当前还没有可查询的 thread_id"}
          </div>
        ) : null}
        <JsonViewport
          title={activeTab === "main" ? "Current State JSON" : "Child State JSON"}
          value={jsonValue}
        />
      </div>
    </>
  );
}

function SkillsPanel({
  activeTab,
  onTabChange,
  listCache,
  detailCache,
  selectedSkillPathByTab,
  onSelectSkill,
  onRefreshList,
  onRefreshDetail,
  threadId,
}: {
  activeTab: SkillsTabId;
  onTabChange: (tab: SkillsTabId) => void;
  listCache: Record<string, ResourceState<SkillsListResponse>>;
  detailCache: Record<string, ResourceState<SkillFileResponse>>;
  selectedSkillPathByTab: Partial<Record<SkillsTabId, string | null>>;
  onSelectSkill: (tab: SkillsTabId, path: string) => void;
  onRefreshList: (tab: SkillsTabId) => void;
  onRefreshDetail: (path: string | null) => void;
  threadId?: string | null;
}) {
  const listKey = buildWorkbenchCacheKey({
    threadId,
    panel: "skills",
    tab: activeTab,
  });
  const listState = listCache[listKey] ?? EMPTY_SKILLS_LIST;
  const selectedPath = selectedSkillPathByTab[activeTab] ?? null;
  const detailState = selectedPath
    ? detailCache[selectedPath] ?? EMPTY_SKILL_FILE
    : EMPTY_SKILL_FILE;
  const skills = listState.data?.skills ?? [];

  const handleCopyPath = async () => {
    if (!selectedPath) return;
    await navigator.clipboard.writeText(selectedPath);
  };

  const handleCopyContent = async () => {
    await navigator.clipboard.writeText(detailState.data?.content ?? "");
  };

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
        <PanelTabs
          tabs={SKILLS_TABS}
          labels={SKILLS_TAB_LABELS}
          activeTab={activeTab}
          onChange={onTabChange}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            {activeTab === "all"
              ? "GET skills"
              : `GET skills agent_name=${getSkillsAgentName(activeTab)}`}
          </span>
          <span>•</span>
          <span>更新时间 {formatTimestamp(listState.updatedAt)}</span>
          {listState.refreshing ? (
            <>
              <span>•</span>
              <span className="text-teal-600">后台刷新中</span>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => onRefreshList(activeTab)}
          >
            <RefreshCcw className="size-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,14rem)_minmax(0,1fr)] gap-4 px-5 py-4">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Skill List
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {listState.status === "loading" && !listState.data ? (
              <div className="px-4 py-6 text-sm text-slate-500">正在加载 skill 清单…</div>
            ) : null}
            {listState.status === "error" && !listState.data ? (
              <div className="px-4 py-6 text-sm text-red-700">
                {listState.error ?? "skill 清单请求失败"}
              </div>
            ) : null}
            {listState.status === "empty" ? (
              <div className="px-4 py-6 text-sm text-slate-500">当前 tab 暂无 skill。</div>
            ) : null}
            {skills.length > 0 ? (
              <div className="flex flex-col">
                {skills.map((skill) => {
                  const active = selectedPath === skill.path;
                  return (
                    <button
                      key={skill.path}
                      type="button"
                      onClick={() => onSelectSkill(activeTab, skill.path)}
                      className={cn(
                        "border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0",
                        active ? "bg-teal-50" : "hover:bg-slate-50",
                      )}
                    >
                      <div className="text-sm font-medium text-slate-900">
                        {skill.name || skill.path}
                      </div>
                      {skill.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {skill.description}
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="truncate">{skill.path}</span>
                        {active ? <CheckIcon className="size-3.5 text-teal-600" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#0b1020]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
            <span>Skill Detail</span>
            {selectedPath ? (
              <>
                <span className="text-slate-500">•</span>
                <span className="truncate normal-case tracking-normal text-slate-400">
                  {selectedPath}
                </span>
              </>
            ) : null}
            {selectedPath ? (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={() => onRefreshDetail(selectedPath)}
                >
                  <RefreshCcw className="size-3.5" />
                  <span>Refresh</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={handleCopyPath}
                >
                  <CopyIcon className="size-3.5" />
                  <span>Copy Path</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                  onClick={handleCopyContent}
                >
                  <BookCopy className="size-3.5" />
                  <span>Copy Content</span>
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
            {!selectedPath ? (
              <div className="px-4 py-6 text-sm text-slate-400">选择一个 skill 后在这里查看详情。</div>
            ) : null}
            {selectedPath && detailState.status === "loading" && !detailState.data ? (
              <div className="px-4 py-6 text-sm text-slate-400">正在加载 skill 文件…</div>
            ) : null}
            {selectedPath && detailState.status === "error" && !detailState.data ? (
              <div className="px-4 py-6 text-sm text-red-300">
                {detailState.error ?? "skill 文件请求失败"}
              </div>
            ) : null}
            {selectedPath && detailState.status === "empty" ? (
              <div className="px-4 py-6 text-sm text-slate-400">当前 skill 文件不存在或内容为空。</div>
            ) : null}
            {selectedPath && detailState.data?.content ? (
              <pre className="whitespace-pre-wrap px-4 py-4 font-mono text-xs leading-6 text-slate-100">
                {detailState.data.content}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function MemoryPanel({
  currentUserIdDraft,
  onCurrentUserIdDraftChange,
  currentUserId,
  memoryState,
  onRefresh,
}: {
  currentUserIdDraft: string;
  onCurrentUserIdDraftChange: (value: string) => void;
  currentUserId: string;
  memoryState: ResourceState<UserMemoryResponse>;
  onRefresh: () => void;
}) {
  const memoryMarkdown = memoryState.data?.memory_md?.trim() ?? "";
  const hasUserId = currentUserId.length > 0;

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-slate-600">current_user_id</div>
          <div className="flex items-center gap-2">
            <Input
              value={currentUserIdDraft}
              onChange={(event) => onCurrentUserIdDraftChange(event.target.value)}
              placeholder="输入 current_user_id 后自动请求"
              className="h-9"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-xs"
              onClick={onRefresh}
              disabled={!hasUserId}
            >
              <RefreshCcw className="size-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            {hasUserId
              ? `GET user-memory current_user_id=${currentUserId}`
              : "请输入 current_user_id"}
          </span>
          <span>•</span>
          <span>更新时间 {formatTimestamp(memoryState.updatedAt)}</span>
          {memoryState.refreshing ? (
            <>
              <span>•</span>
              <span className="text-teal-600">后台刷新中</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,16rem)_minmax(0,1fr)] gap-4 px-5 py-4">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
            Memory Markdown
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            {!hasUserId ? (
              <div className="text-sm text-slate-500">输入 `current_user_id` 后查看长期记忆。</div>
            ) : null}
            {hasUserId && memoryState.status === "loading" && !memoryState.data ? (
              <div className="text-sm text-slate-500">正在加载长期记忆…</div>
            ) : null}
            {hasUserId && memoryState.status === "error" && !memoryState.data ? (
              <div className="text-sm text-red-700">{memoryState.error ?? "长期记忆请求失败"}</div>
            ) : null}
            {hasUserId && memoryState.status === "empty" ? (
              <div className="text-sm text-slate-500">当前用户暂无长期记忆。</div>
            ) : null}
            {hasUserId && memoryState.status === "success" && !memoryMarkdown ? (
              <div className="text-sm text-slate-500">当前用户暂无长期记忆。</div>
            ) : null}
            {memoryMarkdown ? <MarkdownText>{memoryMarkdown}</MarkdownText> : null}
          </div>
        </div>

        <JsonViewport
          title="Memory JSON"
          value={memoryState.data}
        />
      </div>
    </>
  );
}

export function ThreadWorkbench({
  apiUrl,
  apiKey,
  authScheme,
  threadId,
  threadState,
  chatStarted,
  isLargeScreen,
}: ThreadWorkbenchProps) {
  const [activePanel, setActivePanel] = useState<WorkbenchPanelId | null>(null);
  const [activeStateTab, setActiveStateTab] = useState<StateTabId>("main");
  const [activeSkillsTab, setActiveSkillsTab] = useState<SkillsTabId>("all");
  const [stateCache, setStateCache] = useState<
    Record<string, ResourceState<ChildThreadStateResponse>>
  >({});
  const [skillsListCache, setSkillsListCache] = useState<
    Record<string, ResourceState<SkillsListResponse>>
  >({});
  const [skillDetailCache, setSkillDetailCache] = useState<
    Record<string, ResourceState<SkillFileResponse>>
  >({});
  const [userMemoryCache, setUserMemoryCache] = useState<
    Record<string, ResourceState<UserMemoryResponse>>
  >({});
  const [selectedSkillPathByTab, setSelectedSkillPathByTab] = useState<
    Partial<Record<SkillsTabId, string | null>>
  >({});
  const [currentUserIdDraft, setCurrentUserIdDraft] = useState("");
  const [stateRefreshToken, setStateRefreshToken] = useState(0);
  const [skillsListRefreshToken, setSkillsListRefreshToken] = useState(0);
  const [skillDetailRefreshToken, setSkillDetailRefreshToken] = useState(0);
  const [userMemoryRefreshToken, setUserMemoryRefreshToken] = useState(0);
  const lastStateRequestRef = useRef<string>("");
  const lastSkillsListRequestRef = useRef<string>("");
  const lastSkillDetailRequestRef = useRef<string>("");
  const lastUserMemoryRequestRef = useRef<string>("");

  const activeSkillPath = selectedSkillPathByTab[activeSkillsTab] ?? null;
  const currentUserId = currentUserIdDraft.trim();
  const activeStateCacheKey = buildWorkbenchCacheKey({
    threadId,
    panel: "state",
    tab: activeStateTab,
  });
  const activeSkillsListCacheKey = buildWorkbenchCacheKey({
    threadId,
    panel: "skills",
    tab: activeSkillsTab,
  });
  const activeMemoryCacheKey = buildWorkbenchCacheKey({
    threadId,
    panel: "memory",
    tab: currentUserId || "no-user",
  });

  useEffect(() => {
    if (activePanel !== "state") {
      return;
    }
    const requestSignature = [
      activePanel,
      activeStateTab,
      threadId ?? "no-thread",
      apiUrl,
      stateRefreshToken,
    ].join(":");
    if (lastStateRequestRef.current === requestSignature) {
      return;
    }
    lastStateRequestRef.current = requestSignature;

    const specialist = getChildStateSpecialist(activeStateTab);
    if (!specialist) {
      return;
    }

    const previous = stateCache[activeStateCacheKey];
    const hasCachedData = Boolean(previous?.data);

    if (!threadId) {
      setStateCache((prev) => ({
        ...prev,
        [activeStateCacheKey]: {
          ...EMPTY_CHILD_STATE,
          status: "empty",
        },
      }));
      return;
    }

    let cancelled = false;
    setStateCache((prev) => ({
      ...prev,
      [activeStateCacheKey]: {
        ...(prev[activeStateCacheKey] ?? EMPTY_CHILD_STATE),
        status: hasCachedData ? "success" : "loading",
        refreshing: hasCachedData,
        error: null,
      },
    }));

    void fetchChildThreadState({
      apiUrl,
      apiKey,
      authScheme,
      specialist,
      threadId,
    })
      .then((data) => {
        if (cancelled) return;
        setStateCache((prev) => ({
          ...prev,
          [activeStateCacheKey]: {
            status: data ? "success" : "empty",
            data: data ?? null,
            error: null,
            updatedAt: Date.now(),
            refreshing: false,
          },
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setStateCache((prev) => ({
          ...prev,
          [activeStateCacheKey]: {
            ...(prev[activeStateCacheKey] ?? EMPTY_CHILD_STATE),
            status: hasCachedData ? "success" : "error",
            error: buildErrorMessage(error),
            refreshing: false,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, activeStateTab, threadId, apiUrl, apiKey, authScheme, activeStateCacheKey, stateRefreshToken]);

  useEffect(() => {
    if (activePanel !== "skills") {
      return;
    }
    const requestSignature = [
      activePanel,
      activeSkillsTab,
      threadId ?? "no-thread",
      apiUrl,
      skillsListRefreshToken,
    ].join(":");
    if (lastSkillsListRequestRef.current === requestSignature) {
      return;
    }
    lastSkillsListRequestRef.current = requestSignature;

    const previous = skillsListCache[activeSkillsListCacheKey];
    const hasCachedData = Boolean(previous?.data);

    let cancelled = false;
    setSkillsListCache((prev) => ({
      ...prev,
      [activeSkillsListCacheKey]: {
        ...(prev[activeSkillsListCacheKey] ?? EMPTY_SKILLS_LIST),
        status: hasCachedData ? "success" : "loading",
        refreshing: hasCachedData,
        error: null,
      },
    }));

    void fetchSkillsList({
      apiUrl,
      apiKey,
      authScheme,
      agentName: getSkillsAgentName(activeSkillsTab),
    })
      .then((data) => {
        if (cancelled) return;
        setSkillsListCache((prev) => ({
          ...prev,
          [activeSkillsListCacheKey]: {
            status: data.skills.length > 0 ? "success" : "empty",
            data,
            error: null,
            updatedAt: Date.now(),
            refreshing: false,
          },
        }));
        setSelectedSkillPathByTab((prev) => {
          const current = prev[activeSkillsTab];
          const hasCurrent = current
            ? data.skills.some((skill) => skill.path === current)
            : false;
          return {
            ...prev,
            [activeSkillsTab]: hasCurrent ? current : (data.skills[0]?.path ?? null),
          };
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setSkillsListCache((prev) => ({
          ...prev,
          [activeSkillsListCacheKey]: {
            ...(prev[activeSkillsListCacheKey] ?? EMPTY_SKILLS_LIST),
            status: hasCachedData ? "success" : "error",
            error: buildErrorMessage(error),
            refreshing: false,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, activeSkillsTab, threadId, apiUrl, apiKey, authScheme, activeSkillsListCacheKey, skillsListRefreshToken]);

  useEffect(() => {
    if (activePanel !== "skills") {
      return;
    }
    if (!activeSkillPath) {
      return;
    }
    const requestSignature = [
      activePanel,
      activeSkillPath,
      apiUrl,
      skillDetailRefreshToken,
    ].join(":");
    if (lastSkillDetailRequestRef.current === requestSignature) {
      return;
    }
    lastSkillDetailRequestRef.current = requestSignature;

    const previous = skillDetailCache[activeSkillPath];
    const hasCachedData = Boolean(previous?.data);

    let cancelled = false;
    setSkillDetailCache((prev) => ({
      ...prev,
      [activeSkillPath]: {
        ...(prev[activeSkillPath] ?? EMPTY_SKILL_FILE),
        status: hasCachedData ? "success" : "loading",
        refreshing: hasCachedData,
        error: null,
      },
    }));

    void fetchSkillFile({
      apiUrl,
      apiKey,
      authScheme,
      path: activeSkillPath,
    })
      .then((data) => {
        if (cancelled) return;
        const hasContent = Boolean(data.exists && data.content);
        setSkillDetailCache((prev) => ({
          ...prev,
          [activeSkillPath]: {
            status: hasContent ? "success" : "empty",
            data,
            error: null,
            updatedAt: Date.now(),
            refreshing: false,
          },
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setSkillDetailCache((prev) => ({
          ...prev,
          [activeSkillPath]: {
            ...(prev[activeSkillPath] ?? EMPTY_SKILL_FILE),
            status: hasCachedData ? "success" : "error",
            error: buildErrorMessage(error),
            refreshing: false,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, activeSkillPath, apiUrl, apiKey, authScheme, skillDetailRefreshToken]);

  useEffect(() => {
    if (activePanel !== "memory") {
      return;
    }
    const requestSignature = [
      activePanel,
      currentUserId || "no-user",
      apiUrl,
      userMemoryRefreshToken,
    ].join(":");
    if (lastUserMemoryRequestRef.current === requestSignature) {
      return;
    }
    lastUserMemoryRequestRef.current = requestSignature;

    if (!currentUserId) {
      return;
    }

    const previous = userMemoryCache[activeMemoryCacheKey];
    const hasCachedData = Boolean(previous?.data);

    let cancelled = false;
    setUserMemoryCache((prev) => ({
      ...prev,
      [activeMemoryCacheKey]: {
        ...(prev[activeMemoryCacheKey] ?? EMPTY_USER_MEMORY),
        status: hasCachedData ? "success" : "loading",
        refreshing: hasCachedData,
        error: null,
      },
    }));

    void fetchUserMemory({
      apiUrl,
      apiKey,
      authScheme,
      currentUserId,
    })
      .then((data) => {
        if (cancelled) return;
        setUserMemoryCache((prev) => ({
          ...prev,
          [activeMemoryCacheKey]: {
            status: data.exists === false && !data.memory_md ? "empty" : "success",
            data,
            error: null,
            updatedAt: Date.now(),
            refreshing: false,
          },
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setUserMemoryCache((prev) => ({
          ...prev,
          [activeMemoryCacheKey]: {
            ...(prev[activeMemoryCacheKey] ?? EMPTY_USER_MEMORY),
            status: hasCachedData ? "success" : "error",
            error: buildErrorMessage(error),
            refreshing: false,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, currentUserId, apiUrl, apiKey, authScheme, activeMemoryCacheKey, userMemoryRefreshToken]);

  if (!chatStarted) {
    return null;
  }

  const panelTitle =
    activePanel === "state" ? "State" : activePanel === "skills" ? "Skills" : "Memory";
  const panelSubtitle = threadId ? `Thread: ${threadId}` : "当前会话还没有稳定 thread_id";
  const activeMemoryState = userMemoryCache[activeMemoryCacheKey] ?? EMPTY_USER_MEMORY;

  const panelContent = activePanel === "state" ? (
    <StatePanel
      activeTab={activeStateTab}
      onTabChange={setActiveStateTab}
      threadState={threadState}
      threadId={threadId}
      stateCache={stateCache}
      onRefresh={(_tab) => {
        setStateRefreshToken((prev) => prev + 1);
      }}
    />
  ) : activePanel === "skills" ? (
    <SkillsPanel
      activeTab={activeSkillsTab}
      onTabChange={setActiveSkillsTab}
      listCache={skillsListCache}
      detailCache={skillDetailCache}
      selectedSkillPathByTab={selectedSkillPathByTab}
      onSelectSkill={(tab, path) => {
        setSelectedSkillPathByTab((prev) => ({
          ...prev,
          [tab]: path,
        }));
      }}
      onRefreshList={(_tab) => {
        setSkillsListRefreshToken((prev) => prev + 1);
      }}
      onRefreshDetail={(_path) => {
        setSkillDetailRefreshToken((prev) => prev + 1);
      }}
      threadId={threadId}
    />
  ) : activePanel === "memory" ? (
    <MemoryPanel
      currentUserIdDraft={currentUserIdDraft}
      onCurrentUserIdDraftChange={setCurrentUserIdDraft}
      currentUserId={currentUserId}
      memoryState={activeMemoryState}
      onRefresh={() => {
        setUserMemoryRefreshToken((prev) => prev + 1);
      }}
    />
  ) : null;

  const togglePanel = (panel: WorkbenchPanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const dock = (
    <div className="pointer-events-auto flex flex-col gap-2 rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-lg backdrop-blur-sm">
      <ToolDockButton
        active={activePanel === "state"}
        icon={<Database className="size-5" />}
        label="State"
        onClick={() => togglePanel("state")}
      />
      <ToolDockButton
        active={activePanel === "skills"}
        icon={<Wrench className="size-5" />}
        label="Skills"
        onClick={() => togglePanel("skills")}
      />
      <ToolDockButton
        active={activePanel === "memory"}
        icon={<ScrollText className="size-5" />}
        label="Memory"
        onClick={() => togglePanel("memory")}
      />
    </div>
  );

  if (!isLargeScreen) {
    return (
      <>
        <div className="pointer-events-none fixed right-4 bottom-24 z-30">
          {dock}
        </div>
        <Sheet
          open={activePanel !== null}
          onOpenChange={(open) => {
            if (!open) {
              setActivePanel(null);
            }
          }}
        >
          <SheetContent
            side="bottom"
            className="h-[85vh] w-full max-w-none gap-0 rounded-t-3xl border-t p-0"
          >
            <SheetHeader className="border-b border-slate-200 px-5 py-4">
              <SheetTitle>Thread Workbench</SheetTitle>
              <SheetDescription>{panelSubtitle}</SheetDescription>
            </SheetHeader>
            {panelContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="pointer-events-none absolute top-24 right-4 bottom-6 z-20 flex items-start">
      {activePanel ? (
        <div className="pointer-events-auto mr-3 h-full w-[min(520px,calc(100vw-10rem))]">
          <WorkbenchShell
            title={`Thread Workbench · ${panelTitle}`}
            subtitle={panelSubtitle}
          >
            {panelContent}
          </WorkbenchShell>
        </div>
      ) : null}
      {dock}
    </div>
  );
}
