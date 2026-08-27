"use client";

import { Database } from "lucide-react";
import { collapseAllNested, darkStyles, JsonView } from "react-json-view-lite";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ThreadStateSheet({
  state,
  threadId,
}: {
  state: unknown;
  threadId?: string | null;
}) {
  const jsonData =
    state && typeof state === "object" ? state : { value: state ?? null };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-slate-500"
        >
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
            <div className="max-h-full overflow-auto overscroll-y-auto font-mono text-xs leading-6 select-text">
              <JsonView
                aria-label="Current State JSON"
                data={jsonData}
                shouldExpandNode={collapseAllNested}
                style={{
                  ...darkStyles,
                  childFieldsContainer: `${darkStyles.childFieldsContainer} ml-4`,
                  container: `${darkStyles.container} p-4 pb-8`,
                  quotesForFieldNames: true,
                  stringifyStringValues: true,
                }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
