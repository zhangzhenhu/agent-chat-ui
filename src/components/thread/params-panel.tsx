"use client";

import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { TooltipIconButton } from "./tooltip-icon-button";
import type { ParamsProfile } from "./params-storage";

export interface CustomParams {
  configurable: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
}

type ProfileDialogMode = "create" | "rename" | null;
type CreateMode = "copy" | "empty";

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
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className={cn(
            "w-full resize-none rounded-md border bg-white px-3 py-2 font-mono text-xs",
            "focus:ring-2 focus:ring-blue-500/50 focus:outline-none",
            error ? "border-red-400 focus:ring-red-500/50" : "border-gray-200",
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

function safeJsonParse(text: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  if (!text.trim()) return { value: null, error: null };
  try {
    const parsed = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { value: null, error: "Must be a JSON object" };
    }
    return { value: parsed, error: null };
  } catch (error) {
    return { value: null, error: (error as Error).message };
  }
}

interface ParamsPanelProps {
  profile: ParamsProfile;
  profiles: ParamsProfile[];
  onSelectProfile: (profileId: string) => void;
  onUpdateProfile: (
    texts: Pick<ParamsProfile, "configurableText" | "inputText">,
  ) => void;
  onCreateProfile: (args: { name: string; mode: CreateMode }) => void;
  onRenameProfile: (name: string) => void;
  onDeleteProfile: () => void;
}

export function ParamsPanel({
  profile,
  profiles,
  onSelectProfile,
  onUpdateProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
}: ParamsPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"configurable" | "input">(
    "configurable",
  );
  const [profileDialogMode, setProfileDialogMode] =
    useState<ProfileDialogMode>(null);
  const [profileName, setProfileName] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode>("copy");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const configurableParse = safeJsonParse(profile.configurableText);
  const inputParse = safeJsonParse(profile.inputText);
  const hasContent =
    profile.configurableText.trim() !== "" || profile.inputText.trim() !== "";
  const trimmedProfileName = profileName.trim();

  const openCreateDialog = () => {
    setProfileName(`${profile.name} copy`);
    setCreateMode("copy");
    setProfileDialogMode("create");
  };

  const openRenameDialog = () => {
    setProfileName(profile.name);
    setProfileDialogMode("rename");
  };

  const submitProfileDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedProfileName || !profileDialogMode) return;

    if (profileDialogMode === "create") {
      onCreateProfile({ name: trimmedProfileName, mode: createMode });
    } else {
      onRenameProfile(trimmedProfileName);
    }
    setProfileDialogMode(null);
  };

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
          className={cn("size-3 transition-transform", open && "rotate-180")}
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
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 max-w-52 min-w-0 justify-between gap-2"
                    >
                      <span className="truncate">{profile.name}</span>
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-w-64"
                  >
                    {profiles.map((candidate) => (
                      <DropdownMenuItem
                        key={candidate.id}
                        onSelect={() => onSelectProfile(candidate.id)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {candidate.name}
                        </span>
                        {candidate.id === profile.id && (
                          <Check className="size-3.5" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex shrink-0 items-center gap-0.5">
                  <TooltipIconButton
                    type="button"
                    tooltip="新建配置"
                    onClick={openCreateDialog}
                  >
                    <Plus className="size-3.5" />
                  </TooltipIconButton>
                  <TooltipIconButton
                    type="button"
                    tooltip="重命名配置"
                    onClick={openRenameDialog}
                  >
                    <Pencil className="size-3.5" />
                  </TooltipIconButton>
                  <TooltipIconButton
                    type="button"
                    tooltip="删除配置"
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="size-3.5" />
                  </TooltipIconButton>
                </div>
              </div>

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

              {activeTab === "configurable" ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Runtime config passed as <code>config.configurable</code>.
                    Accessible in your graph nodes via{" "}
                    <code>config.configurable</code>.
                  </p>
                  <JsonEditor
                    label="Configurable JSON"
                    value={profile.configurableText}
                    onChange={(configurableText) =>
                      onUpdateProfile({
                        configurableText,
                        inputText: profile.inputText,
                      })
                    }
                    error={configurableParse.error}
                    placeholder={`{"model": "openai", "temperature": 0.7}`}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Additional state fields merged into the graph input. These
                    are accessible in your graph's state.
                  </p>
                  <JsonEditor
                    label="Input JSON"
                    value={profile.inputText}
                    onChange={(inputText) =>
                      onUpdateProfile({
                        configurableText: profile.configurableText,
                        inputText,
                      })
                    }
                    error={inputParse.error}
                    placeholder={`{"user_name": "Alice", "language": "zh"}`}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        open={profileDialogMode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setProfileDialogMode(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {profileDialogMode === "create"
                ? "新建参数配置"
                : "重命名参数配置"}
            </DialogTitle>
            <DialogDescription>配置仅保存在当前浏览器中。</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submitProfileDialog}
            className="space-y-4"
          >
            <Input
              autoFocus
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="配置名称"
              aria-label="配置名称"
            />
            {profileDialogMode === "create" && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={createMode === "copy" ? "secondary" : "outline"}
                  onClick={() => setCreateMode("copy")}
                >
                  复制当前配置
                </Button>
                <Button
                  type="button"
                  variant={createMode === "empty" ? "secondary" : "outline"}
                  onClick={() => setCreateMode("empty")}
                >
                  空白配置
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={!trimmedProfileName}
              >
                {profileDialogMode === "create" ? "新建" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除参数配置</DialogTitle>
            <DialogDescription>
              确定删除“{profile.name}”吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onDeleteProfile();
                setDeleteDialogOpen(false);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
