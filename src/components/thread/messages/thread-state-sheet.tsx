"use client";

import { useMemo } from "react";
import { Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SyntaxHighlighter } from "@/components/thread/syntax-highlighter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatThreadState(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function ThreadStateSheet({
  state,
  threadId,
}: {
  state: unknown;
  threadId?: string | null;
}) {
  const formattedState = useMemo(() => formatThreadState(state), [state]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-500">
          <Database className="size-4" />
          <span className="ml-1">Thread State</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] w-[min(96vw,1280px)] max-w-none min-w-[20rem] resize flex-col gap-0 overflow-auto p-0 sm:min-w-[48rem]">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle>Thread State</DialogTitle>
          {threadId ? (
            <div className="text-xs text-slate-500">Thread: {threadId}</div>
          ) : null}
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#0b1020]">
            <div className="border-b border-white/10 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
              Current State JSON
            </div>
            <div className="max-h-full overflow-auto overscroll-contain text-xs leading-6">
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
                {formattedState}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
