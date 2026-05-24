"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Send, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Avatar } from "@/components/Avatar";
import { renderBody, serializeMentions } from "@/lib/commentFormatting";
import { useMentionAutocomplete } from "@/hooks/useMentionAutocomplete";
import type { CommentThread } from "@/lib/commentThreads";
import type { Comment } from "@/lib/types";

interface CommentBubbleProps {
  thread: CommentThread;
  documentId: string;
  isActive: boolean;
  onActivate: () => void;
  onMutate: () => void;
  className?: string;
}

export default function CommentBubble({
  thread,
  documentId,
  isActive,
  onActivate,
  onMutate,
  className,
}: CommentBubbleProps) {
  const t = useTranslations();
  const { data: me } = useMe();
  const { root, replies } = thread;
  const resolved = root.is_resolved;

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);

  const {
    textareaRef,
    mentionQuery,
    highlightIdx,
    setHighlightIdx,
    directoryUsers,
    pickedMentions,
    updateMentionState,
    pickMention,
    handleMentionKeyDown,
    resetMentions,
  } = useMentionAutocomplete();

  const suggestions = useMemo(
    () => directoryUsers.slice(0, 6),
    [directoryUsers],
  );

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [replyBody, textareaRef]);

  const canDelete = (c: Comment) =>
    !!me && (c.user_id === me.id || me.role === "admin");

  async function handleResolve() {
    const endpoint = resolved ? "unresolve" : "resolve";
    await api.post(
      `/documents/${documentId}/comments/${root.id}/${endpoint}`,
    );
    onMutate();
  }

  async function handleDelete(commentId: string) {
    if (!window.confirm(t("comments.deleteConfirm"))) return;
    await api.delete(`/documents/${documentId}/comments/${commentId}`);
    onMutate();
  }

  async function submitReply() {
    const trimmed = replyBody.trim();
    if (!trimmed) return;
    const serialized = serializeMentions(trimmed, pickedMentions);
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/comments`, {
        body: serialized,
        parent_id: root.id,
      });
      setReplyBody("");
      resetMentions();
      setReplyOpen(false);
      onMutate();
    } finally {
      setBusy(false);
    }
  }

  // Container styles based on resolved state
  const containerClasses = resolved
    ? "bg-[#f9f9f9] border border-[#ddd] border-l-[3px] border-l-[#ccc] opacity-50"
    : "bg-[#fffbeb] border border-[#fde68a] border-l-[3px] border-l-[#facc15]";

  const activeClasses = isActive ? "ring-2 ring-yellow-400 shadow-md" : "";

  return (
    <div
      className={`group/bubble rounded-[6px] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)] p-[10px] text-[11px] cursor-pointer transition-shadow ${containerClasses} ${activeClasses} ${className ?? ""}`}
      onClick={onActivate}
    >
      {/* Root comment */}
      <div className="relative">
        {/* Action buttons — visible on group hover */}
        <div className="absolute top-0 right-0 flex items-center gap-0.5 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
          {/* Resolve / Reopen */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleResolve();
            }}
            className={`p-0.5 rounded ${
              resolved
                ? "text-gray-400 hover:text-brand"
                : "text-gray-400 hover:text-green-600"
            }`}
            title={resolved ? t("margin.unresolve") : t("margin.resolve")}
            aria-label={resolved ? t("margin.unresolve") : t("margin.resolve")}
          >
            <CheckCircle2 className="w-3 h-3" />
          </button>

          {/* Delete root comment */}
          {canDelete(root) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(root.id);
              }}
              className="text-gray-400 hover:text-red-500 p-0.5 rounded"
              title={t("common.delete")}
              aria-label={t("common.delete")}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Root comment header */}
        <div className="flex items-center gap-1.5 pr-12">
          <Avatar
            user={root.author}
            size="xs"
          />
          <span className="font-semibold text-[11px] text-[#333] truncate">
            {root.author.full_name}
          </span>
          <time
            className="text-[9px] text-[#999] ml-auto flex-shrink-0"
            title={new Date(root.created_at).toLocaleString()}
            dateTime={root.created_at}
          >
            {formatShortTime(root.created_at)}
          </time>
        </div>

        {/* Resolved badge */}
        {resolved && (
          <span className="inline-flex items-center gap-0.5 mt-1 text-[9px] text-green-500 font-medium">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {t("margin.resolved")}
          </span>
        )}

        {/* Root comment body */}
        <p className="text-[#555] leading-[1.5] mt-[6px] whitespace-pre-wrap break-words">
          {renderBody(root.body)}
        </p>
      </div>

      {/* Replies */}
      {replies.map((reply) => (
        <div
          key={reply.id}
          className="border-t border-[#fde68a] mt-2 pt-2 relative group/reply"
        >
          {/* Reply delete button */}
          {canDelete(reply) && (
            <div className="absolute top-2 right-0 opacity-0 group-hover/reply:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(reply.id);
                }}
                className="text-gray-400 hover:text-red-500 p-0.5 rounded"
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 pr-6">
            <Avatar
              user={reply.author}
              size="xs"
              className="!w-[18px] !h-[18px]"
            />
            <span className="font-semibold text-[10px] text-[#333] truncate">
              {reply.author.full_name}
            </span>
            <time
              className="text-[9px] text-[#999] ml-auto flex-shrink-0"
              title={new Date(reply.created_at).toLocaleString()}
              dateTime={reply.created_at}
            >
              {formatShortTime(reply.created_at)}
            </time>
          </div>
          <p className="text-[10px] text-[#555] leading-[1.5] mt-1 whitespace-pre-wrap break-words">
            {renderBody(reply.body)}
          </p>
        </div>
      ))}

      {/* Inline reply input */}
      <div
        className="mt-2 pt-2 border-t border-[#fde68a]"
        onClick={(e) => e.stopPropagation()}
      >
        {!replyOpen ? (
          <button
            onClick={() => {
              setReplyOpen(true);
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
            className="w-full text-left text-[10px] text-[#999] px-2 py-1 rounded bg-white/50 hover:bg-white/80 border border-transparent hover:border-[#fde68a] transition-colors"
          >
            {t("margin.reply")}
          </button>
        ) : (
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={replyBody}
              onChange={(e) => {
                setReplyBody(e.target.value);
                updateMentionState(
                  e.target.value,
                  e.target.selectionStart ?? 0,
                );
              }}
              onClick={(e) => {
                const target = e.target as HTMLTextAreaElement;
                updateMentionState(replyBody, target.selectionStart ?? 0);
              }}
              onKeyDown={(e) => {
                if (handleMentionKeyDown(e, replyBody, setReplyBody)) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitReply();
                }
                if (e.key === "Escape") {
                  setReplyOpen(false);
                  setReplyBody("");
                  resetMentions();
                }
              }}
              placeholder={t("margin.reply")}
              rows={2}
              className="w-full resize-none bg-white rounded border border-[#fde68a] px-2 py-1.5 text-[10px] leading-[1.5] text-[#333] outline-none focus:border-yellow-400 placeholder:text-[#bbb]"
              style={{ minHeight: 44 }}
            />
            <div className="flex items-center justify-end gap-1 mt-1">
              <button
                onClick={() => {
                  setReplyOpen(false);
                  setReplyBody("");
                  resetMentions();
                }}
                className="px-2 py-0.5 text-[9px] text-[#999] hover:text-[#555] rounded"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={busy || !replyBody.trim()}
                onClick={submitReply}
                className="px-2 py-0.5 rounded bg-[#facc15] hover:bg-[#eab308] disabled:opacity-40 text-[9px] text-[#333] font-medium inline-flex items-center gap-1"
              >
                <Send className="w-2.5 h-2.5" />
                {t("comments.send")}
              </button>
            </div>

            {/* Mention autocomplete dropdown */}
            {mentionQuery !== null && suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-full max-w-[220px] bg-white border border-[#fde68a] rounded shadow-lg z-20 max-h-[160px] overflow-y-auto">
                {suggestions.map((u, idx) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(u, replyBody, setReplyBody);
                    }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`w-full text-left px-2 py-1 text-[10px] flex items-center gap-1.5 ${
                      idx === highlightIdx
                        ? "bg-[#fffbeb] text-[#333]"
                        : "hover:bg-[#fffbeb]/50"
                    }`}
                  >
                    <Avatar
                      user={{
                        id: u.id,
                        full_name: u.full_name,
                        avatar_url: null,
                        updated_at: "",
                      }}
                      size="xs"
                      className="!w-[16px] !h-[16px]"
                    />
                    <span className="truncate font-medium">
                      {u.full_name}
                    </span>
                    <span className="text-[#999] text-[9px] truncate">
                      {u.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format a timestamp as a compact time string for the margin bubble.
 * Shows time-only for today, or short date+time otherwise.
 */
function formatShortTime(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
