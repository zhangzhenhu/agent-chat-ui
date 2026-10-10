"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, Braces } from "lucide-react";
import { darkStyles, JsonView, collapseAllNested } from "react-json-view-lite";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TooltipIconButton } from "../tooltip-icon-button";

export function MessageMetadataSheet({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(metadata, null, 2);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <TooltipIconButton
          variant="ghost"
          tooltip="Message metadata"
        >
          <Braces />
        </TooltipIconButton>
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] w-[min(96vw,960px)] max-w-none min-w-[20rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle>Message metadata</DialogTitle>
          <div className="text-xs text-slate-500">additional_kwargs</div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#0b1020]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-300 uppercase">
                additional_kwargs JSON
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckIcon className="size-3.5 text-emerald-400" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                <span>Copy JSON</span>
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-y-auto font-mono text-xs leading-6 select-text">
              <JsonView
                aria-label="Message metadata JSON"
                data={metadata}
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
