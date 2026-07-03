import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useThreads } from "@/providers/Thread";
import { Thread } from "@langchain/langgraph-sdk";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getThreadTitle } from "../utils";
import { useQueryState, parseAsBoolean } from "nuqs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  CheckSquare,
  Loader2,
  PanelRightOpen,
  PanelRightClose,
  Pencil,
  MoreHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { pruneSelectedThreadIds } from "./selection";

function ThreadList({
  threads,
  onThreadClick,
}: {
  threads: Thread[];
  onThreadClick?: (threadId: string) => void;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { renameThread, deleteThread, deleteThreads } = useThreads();

  // Inline-edit state for the Rename action. `editingId` is the thread being
  // edited; `editingValue` is the current input text. Null when not editing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // The title as it was before editing started, so we can detect a no-op save.
  const [editingOriginal, setEditingOriginal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Thread awaiting delete confirmation. Use a custom dialog instead of
  // window.confirm so it can never be silenced by the browser's "prevent this
  // page from creating additional dialogs" toggle (which makes window.confirm
  // silently return false and blocks deletion entirely).
  const [confirmDelete, setConfirmDelete] = useState<Thread | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Focus + select the input text when entering edit mode for a row.
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = pruneSelectedThreadIds(prev, threads);
      if (
        next.length === prev.length &&
        next.every((threadId, index) => threadId === prev[index])
      ) {
        return prev;
      }
      return next;
    });
  }, [threads]);

  const allThreadsSelected =
    threads.length > 0 && selectedIds.length === threads.length;

  const startRename = (t: Thread) => {
    const title = getThreadTitle(t);
    setEditingId(t.thread_id);
    setEditingValue(title);
    setEditingOriginal(title);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingValue("");
    setEditingOriginal("");
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id],
    );
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editingValue.trim();
    // Empty input or no change → just exit edit mode without an API call.
    if (trimmed.length === 0 || trimmed === editingOriginal) {
      cancelRename();
      return;
    }
    const id = editingId;
    try {
      await renameThread(id, trimmed);
      toast.success("已重命名");
      cancelRename();
    } catch (err) {
      console.error("Failed to rename thread", err);
      // Keep the input open so the user can retry without retyping.
      toast.error("重命名失败", {
        description: err instanceof Error ? err.message : undefined,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    }
  };

  // Open the custom confirm dialog for a thread (does not delete yet).
  const handleDelete = (t: Thread) => {
    if (editingId === t.thread_id) cancelRename();
    setConfirmDelete(t);
  };

  // Actually delete the thread after the user confirms in the dialog.
  const confirmDeleteThread = async () => {
    const t = confirmDelete;
    if (!t) return;
    setDeleting(true);
    try {
      await deleteThread(t.thread_id);
      // If the deleted thread was the active one, reset the chat pane.
      if (t.thread_id === threadId) setThreadId(null);
      toast.success("已删除");
      setConfirmDelete(null);
    } catch (err) {
      console.error("Failed to delete thread", err);
      toast.error("删除失败", {
        description: err instanceof Error ? err.message : undefined,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteSelectedThreads = async () => {
    if (selectedIds.length === 0) {
      setConfirmBulkDelete(false);
      return;
    }

    setBulkDeleting(true);
    try {
      await deleteThreads(selectedIds);
      if (threadId && selectedIds.includes(threadId)) {
        setThreadId(null);
      }
      toast.success(`已删除 ${selectedIds.length} 条会话`);
      setConfirmBulkDelete(false);
      exitSelectionMode();
    } catch (err) {
      console.error("Failed to delete threads", err);
      toast.error("批量删除失败", {
        description: err instanceof Error ? err.message : undefined,
        richColors: true,
        closeButton: true,
        duration: 5000,
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <div className="flex w-full items-center justify-between gap-2 px-2 pb-1">
        <div className="text-xs font-medium text-slate-500">
          {selectionMode
            ? `已选择 ${selectedIds.length} 条`
            : `${threads.length} 条会话`}
        </div>
        <div className="flex items-center gap-1">
          {selectionMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-slate-600"
                onClick={() =>
                  setSelectedIds((prev) =>
                    allThreadsSelected
                      ? []
                      : threads.map((thread) => thread.thread_id),
                  )
                }
                disabled={threads.length === 0}
              >
                {allThreadsSelected ? (
                  <Square className="size-4" />
                ) : (
                  <CheckSquare className="size-4" />
                )}
                全选
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 px-2"
                disabled={selectedIds.length === 0}
                onClick={() => setConfirmBulkDelete(true)}
              >
                <Trash2 className="size-4" />
                删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={exitSelectionMode}
              >
                完成
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-600"
              onClick={() => {
                cancelRename();
                setSelectionMode(true);
              }}
            >
              <CheckSquare className="size-4" />
              批量管理
            </Button>
          )}
        </div>
      </div>

      <div className="flex h-full w-full flex-col items-start justify-start gap-2 overflow-y-scroll pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
        {threads.map((t) => {
          const isEditing = editingId === t.thread_id;
          const isActive = t.thread_id === threadId;
          const isSelected = selectedIds.includes(t.thread_id);
          const itemText = getThreadTitle(t);

          if (isEditing) {
            return (
              <div
                key={t.thread_id}
                className="flex w-full items-center gap-2 px-2"
              >
                <Input
                  ref={inputRef}
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  onBlur={() => void commitRename()}
                  className="h-8 flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="保存"
                  // Prevent the input from blurring (and committing) before the
                  // click handler runs.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void commitRename()}
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="取消"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelRename}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          }

          return (
            <div
              key={t.thread_id}
              className="group flex w-full items-center gap-2 px-2"
            >
              {selectionMode ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`size-8 shrink-0 ${isSelected ? "text-slate-900" : "text-slate-400"}`}
                  aria-label={isSelected ? "取消选择" : "选择会话"}
                  onClick={() => toggleSelection(t.thread_id)}
                >
                  {isSelected ? (
                    <CheckSquare className="size-4" />
                  ) : (
                    <Square className="size-4" />
                  )}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className={`min-w-0 flex-1 items-start justify-start truncate text-left font-normal ${isActive ? "bg-accent" : ""} ${selectionMode && isSelected ? "bg-slate-100" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (selectionMode) {
                    toggleSelection(t.thread_id);
                    return;
                  }
                  onThreadClick?.(t.thread_id);
                  if (t.thread_id === threadId) return;
                  setThreadId(t.thread_id);
                }}
              >
                <p className="truncate text-ellipsis">{itemText}</p>
              </Button>
              {selectionMode ? null : (
                <div className="flex w-10 shrink-0 justify-center pr-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                        aria-label="更多操作"
                        // Stop the click from also selecting the thread (row click).
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startRename(t)}>
                        <Pencil className="size-4" />
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        // Defer opening the confirm dialog to the next tick so the
                        // DropdownMenu can finish closing first. Opening a Dialog
                        // synchronously from a menu item's select races the menu's
                        // DismissableLayer/FocusScope against the Dialog's own
                        // layer, which can freeze the page (pointer-events stuck on
                        // body, no clicks/keys received).
                        onSelect={() => setTimeout(() => handleDelete(t), 0)}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (deleting) return; // don't allow closing mid-delete
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              确认删除此会话？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmDelete(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDeleteThread()}
            >
              {deleting ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmBulkDelete}
        onOpenChange={(open) => {
          if (bulkDeleting) return;
          setConfirmBulkDelete(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除会话</DialogTitle>
            <DialogDescription>
              确认删除已选择的 {selectedIds.length} 条会话？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={bulkDeleting}
              onClick={() => setConfirmBulkDelete(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={bulkDeleting || selectedIds.length === 0}
              onClick={() => void confirmDeleteSelectedThreads()}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  删除中…
                </>
              ) : (
                `删除 ${selectedIds.length} 条`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="flex h-full w-full flex-col items-start justify-start gap-2 overflow-y-scroll pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      {Array.from({ length: 30 }).map((_, i) => (
        <Skeleton
          key={`skeleton-${i}`}
          className="h-10 w-[272px]"
        />
      ))}
    </div>
  );
}

export default function ThreadHistory() {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  /**
   * Default to true (was false) so the thread list sidebar is visible by default.
   * Users can toggle it off with the panel button in the header.
   */
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(true),
  );

  const { getThreads, threads, setThreads, threadsLoading, setThreadsLoading } =
    useThreads();

  const [assistantId] = useQueryState("assistantId");

  /**
   * Re-fetch threads when assistantId changes (e.g. user switches
   * assistants via the dropdown). Previously this only ran on mount,
   * so switching assistants would show stale threads from the old one.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setThreadsLoading(true);
    getThreads()
      .then(setThreads)
      .catch(console.error)
      .finally(() => setThreadsLoading(false));
  }, [assistantId, getThreads, setThreads, setThreadsLoading]);

  return (
    <>
      <div className="shadow-inner-right hidden h-screen w-[300px] shrink-0 flex-col items-start justify-start gap-6 border-r-[1px] border-slate-300 lg:flex">
        <div className="flex w-full items-center justify-between px-4 pt-1.5">
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
          <h1 className="text-xl font-semibold tracking-tight">
            Thread History
          </h1>
        </div>
        {threadsLoading ? (
          <ThreadHistoryLoading />
        ) : (
          <ThreadList threads={threads} />
        )}
      </div>
      <div className="lg:hidden">
        <Sheet
          open={!!chatHistoryOpen && !isLargeScreen}
          onOpenChange={(open) => {
            if (isLargeScreen) return;
            setChatHistoryOpen(open);
          }}
        >
          <SheetContent
            side="left"
            className="flex lg:hidden"
          >
            <SheetHeader>
              <SheetTitle>Thread History</SheetTitle>
            </SheetHeader>
            <ThreadList
              threads={threads}
              onThreadClick={() => setChatHistoryOpen((o) => !o)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
