import { v4 as uuidv4 } from "uuid";
import { ReactNode, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext, useConfigContext } from "@/providers/Stream";
import { type StateType } from "@/providers/Stream";
import { useState, FormEvent, useEffect, useMemo } from "react";
import { Button } from "../ui/button";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { type UIMessage } from "@langchain/langgraph-sdk/react-ui";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { LangGraphLogoSVG } from "../icons/langgraph";
import { TooltipIconButton } from "./tooltip-icon-button";
import {
  ArrowDown,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  XIcon,
  Plus,
  Settings,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import ThreadHistory from "./history";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { GitHubSVG } from "../icons/github";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { useFileUpload } from "@/hooks/use-file-upload";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
  useArtifactContext,
} from "./artifact";
import { AssistantSelector } from "./assistant-selector";
import { ParamsPanel, type CustomParams } from "./params-panel";
import {
  appendAndSelectParamsProfile,
  buildStoredParamsDraft,
  createInitialParamsProfileStore,
  createParamsProfile,
  deleteActiveParamsProfile,
  getActiveParamsProfile,
  LEGACY_PARAMS_STORAGE_KEY,
  migrateStoredParamsDraft,
  PARAMS_PROFILES_STORAGE_KEY,
  parseParamsProfileStore,
  parseStoredParamsDraft,
  renameActiveParamsProfile,
  selectParamsProfile,
  serializeParamsProfileStore,
  updateActiveParamsProfile as updateStoredParamsProfile,
  type ParamsProfileStore,
} from "./params-storage";
import { buildSubmitConfig } from "./submit-config";
import {
  PendingInterruptCard,
} from "./process-trace";
import {
  getInternalTraceEntries,
  getInternalTraceEntriesForRun,
  buildTranscriptBlocks,
  mapHistoricalThinkingTraceCards,
  mergeThinkingTraceCards,
  resolveThinkingTrace,
  resolveThinkingTraceCards,
  splitTranscriptBlocksForThinking,
} from "./process-trace-helpers";
import { hasMessageBoundUi } from "./message-bound-ui";
import { getContentString } from "./utils";
import { ThinkingTraceCard } from "./thinking-trace-card";
import { ThreadWorkbench } from "./thread-workbench";
import { resolveTelemetryEventsForRun } from "./analytics-state";
import {
  readThinkingTraceCacheFromSessionStorage,
  writeThinkingTraceCacheToSessionStorage,
} from "./thinking-trace-cache";
import { resolveThinkingTraceDisplay } from "./thinking-trace-display";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div
        ref={context.contentRef}
        className={props.contentClassName}
      >
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="h-4 w-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function OpenGitHubRepo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://github.com/langchain-ai/agent-chat-ui"
            target="_blank"
            className="flex items-center justify-center"
          >
            <GitHubSVG
              width="24"
              height="24"
            />
          </a>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Open GitHub repo</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getStateMessages(values: StateType | undefined): Message[] {
  return Array.isArray(values?.messages) ? values.messages : [];
}

function getStateInterrupt(values: StateType | undefined): unknown {
  const raw = (values as Record<string, unknown> | undefined)?.__interrupt__;
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  return raw.length === 1 ? raw[0] : raw;
}

export function Thread() {
  const [artifactContext, setArtifactContext] = useArtifactContext();
  const [artifactOpen, closeArtifact] = useArtifactOpen();

  const [threadId, _setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(true),
  );
  const [hideToolCalls, setHideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );
  const [input, setInput] = useState("");
  const {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    resetBlocks: _resetBlocks,
    dragOver,
    handlePaste,
  } = useFileUpload();
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const stream = useStreamContext();
  const { setShowConfig, apiUrl, apiKey, authScheme } = useConfigContext();
  const stateValues = stream.values as StateType | undefined;
  const isLoading = stream.isLoading;

  // 保护 UI 帧不被 child namespace 的空 values 快照挤掉。
  //
  // 真实复现：run 进行中，后端会发 `values|family-main|tools|food-need` 这类
  // child subgraph 的 values 快照，它的 `ui` 是空数组。SDK 的 `stream.values`
  // 是单值整体替换语义，会把 root 的 UI 帧（thinking_trace 卡 / card）挤掉，
  // 导致卡片"中途消失"或缴费卡/确认卡不显示。
  //
  // UI 的正确语义是"累积 + 显式 remove-ui 才移除"，不该被空快照覆盖。这里用
  // ref 维护一份持续累积的 UI 帧（按 id upsert）：
  // - 当前快照有 UI 帧 → upsert 进 ref（同 id 覆盖、新 id 追加）；新 run 信号
  //   （thinking_trace 帧的 id 变化）触发清掉旧 run 的帧，避免跨 run 残留；
  // - 当前快照没有 UI 帧 且 run 仍在进行（isLoading）→ 用 ref 兜底补回；
  //   只在 isLoading 时兜底，避免 run 结束后旧卡残留、新建会话时旧卡跟着出现；
  // - threadId 切换（新建会话）时立刻清空 ref，绝不跨会话兜底。
  const prevUiFramesRef = useRef<UIMessage[]>([]);
  useEffect(() => {
    prevUiFramesRef.current = [];
  }, [threadId]);
  const protectedUi = useMemo(() => {
    const current = (stateValues?.ui ?? []) as UIMessage[];
    const isUi = (it: unknown): it is UIMessage =>
      typeof it === "object" &&
      it !== null &&
      (it as { type?: string }).type === "ui";
    const currentUi = current.filter(isUi);

    if (currentUi.length > 0) {
      // 新 run 信号：thinking_trace 帧的 id 形如 thinking:<run_id>，run 切换时
      // 新 id 出现 → 清掉 ref 里不属于当前 run 的旧帧（thinking_trace + 跟随它的 card）。
      const currentThinkingIds = new Set(
        currentUi
          .filter((it) => it.name === "thinking_trace")
          .map((it) => it.id),
      );
      if (currentThinkingIds.size > 0) {
        // 保留 ref 里当前快照也有的帧（同 id），丢掉旧 run 的。
        prevUiFramesRef.current = prevUiFramesRef.current.filter(
          (it) => currentThinkingIds.has(it.id) || it.name !== "thinking_trace",
        );
      }
      // upsert 当前快照的 UI 帧（同 id 覆盖、新 id 追加）。
      const merged = new Map<string, UIMessage>();
      for (const it of prevUiFramesRef.current) merged.set(it.id, it);
      for (const it of currentUi) merged.set(it.id, it);
      const next = [...merged.values()];
      prevUiFramesRef.current = next;
      return next;
    }

    // 当前快照没有 UI 帧：只在 run 仍在进行时兜底，避免 child 空快照挤掉卡。
    // run 未在跑时（已结束 / 新建会话空窗）不兜底，卡该没就没。
    if (isLoading && prevUiFramesRef.current.length > 0) {
      return prevUiFramesRef.current;
    }
    return current;
  }, [stateValues?.ui, isLoading]);

  const messages = useMemo(() => getStateMessages(stateValues), [stateValues]);
  const interrupt = useMemo(() => getStateInterrupt(stateValues), [stateValues]);
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message) => !message.id?.startsWith(DO_NOT_RENDER_ID_PREFIX),
      ),
    [messages],
  );
  // transcript 里的 AI message 保留条件：有文本，或绑定了 UI 卡（如需求确认卡
  // 这种 `subagent_ui_anchor`：content 为空但 `card.metadata.message_id === message.id`）。
  // 对齐 LangGraph 官方模式——AI message 一律渲染，文本用 trim() 守卫，绑定的 UI 卡
  // 始终挂在该 message 下。若按“content 非空”过滤，会把空文本但绑了 card 的 anchor
  // message 整个丢掉，导致 card 不显示。
  const transcriptMessages = useMemo(
    () =>
      visibleMessages.filter((message) => {
        if (message.type === "human") {
          return true;
        }
        if (message.type !== "ai") {
          return false;
        }
        if (getContentString(message.content).trim().length > 0) {
          return true;
        }
        return hasMessageBoundUi(protectedUi, message);
      }),
    [visibleMessages, protectedUi],
  );
  const internalTraceEntries = useMemo(
    () => getInternalTraceEntries(visibleMessages, isLoading),
    [visibleMessages, isLoading],
  );
  const transcriptBlocks = useMemo(
    () =>
      buildTranscriptBlocks({
        messages: transcriptMessages,
      }),
    [transcriptMessages],
  );
  const transcriptLayout = useMemo(
    () => splitTranscriptBlocksForThinking(transcriptBlocks),
    [transcriptBlocks],
  );
  const thinkingTrace = useMemo(
    () => resolveThinkingTrace(protectedUi),
    [protectedUi],
  );
  const durableThinkingCardsInView = useMemo(
    () => resolveThinkingTraceCards(protectedUi),
    [protectedUi],
  );
  const [thinkingTraceCacheByThreadId, setThinkingTraceCacheByThreadId] = useState<
    Record<string, ReturnType<typeof resolveThinkingTraceCards>>
  >({});
  const [thinkingTraceCacheReady, setThinkingTraceCacheReady] = useState(false);
  useEffect(() => {
    const stored = readThinkingTraceCacheFromSessionStorage();
    setThinkingTraceCacheByThreadId((prev) => {
      const merged = { ...stored };
      for (const [cachedThreadId, cards] of Object.entries(prev)) {
        merged[cachedThreadId] = mergeThinkingTraceCards(
          stored[cachedThreadId] ?? [],
          cards,
        );
      }
      return merged;
    });
    setThinkingTraceCacheReady(true);
  }, []);
  useEffect(() => {
    if (!threadId || durableThinkingCardsInView.length === 0) {
      return;
    }
    setThinkingTraceCacheByThreadId((prev) => {
      const current = prev[threadId] ?? [];
      const next = mergeThinkingTraceCards(current, durableThinkingCardsInView);
      if (JSON.stringify(current) === JSON.stringify(next)) {
        return prev;
      }
      return {
        ...prev,
        [threadId]: next,
      };
    });
  }, [threadId, durableThinkingCardsInView]);
  useEffect(() => {
    if (!thinkingTraceCacheReady) {
      return;
    }
    writeThinkingTraceCacheToSessionStorage(thinkingTraceCacheByThreadId);
  }, [thinkingTraceCacheByThreadId, thinkingTraceCacheReady]);
  const thinkingDisplay = useMemo(
    () =>
      resolveThinkingTraceDisplay({
        durable: thinkingTrace,
        thinkingState: stream.thinkingState,
      }),
    [thinkingTrace, stream.thinkingState],
  );
  const durableThinkingCards = threadId
    ? (thinkingTraceCacheByThreadId[threadId] ?? durableThinkingCardsInView)
    : durableThinkingCardsInView;
  const historicalThinkingTraceMap = useMemo(() => {
    const humanMessageIds = transcriptBlocks
      .filter((block) => block.kind === "human")
      .map((block) => block.message.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const hasCurrentThinkingCard = Boolean(thinkingDisplay.snapshot);
    const historicalCards = hasCurrentThinkingCard
      ? durableThinkingCards.slice(0, -1)
      : durableThinkingCards;
    const historicalHumanMessageIds = hasCurrentThinkingCard
      ? humanMessageIds.slice(0, -1)
      : humanMessageIds;

    return mapHistoricalThinkingTraceCards({
      cards: historicalCards,
      humanMessageIds: historicalHumanMessageIds,
    });
  }, [durableThinkingCards, transcriptBlocks, thinkingDisplay.snapshot]);
  const telemetryEventsByRunId = useMemo(() => {
    const eventsByRunId: Record<string, ReturnType<typeof resolveTelemetryEventsForRun>> = {};
    const runIds = new Set<string>();

    for (const card of durableThinkingCards) {
      if (card.runId) {
        runIds.add(card.runId);
      }
    }
    if (thinkingDisplay.runId) {
      runIds.add(thinkingDisplay.runId);
    }

    for (const runId of runIds) {
      eventsByRunId[runId] = resolveTelemetryEventsForRun(
        stream.analyticsState,
        runId,
      );
    }

    return eventsByRunId;
  }, [durableThinkingCards, thinkingDisplay.runId, stream.analyticsState]);
  const runtimeTraceEntriesByRunId = useMemo(() => {
    const entriesByRunId: Record<
      string,
      ReturnType<typeof getInternalTraceEntriesForRun>
    > = {};
    const runIds = new Set<string>();

    for (const card of durableThinkingCards) {
      if (card.runId) {
        runIds.add(card.runId);
      }
    }
    if (thinkingDisplay.runId) {
      runIds.add(thinkingDisplay.runId);
    }

    for (const runId of runIds) {
      entriesByRunId[runId] = getInternalTraceEntriesForRun(
        internalTraceEntries,
        runId,
      );
    }

    return entriesByRunId;
  }, [durableThinkingCards, thinkingDisplay.runId, internalTraceEntries]);

  /**
   * Custom LangGraph run parameters set by the user in the ParamsPanel.
   * configurable → passed as config.configurable in stream.submit()
   * input       → merged into the graph state alongside messages
   *
   * These are kept in component state (not URL params) because they can
   * be large JSON objects. They persist across messages within a session.
   */
  const [paramsProfileStore, setParamsProfileStore] =
    useState<ParamsProfileStore | null>(null);
  const [paramsLoaded, setParamsLoaded] = useState(false);

  /**
   * Load a named profile store from localStorage, then migrate the legacy
   * single draft before falling back to /default-params.json.
   *
   * 这样可以同时满足：
   * 1. 刷新页面后恢复上次选择的配置；
   * 2. 各配置的原始 JSON 都独立保留；
   * 3. 首次打开页面时，仍然支持项目级默认参数文件。
   *
   * 注意这里缓存的是“原始 JSON 文本”，而不仅是 parse 后的对象：
   * 用户可能正在编辑一个暂时不合法的 JSON，这种草稿也必须保住。
   *
   * Load default parameters from /default-params.json on first mount.
   * This file lives in public/ and users can edit it to set their own
   * defaults for configurable and input fields. Saves users from having
   * to re-type the same JSON every session.
   *
   */
  const paramsLoadedRef = useRef(false);
  useEffect(() => {
    if (paramsLoadedRef.current) return;
    const cachedProfileStore =
      typeof window !== "undefined"
        ? parseParamsProfileStore(
            window.localStorage.getItem(PARAMS_PROFILES_STORAGE_KEY),
          )
        : null;
    if (cachedProfileStore) {
      setParamsProfileStore(cachedProfileStore);
      setParamsLoaded(true);
      paramsLoadedRef.current = true;
      return;
    }

    const legacyDraft =
      typeof window !== "undefined"
        ? parseStoredParamsDraft(
            window.localStorage.getItem(LEGACY_PARAMS_STORAGE_KEY),
          )
        : null;
    if (legacyDraft) {
      setParamsProfileStore(
        migrateStoredParamsDraft({
          legacyDraft,
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        }),
      );
      setParamsLoaded(true);
      paramsLoadedRef.current = true;
      return;
    }

    fetch("/default-params.json")
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        const configurable =
          data?.configurable &&
          typeof data.configurable === "object" &&
          !Array.isArray(data.configurable)
            ? data.configurable
            : null;
        const input =
          data?.input &&
          typeof data.input === "object" &&
          !Array.isArray(data.input)
            ? data.input
            : null;
        setParamsProfileStore(
          createInitialParamsProfileStore({
            defaults: { configurable, input },
            id: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
          }),
        );
      })
      .catch(() => {
        setParamsProfileStore(
          createInitialParamsProfileStore({
            defaults: null,
            id: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
          }),
        );
      })
      .finally(() => {
        setParamsLoaded(true);
      });
    paramsLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !paramsProfileStore) {
      return;
    }

    window.localStorage.setItem(
      PARAMS_PROFILES_STORAGE_KEY,
      serializeParamsProfileStore(paramsProfileStore),
    );
    window.localStorage.removeItem(LEGACY_PARAMS_STORAGE_KEY);
  }, [paramsProfileStore]);

  const activeParamsProfile = paramsProfileStore
    ? getActiveParamsProfile(paramsProfileStore)
    : null;
  const customParams: CustomParams = activeParamsProfile
    ? buildStoredParamsDraft(activeParamsProfile)
    : { configurable: null, input: null };

  const updateActiveParamsProfile = (texts: {
    configurableText: string;
    inputText: string;
  }) => {
    setParamsProfileStore((current) =>
      current
        ? updateStoredParamsProfile(current, texts, new Date().toISOString())
        : current,
    );
  };

  const createParamsProfileFromPanel = (args: {
    name: string;
    mode: "copy" | "empty";
  }) => {
    setParamsProfileStore((current) => {
      if (!current) return current;
      const source =
        args.mode === "copy" ? getActiveParamsProfile(current) : null;
      return appendAndSelectParamsProfile(
        current,
        createParamsProfile({
          id: crypto.randomUUID(),
          name: args.name,
          configurableText: source?.configurableText,
          inputText: source?.inputText,
          updatedAt: new Date().toISOString(),
        }),
      );
    });
  };

  const renameActiveParamsProfileFromPanel = (name: string) => {
    setParamsProfileStore((current) =>
      current
        ? renameActiveParamsProfile(current, name, new Date().toISOString())
        : current,
    );
  };

  const deleteActiveParamsProfileFromPanel = () => {
    setParamsProfileStore((current) => {
      if (!current) return current;
      const remaining = deleteActiveParamsProfile(current);
      return (
        remaining ??
        createInitialParamsProfileStore({
          defaults: null,
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        })
      );
    });
  };

  const lastError = useRef<string | undefined>(undefined);

  const setThreadId = (id: string | null) => {
    _setThreadId(id);

    // close artifact and reset artifact context
    closeArtifact();
    setArtifactContext({});
  };

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream.error as any).message;
      if (!message || lastError.current === message) {
        // Message has already been logged. do not modify ref, return early.
        return;
      }

      // Message is defined, and it has not been logged yet. Save it, and send the error
      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  // TODO: this should be part of the useStream hook
  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((input.trim().length === 0 && contentBlocks.length === 0) || isLoading)
      return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(input.trim().length > 0 ? [{ type: "text", text: input }] : []),
        ...contentBlocks,
      ] as Message["content"],
    };

    const toolMessages = ensureToolCallsHaveResponses(messages);

    const context =
      Object.keys(artifactContext).length > 0 ? artifactContext : undefined;

    // Build submit payload with custom input params.
    // customParams.input is merged into the state object (alongside messages),
    // so additional graph state fields like user_name, language, etc. are
    // accessible in the graph's input.
    const submitPayload: Record<string, unknown> = {
      messages: [...toolMessages, newHumanMessage],
      context,
    };
    if (customParams.input) {
      Object.assign(submitPayload, customParams.input);
    }

    const submitOptions: Record<string, unknown> = {
      streamMode: ["values", "custom"],
      streamSubgraphs: true,
      streamResumable: true,
      optimisticValues: (prev: StateType) => ({
        ...prev,
        ...(customParams.input || {}),
        context,
        messages: [
          ...(prev.messages ?? []),
          ...toolMessages,
          newHumanMessage,
        ],
      }),
    };
    submitOptions.config = buildSubmitConfig(customParams.configurable);

    stream.submit(
      submitPayload as { messages: Message[]; context?: Record<string, unknown> },
      submitOptions as Parameters<typeof stream.submit>[1],
    );

    setInput("");
    setContentBlocks([]);
  };

  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    // Do this so the loading state is correct
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    const options: Record<string, unknown> = {
      checkpoint: parentCheckpoint,
      streamMode: ["values", "custom"],
      streamSubgraphs: true,
      streamResumable: true,
    };
    options.config = buildSubmitConfig(customParams.configurable);
    stream.submit(undefined, options as Parameters<typeof stream.submit>[1]);
  };

  const chatStarted = !!threadId || !!messages.length;
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <div className="relative hidden lg:flex">
        <motion.div
          className="absolute z-20 h-full overflow-hidden border-r bg-white"
          style={{ width: 300 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -300 }
              : { x: chatHistoryOpen ? 0 : -300 }
          }
          initial={{ x: -300 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div
            className="relative h-full"
            style={{ width: 300 }}
          >
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      <div
        className={cn(
          "grid w-full grid-cols-[1fr_0fr] transition-all duration-500",
          artifactOpen && "grid-cols-[3fr_2fr]",
        )}
      >
        <motion.div
          className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-hidden",
            !chatStarted && "grid-rows-[1fr]",
          )}
          layout={isLargeScreen}
          animate={{
            marginLeft: chatHistoryOpen ? (isLargeScreen ? 300 : 0) : 0,
            width: chatHistoryOpen
              ? isLargeScreen
                ? "calc(100% - 300px)"
                : "100%"
              : "100%",
          }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <ThreadWorkbench
            apiUrl={apiUrl}
            apiKey={apiKey}
            authScheme={authScheme}
            threadId={threadId}
            threadState={stateValues ?? null}
            chatStarted={chatStarted}
            isLargeScreen={isLargeScreen}
          />
          {!chatStarted && (
            <div className="absolute top-0 left-0 z-10 flex w-full items-center justify-between gap-3 p-2 pl-4">
              <div className="flex items-center gap-2">
                {(!chatHistoryOpen || !isLargeScreen) && (
                  <Button
                    className="hover:bg-gray-100"
                    variant="ghost"
                    onClick={() => setChatHistoryOpen((p) => !p)}
                  >
                    {chatHistoryOpen ? (
                      <PanelRightOpen className="size-5" />
                    ) : (
                      <PanelRightClose className="size-5" />
                    )}
                  </Button>
                )}
                <AssistantSelector />
              </div>
              <div className="absolute top-2 right-4 flex items-center gap-2">
                <TooltipIconButton
                  tooltip="Deployment settings"
                  variant="ghost"
                  onClick={() => setShowConfig(true)}
                >
                  <Settings className="size-5" />
                </TooltipIconButton>
                <OpenGitHubRepo />
              </div>
            </div>
          )}
          {chatStarted && (
            <div className="relative z-10 flex items-center justify-between gap-3 p-2">
              <div className="relative flex items-center justify-start gap-2">
                <div className="absolute left-0 z-10">
                  {(!chatHistoryOpen || !isLargeScreen) && (
                    <Button
                      className="hover:bg-gray-100"
                      variant="ghost"
                      onClick={() => setChatHistoryOpen((p) => !p)}
                    >
                      {chatHistoryOpen ? (
                        <PanelRightOpen className="size-5" />
                      ) : (
                        <PanelRightClose className="size-5" />
                      )}
                    </Button>
                  )}
                </div>
                <motion.button
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => setThreadId(null)}
                  animate={{
                    marginLeft: !chatHistoryOpen ? 48 : 0,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <LangGraphLogoSVG
                    width={32}
                    height={32}
                  />
                  <span className="text-xl font-semibold tracking-tight">
                    Agent Chat
                  </span>
                </motion.button>
                {/* Assistant selector: auto-fetches from server, auto-selects
                    first one. Users can switch anytime via the dropdown. */}
                <div className="ml-2">
                  <AssistantSelector />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  {/* Settings button: opens the deployment URL form (showConfig overlay)
                      so users can change the server URL without clearing query params. */}
                  <TooltipIconButton
                    size="lg"
                    className="p-4"
                    tooltip="Deployment settings"
                    variant="ghost"
                    onClick={() => setShowConfig(true)}
                  >
                    <Settings className="size-5" />
                  </TooltipIconButton>
                  <OpenGitHubRepo />
                </div>
                <TooltipIconButton
                  size="lg"
                  className="p-4"
                  tooltip="New thread"
                  variant="ghost"
                  onClick={() => setThreadId(null)}
                >
                  <SquarePen className="size-5" />
                </TooltipIconButton>
              </div>

              <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b" />
            </div>
          )}

          <StickToBottom className="relative flex-1 overflow-hidden">
            <StickyToBottomContent
              className={cn(
                "absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
                !chatStarted && "mt-[25vh] flex flex-col items-stretch",
                chatStarted && "grid grid-rows-[1fr_auto]",
              )}
              contentClassName="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full"
              content={
                <>
                  {transcriptLayout.beforeThinking.map((block, index) => {
                    if (block.kind === "human") {
                      return (
                        <div
                          key={block.message.id || `human-${index}`}
                          className="flex flex-col gap-4"
                        >
                          <HumanMessage
                            message={block.message}
                            isLoading={isLoading}
                          />
                          {(historicalThinkingTraceMap[block.message.id ?? ""] ?? []).map(
                            (thinkingCard) => (
                              <ThinkingTraceCard
                                key={thinkingCard.uiId}
                                snapshot={thinkingCard.snapshot}
                                isLoading={false}
                                analyticsEvents={
                                  telemetryEventsByRunId[thinkingCard.runId] ?? []
                                }
                                runtimeTraceEntries={
                                  runtimeTraceEntriesByRunId[thinkingCard.runId] ?? []
                                }
                              />
                            ),
                          )}
                        </div>
                      );
                    }

                    return (
                        <AssistantMessage
                          key={block.message.id || `assistant-${index}`}
                          message={block.message}
                          isLoading={isLoading}
                          handleRegenerate={handleRegenerate}
                          ui={protectedUi}
                        />
                    );
                  })}
                  {thinkingDisplay.snapshot ? (
                    <ThinkingTraceCard
                      snapshot={thinkingDisplay.snapshot}
                      runBucket={thinkingDisplay.runBucket}
                      isLoading={isLoading}
                      analyticsEvents={
                        thinkingDisplay.runId
                          ? telemetryEventsByRunId[thinkingDisplay.runId] ?? []
                          : []
                      }
                      runtimeTraceEntries={
                        thinkingDisplay.runId
                          ? runtimeTraceEntriesByRunId[thinkingDisplay.runId] ?? []
                          : []
                      }
                    />
                  ) : null}
                  {transcriptLayout.afterThinking.map((block, index) => {
                    if (block.kind === "human") {
                      return (
                        <HumanMessage
                          key={block.message.id || `human-tail-${index}`}
                          message={block.message}
                          isLoading={isLoading}
                        />
                      );
                    }

                    return (
                      <AssistantMessage
                        key={block.message.id || `assistant-tail-${index}`}
                        message={block.message}
                        isLoading={isLoading}
                        handleRegenerate={handleRegenerate}
                        ui={protectedUi}
                      />
                    );
                  })}
                  <PendingInterruptCard
                    interrupt={interrupt}
                  />
                  {isLoading && !firstTokenReceived && (
                    <AssistantMessageLoading />
                  )}
                </>
              }
              footer={
                <div className="sticky bottom-0 flex flex-col items-center gap-8 bg-white">
                  {!chatStarted && (
                    <div className="flex items-center gap-3">
                      <LangGraphLogoSVG className="h-8 flex-shrink-0" />
                      <h1 className="text-2xl font-semibold tracking-tight">
                        Agent Chat
                      </h1>
                    </div>
                  )}

                  <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2" />

                  {paramsLoaded && activeParamsProfile && paramsProfileStore ? (
                    <ParamsPanel
                      profile={activeParamsProfile}
                      profiles={paramsProfileStore.profiles}
                      onSelectProfile={(profileId) =>
                        setParamsProfileStore((current) =>
                          current
                            ? selectParamsProfile(current, profileId)
                            : current,
                        )
                      }
                      onUpdateProfile={updateActiveParamsProfile}
                      onCreateProfile={createParamsProfileFromPanel}
                      onRenameProfile={renameActiveParamsProfileFromPanel}
                      onDeleteProfile={deleteActiveParamsProfileFromPanel}
                    />
                  ) : null}

                  <div
                    ref={dropRef}
                    className={cn(
                      "bg-muted relative z-10 mx-auto mb-8 w-full max-w-3xl rounded-2xl shadow-xs transition-all",
                      dragOver
                        ? "border-primary border-2 border-dotted"
                        : "border border-solid",
                    )}
                  >
                    <form
                      onSubmit={handleSubmit}
                      className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2"
                    >
                      <ContentBlocksPreview
                        blocks={contentBlocks}
                        onRemove={removeBlock}
                      />
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.metaKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            const el = e.target as HTMLElement | undefined;
                            const form = el?.closest("form");
                            form?.requestSubmit();
                          }
                        }}
                        placeholder="Type your message..."
                        className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                      />

                      <div className="flex items-center gap-6 p-2 pt-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="render-tool-calls"
                              checked={hideToolCalls ?? false}
                              onCheckedChange={setHideToolCalls}
                            />
                            <Label
                              htmlFor="render-tool-calls"
                              className="text-sm text-gray-600"
                            >
                              Hide Tool Calls
                            </Label>
                          </div>
                        </div>
                        <Label
                          htmlFor="file-input"
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <Plus className="size-5 text-gray-600" />
                          <span className="text-sm text-gray-600">
                            Upload PDF or Image
                          </span>
                        </Label>
                        <input
                          id="file-input"
                          type="file"
                          onChange={handleFileUpload}
                          multiple
                          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                          className="hidden"
                        />
                        {stream.isLoading ? (
                          <Button
                            key="stop"
                            onClick={() => stream.stop()}
                            className="ml-auto"
                          >
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            className="ml-auto shadow-md transition-all"
                            disabled={
                              isLoading ||
                              (!input.trim() && contentBlocks.length === 0)
                            }
                          >
                            Send
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              }
            />
          </StickToBottom>
        </motion.div>
        <div className="relative flex flex-col border-l">
          <div className="absolute inset-0 flex min-w-[30vw] flex-col">
            <div className="grid grid-cols-[1fr_auto] border-b p-4">
              <ArtifactTitle className="truncate overflow-hidden" />
              <button
                onClick={closeArtifact}
                className="cursor-pointer"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <ArtifactContent className="relative flex-grow" />
          </div>
        </div>
      </div>
    </div>
  );
}
