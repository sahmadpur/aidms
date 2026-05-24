"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CheckCircle2,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Avatar } from "@/components/Avatar";
import { renderBody, serializeMentions } from "@/lib/commentFormatting";
import { useMentionAutocomplete } from "@/hooks/useMentionAutocomplete";
import type { CommentThread } from "@/lib/commentThreads";
import type { Comment } from "@/lib/types";

const COMPOSER_MAX = 4000;

interface CommentBottomSheetProps {
  documentId: string;
  thread: CommentThread | null;
  isCreating: boolean;
  creatingData?: {
    pageNumber: number;
    rects: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      pageWidth: number;
      pageHeight: number;
    }>;
    selectedText: string;
  };
  onClose: () => void;
  onMutate: () => void;
}

export default function CommentBottomSheet({
  documentId,
  thread,
  isCreating,
  creatingData,
  onClose,
  onMutate,
}: CommentBottomSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { data: me } = useMe();

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  const sheetRef = useRef<HTMLDivElement>(null);

  // Slide-in animation on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [body, textareaRef]);

  // Escape to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Lock body scroll while sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  async function submitCreate() {
    const trimmed = body.trim();
    if (!trimmed || !creatingData) return;
    const outbound = serializeMentions(trimmed, pickedMentions);
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/annotations`, {
        page_number: creatingData.pageNumber,
        highlight_rects: creatingData.rects,
        selected_text: creatingData.selectedText,
        comment_body: outbound,
      });
      setBody("");
      resetMentions();
      onMutate();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function submitReply() {
    const trimmed = body.trim();
    if (!trimmed || !replyingTo) return;
    const outbound = serializeMentions(trimmed, pickedMentions);
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/comments`, {
        body: outbound,
        parent_id: replyingTo.id,
      });
      setBody("");
      resetMentions();
      setReplyingTo(null);
      onMutate();
    } finally {
      setBusy(false);
    }
  }

  async function resolveComment(commentId: string) {
    await api.post(
      `/documents/${documentId}/comments/${commentId}/resolve`,
    );
    onMutate();
  }

  async function unresolveComment(commentId: string) {
    await api.post(
      `/documents/${documentId}/comments/${commentId}/unresolve`,
    );
    onMutate();
  }

  async function deleteComment(commentId: string) {
    if (!confirm(t("comments.deleteConfirm"))) return;
    await api.delete(`/documents/${documentId}/comments/${commentId}`);
    onMutate();
    // If deleting the root comment, close the sheet
    if (thread && commentId === thread.root.id) {
      onClose();
    }
  }

  function canDelete(c: Comment) {
    return !!me && (c.user_id === me.id || me.role === "admin");
  }

  function timeLabel(dateStr: string) {
    const d = new Date(dateStr);
    const isToday = new Date().toDateString() === d.toDateString();
    if (isToday) {
      return d.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  }

  const suggestions = directoryUsers.slice(0, 6);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleBackdropClick}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-50 bg-surface-card rounded-t-xl max-h-[70vh] overflow-hidden flex flex-col transition-transform duration-200 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {isCreating ? (
          <CreateMode
            body={body}
            setBody={setBody}
            busy={busy}
            selectedText={creatingData?.selectedText ?? ""}
            textareaRef={textareaRef}
            mentionQuery={mentionQuery}
            highlightIdx={highlightIdx}
            setHighlightIdx={setHighlightIdx}
            suggestions={suggestions}
            updateMentionState={updateMentionState}
            pickMention={pickMention}
            handleMentionKeyDown={handleMentionKeyDown}
            onSubmit={submitCreate}
            onClose={onClose}
            t={t}
          />
        ) : thread ? (
          <ViewMode
            thread={thread}
            me={me}
            locale={locale}
            body={body}
            setBody={setBody}
            busy={busy}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            textareaRef={textareaRef}
            mentionQuery={mentionQuery}
            highlightIdx={highlightIdx}
            setHighlightIdx={setHighlightIdx}
            suggestions={suggestions}
            updateMentionState={updateMentionState}
            pickMention={pickMention}
            handleMentionKeyDown={handleMentionKeyDown}
            onSubmitReply={submitReply}
            onResolve={resolveComment}
            onUnresolve={unresolveComment}
            onDelete={deleteComment}
            canDelete={canDelete}
            timeLabel={timeLabel}
            onClose={onClose}
            t={t}
          />
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Create mode                                                       */
/* ------------------------------------------------------------------ */

function CreateMode({
  body,
  setBody,
  busy,
  selectedText,
  textareaRef,
  mentionQuery,
  highlightIdx,
  setHighlightIdx,
  suggestions,
  updateMentionState,
  pickMention,
  handleMentionKeyDown,
  onSubmit,
  onClose,
  t,
}: {
  body: string;
  setBody: (v: string) => void;
  busy: boolean;
  selectedText: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  mentionQuery: string | null;
  highlightIdx: number;
  setHighlightIdx: (i: number) => void;
  suggestions: Array<{ id: string; full_name: string; email: string }>;
  updateMentionState: (value: string, caret: number) => void;
  pickMention: (
    user: { id: string; full_name: string; email: string },
    body: string,
    setBody: (v: string) => void,
  ) => void;
  handleMentionKeyDown: (
    e: React.KeyboardEvent,
    body: string,
    setBody: (v: string) => void,
  ) => boolean;
  onSubmit: () => void;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 border-b border-edge-soft">
        <span className="text-[13px] font-semibold text-ink">
          {t("annotation.addComment")}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded text-gray-500 hover:text-ink"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2">
        {/* Selected text quote */}
        {selectedText && (
          <div className="bg-[#fffbeb] border border-[#fde68a] rounded px-3 py-2 text-[12px] italic text-ink mb-3">
            {selectedText}
          </div>
        )}

        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              if (e.target.value.length > COMPOSER_MAX) return;
              setBody(e.target.value);
              updateMentionState(
                e.target.value,
                e.target.selectionStart ?? 0,
              );
            }}
            onClick={(e) => {
              const target = e.target as HTMLTextAreaElement;
              updateMentionState(body, target.selectionStart ?? 0);
            }}
            onKeyDown={(e) => {
              if (handleMentionKeyDown(e, body, setBody)) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder={t("margin.newComment")}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-[8px] border border-edge-chip bg-surface-card focus:border-edge-focus px-3 py-2.5 outline-none text-[13px] leading-[1.55] text-ink placeholder:text-gray-400"
            style={{ minHeight: 72 }}
          />

          {/* Mention autocomplete */}
          {mentionQuery !== null && suggestions.length > 0 && (
            <MentionPopover
              suggestions={suggestions}
              highlightIdx={highlightIdx}
              setHighlightIdx={setHighlightIdx}
              onPick={(u) => pickMention(u, body, setBody)}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-edge-soft flex items-center gap-2">
        <div className="flex-1" />
        {body.length > COMPOSER_MAX * 0.8 && (
          <span
            className={`text-[10.5px] tabular-nums ${
              body.length >= COMPOSER_MAX
                ? "text-dot-failed"
                : "text-ink-soft"
            }`}
          >
            {body.length} / {COMPOSER_MAX}
          </span>
        )}
        <button
          disabled={busy || !body.trim()}
          onClick={onSubmit}
          className="px-3 py-1.5 rounded-[6px] bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-40 disabled:hover:bg-brand text-[12px] font-medium inline-flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          {t("comments.send")}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  View mode (existing thread)                                       */
/* ------------------------------------------------------------------ */

function ViewMode({
  thread,
  me,
  locale,
  body,
  setBody,
  busy,
  replyingTo,
  setReplyingTo,
  textareaRef,
  mentionQuery,
  highlightIdx,
  setHighlightIdx,
  suggestions,
  updateMentionState,
  pickMention,
  handleMentionKeyDown,
  onSubmitReply,
  onResolve,
  onUnresolve,
  onDelete,
  canDelete,
  timeLabel,
  onClose,
  t,
}: {
  thread: CommentThread;
  me: { id: string; role: string; full_name: string } | undefined;
  locale: string;
  body: string;
  setBody: (v: string) => void;
  busy: boolean;
  replyingTo: { id: string; name: string } | null;
  setReplyingTo: (v: { id: string; name: string } | null) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  mentionQuery: string | null;
  highlightIdx: number;
  setHighlightIdx: (i: number) => void;
  suggestions: Array<{ id: string; full_name: string; email: string }>;
  updateMentionState: (value: string, caret: number) => void;
  pickMention: (
    user: { id: string; full_name: string; email: string },
    body: string,
    setBody: (v: string) => void,
  ) => void;
  handleMentionKeyDown: (
    e: React.KeyboardEvent,
    body: string,
    setBody: (v: string) => void,
  ) => boolean;
  onSubmitReply: () => void;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  canDelete: (c: Comment) => boolean;
  timeLabel: (dateStr: string) => string;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { root, replies } = thread;

  function startReply(parentId: string, authorName: string) {
    setReplyingTo({ id: parentId, name: authorName });
    textareaRef.current?.focus();
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2 border-b border-edge-soft">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">
            {t("comments.comment")}
          </span>
          {root.is_resolved && (
            <span className="px-1.5 py-px rounded-[3px] bg-green-100 text-green-700 text-[9.5px] uppercase tracking-wider font-medium inline-flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" />
              {t("margin.resolved")}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-gray-500 hover:text-ink"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Root comment */}
        <CommentItem
          comment={root}
          isRoot
          isMine={!!me && root.user_id === me.id}
          canDelete={canDelete(root)}
          timeLabel={timeLabel}
          onReply={() => startReply(root.id, root.author.full_name)}
          onResolve={() => onResolve(root.id)}
          onUnresolve={() => onUnresolve(root.id)}
          onDelete={() => onDelete(root.id)}
          t={t}
        />

        {/* Replies */}
        {replies.length > 0 && (
          <div className="pl-4 border-l-2 border-edge-soft space-y-3">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                isRoot={false}
                isMine={!!me && reply.user_id === me.id}
                canDelete={canDelete(reply)}
                timeLabel={timeLabel}
                onReply={() => startReply(root.id, reply.author.full_name)}
                onResolve={() => {}}
                onUnresolve={() => {}}
                onDelete={() => onDelete(reply.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reply composer */}
      <div className="border-t border-edge-soft px-4 py-3">
        <div className="relative">
          {/* Replying-to indicator */}
          {replyingTo && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-t-[8px] bg-surface-chipActive text-[11.5px] text-brand-deep">
              <Reply className="w-3 h-3 opacity-70" />
              <span className="truncate">
                {t("commentsPanel.replyingTo", {
                  name: replyingTo.name,
                })}
              </span>
              <button
                onClick={() => setReplyingTo(null)}
                className="ml-auto text-gray-500 hover:text-ink p-0.5 rounded flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => {
                if (e.target.value.length > COMPOSER_MAX) return;
                setBody(e.target.value);
                updateMentionState(
                  e.target.value,
                  e.target.selectionStart ?? 0,
                );
              }}
              onClick={(e) => {
                const target = e.target as HTMLTextAreaElement;
                updateMentionState(body, target.selectionStart ?? 0);
              }}
              onKeyDown={(e) => {
                if (handleMentionKeyDown(e, body, setBody)) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (!replyingTo) {
                    // Default reply to root if not already replying
                    setReplyingTo({
                      id: root.id,
                      name: root.author.full_name,
                    });
                  }
                  onSubmitReply();
                }
              }}
              onFocus={() => {
                // Auto-set replyingTo if not already set
                if (!replyingTo) {
                  setReplyingTo({
                    id: root.id,
                    name: root.author.full_name,
                  });
                }
              }}
              placeholder={t("margin.reply")}
              rows={1}
              className={`flex-1 resize-none rounded-[8px] border border-edge-chip bg-surface-card focus:border-edge-focus px-3 py-2 outline-none text-[13px] leading-[1.55] text-ink placeholder:text-gray-400 ${
                replyingTo ? "rounded-t-none border-t-0" : ""
              }`}
              style={{ minHeight: 36 }}
            />
            <button
              disabled={busy || !body.trim() || !replyingTo}
              onClick={onSubmitReply}
              className="p-2 rounded-[6px] bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-40 disabled:hover:bg-brand flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Mention autocomplete */}
          {mentionQuery !== null && suggestions.length > 0 && (
            <MentionPopover
              suggestions={suggestions}
              highlightIdx={highlightIdx}
              setHighlightIdx={setHighlightIdx}
              onPick={(u) => pickMention(u, body, setBody)}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Single comment item                                               */
/* ------------------------------------------------------------------ */

function CommentItem({
  comment,
  isRoot,
  isMine,
  canDelete,
  timeLabel,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
  t,
}: {
  comment: Comment;
  isRoot: boolean;
  isMine: boolean;
  canDelete: boolean;
  timeLabel: (dateStr: string) => string;
  onReply: () => void;
  onResolve: () => void;
  onUnresolve: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex gap-2.5">
      <Avatar
        user={{
          id: comment.author.id,
          full_name: comment.author.full_name,
          avatar_url: comment.author.avatar_url,
          updated_at: comment.author.updated_at,
        }}
        size="sm"
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-ink text-[12.5px]">
            {comment.author.full_name}
          </span>
          <time
            className="text-[11px] text-gray-500"
            title={new Date(comment.created_at).toLocaleString()}
            dateTime={comment.created_at}
          >
            {timeLabel(comment.created_at)}
          </time>
        </div>
        <p className="mt-0.5 text-[13px] leading-[1.55] text-ink whitespace-pre-wrap break-words">
          {renderBody(comment.body)}
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={onReply}
            className="text-gray-500 hover:text-brand text-[11px] inline-flex items-center gap-1"
          >
            <Reply className="w-3 h-3" />
            {t("margin.reply")}
          </button>

          {isRoot && !comment.is_resolved && (
            <button
              onClick={onResolve}
              className="text-gray-500 hover:text-green-600 text-[11px] inline-flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              {t("margin.resolve")}
            </button>
          )}

          {isRoot && comment.is_resolved && (
            <button
              onClick={onUnresolve}
              className="text-gray-500 hover:text-brand text-[11px] inline-flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              {t("margin.unresolve")}
            </button>
          )}

          {canDelete && (
            <button
              onClick={onDelete}
              className="text-gray-500 hover:text-dot-failed text-[11px] inline-flex items-center gap-1 ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mention autocomplete popover                                      */
/* ------------------------------------------------------------------ */

function MentionPopover({
  suggestions,
  highlightIdx,
  setHighlightIdx,
  onPick,
}: {
  suggestions: Array<{ id: string; full_name: string; email: string }>;
  highlightIdx: number;
  setHighlightIdx: (i: number) => void;
  onPick: (user: { id: string; full_name: string; email: string }) => void;
}) {
  return (
    <div className="absolute bottom-full left-0 mb-1 w-[260px] max-w-full bg-surface-card border border-edge-soft rounded-[8px] shadow-[0_8px_24px_rgba(45,80,22,0.12)] z-10 max-h-[200px] overflow-y-auto">
      {suggestions.map((u, idx) => (
        <button
          key={u.id}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(u);
          }}
          onMouseEnter={() => setHighlightIdx(idx)}
          className={`w-full text-left px-2.5 py-1.5 text-[12px] flex items-center gap-2 ${
            idx === highlightIdx
              ? "bg-surface-chipActive text-brand"
              : "hover:bg-surface-hover"
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
          />
          <span className="truncate font-medium">{u.full_name}</span>
          <span className="text-gray-400 text-[10.5px] truncate">
            {u.email}
          </span>
        </button>
      ))}
    </div>
  );
}
