import { useRef, useEffect } from "react";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { useQueryState, parseAsBoolean } from "nuqs";
import {
  LoadExternalComponent,
  type UIMessage,
} from "@langchain/langgraph-sdk/react-ui";

import { useStreamContext } from "@/providers/Stream";
import { getContentString } from "../utils";
import { BranchSwitcher, CommandBar } from "./shared";
import { MarkdownText } from "../markdown-text";
import { cn } from "@/lib/utils";
import { useArtifact } from "../artifact";
import { clientComponents } from "../generative-ui/component-map";
import {
  GenerativeComponentShell,
  GenericUIFallback,
} from "../generative-ui/component-shell";
import { getMessageBoundUiMessages } from "../message-bound-ui";
import type { StateType } from "@/providers/Stream";

/**
 * Per-message timing tracker for the final answer.
 *
 * 注意：
 * 现在 thinking/tool/interrupt 已经迁移到独立过程卡，这里只负责正式 transcript。
 * 计时也只服务于最终回答的 command bar，不再承担过程轨迹的生命周期管理。
 */
const messageTiming = new Map<
  string,
  {
    startTime: number;
    endTime: number | null;
  }
>();

function useAnswerTiming(
  messageId: string | undefined,
  isStreaming: boolean,
): number | null {
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!messageId) return;

    if (isStreaming && !recordedRef.current) {
      if (!messageTiming.has(messageId)) {
        messageTiming.set(messageId, {
          startTime: Date.now(),
          endTime: null,
        });
      }
      recordedRef.current = true;
      return;
    }

    if (!isStreaming && recordedRef.current) {
      const current = messageTiming.get(messageId);
      if (current && current.endTime === null) {
        current.endTime = Date.now();
      }
    }
  }, [messageId, isStreaming]);

  if (!messageId) return null;
  const timing = messageTiming.get(messageId);
  if (!timing) return null;

  const endTime = timing.endTime ?? Date.now();
  return endTime - timing.startTime;
}

function MessageBoundCard({
  message,
  ui,
}: {
  message: Message;
  ui?: UIMessage[];
}) {
  const thread = useStreamContext();
  const artifact = useArtifact();
  // 优先用传入的 protectedUi（防 child 空快照挤掉 UI 帧），否则回退到 SDK 原始 values.ui。
  const uiSource = ui ?? ((thread.values as StateType | undefined)?.ui ?? []);
  const uiMessages = getMessageBoundUiMessages(uiSource as UIMessage[], message);

  if (uiMessages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {uiMessages.map((uiMessage) => {
        const componentName =
          typeof uiMessage.name === "string" ? uiMessage.name : "";
        if (componentName in clientComponents) {
          return (
            <LoadExternalComponent
              key={uiMessage.id}
              stream={thread as Parameters<typeof LoadExternalComponent>[0]["stream"]}
              message={uiMessage}
              meta={{ ui: uiMessage, artifact }}
              components={clientComponents}
            />
          );
        }

        return (
          <GenerativeComponentShell
            key={uiMessage.id}
            title={componentName || "Generated UI"}
          >
            <GenericUIFallback value={uiMessage.props ?? uiMessage} />
          </GenerativeComponentShell>
        );
      })}
    </div>
  );
}

export function AssistantMessage({
  message,
  isLoading,
  handleRegenerate,
  ui,
}: {
  message: Message;
  isLoading: boolean;
  handleRegenerate: (parentCheckpoint: Checkpoint | null | undefined) => void;
  ui?: UIMessage[];
}) {
  const thread = useStreamContext();
  const threadValues = thread.values as StateType | undefined;
  const threadMessages = Array.isArray(threadValues?.messages)
    ? threadValues.messages
    : [];
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );
  const meta = thread.getMessagesMetadata(message);
  const isLastMessage =
    threadMessages[threadMessages.length - 1]?.id === message.id;
  const isCurrentMessageStreaming = isLoading && isLastMessage;
  const duration = useAnswerTiming(message.id, isCurrentMessageStreaming);
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  const contentString = getContentString(message.content);

  // 正式 transcript 区不再承担 tool result 的研发态展示；
  // 用户显式要求隐藏工具调用时，这里保持和历史行为一致。
  if (message.type === "tool" && hideToolCalls) {
    return null;
  }

  return (
    <div className="group mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        {contentString.length > 0 ? (
          <div className="py-1">
            <MarkdownText>{contentString}</MarkdownText>
          </div>
        ) : null}

        <MessageBoundCard message={message} ui={ui} />

        <div
          className={cn(
            "mr-auto flex items-center gap-2 transition-opacity",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <BranchSwitcher
            branch={meta?.branch}
            branchOptions={meta?.branchOptions}
            onSelect={(branch) => thread.setBranch(branch)}
            isLoading={isLoading}
          />
          <CommandBar
            content={contentString}
            isLoading={isLoading}
            isAiMessage={true}
            handleRegenerate={() => handleRegenerate(parentCheckpoint)}
            duration={isCurrentMessageStreaming ? null : duration}
          />
        </div>
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
      </div>
    </div>
  );
}
