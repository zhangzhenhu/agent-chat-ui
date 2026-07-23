"use client";

import { useStreamContext } from "@langchain/langgraph-sdk/react-ui";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getInterruptResponseOptions } from "@/providers/interrupt-response";
import type { EventStreamV3Value } from "@/providers/use-event-stream-v3";

import { GenerativeComponentShell } from "./component-shell";

type ChoiceProps = {
  title?: string;
  description?: string;
  options?: Array<{ label?: string; value?: string }>;
  resume_mode?: string;
};

export function ChoiceUI(props: ChoiceProps) {
  const stream = useStreamContext() as unknown as EventStreamV3Value;
  const options = Array.isArray(props.options) ? props.options : [];
  const isCommandResumeChoice = props.resume_mode === "command";

  return (
    <GenerativeComponentShell
      title={props.title}
      description={props.description}
    >
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const value = option.value ?? option.label ?? `选项 ${index + 1}`;
          return (
            <Button
              key={`${value}:${index}`}
              variant="outline"
              onClick={async () => {
                // `resume_mode=command` 说明这张 choice 来自官方 interrupt/resume 链路；
                // 此时点击应恢复当前 run，而不是再追加一条新的普通 human message。
                if (isCommandResumeChoice) {
                  await stream.respond(
                    value,
                    getInterruptResponseOptions(stream.interrupt),
                  );
                  return;
                }
                // 兼容非阻塞 choice：仍按普通用户消息提交。
                await stream.submit({
                  messages: [{ type: "human", content: value }],
                });
              }}
              className={cn(
                "rounded-full px-4",
                isCommandResumeChoice &&
                  "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100",
              )}
            >
              {option.label ?? value}
            </Button>
          );
        })}
      </div>
    </GenerativeComponentShell>
  );
}
