"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Reply,
  Send,
  Trash2,
} from "lucide-react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Avatar } from "@/components/Avatar";
import { buildThreads, type CommentThread } from "@/lib/commentThreads";
import { renderBody, serializeMentions } from "@/lib/commentFormatting";
import { useMentionAutocomplete } from "@/hooks/useMentionAutocomplete";
import type { Comment } from "@/lib/types";

interface DiscussionPanelProps {
  documentId: string;
  comments: Comment[];
  annotationCommentIds: Set<string>;
  onMutate: () => void;
}

const COMPOSER_MAX = 4000;

export default function DiscussionPanel({
  documentId,
  comments,
  annotationCommentIds,
  onMutate,
}: DiscussionPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { data: me } = useMe();

  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
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

  const suggestions = useMemo(
    () => directoryUsers.slice(0, 6),
    [directoryUsers],
  );

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [body, textareaRef]);

  // Filter to general (non-annotated) comments
  const generalComments = useMemo(() => {
    return comments.filter((c) => {
      // A root-level comment is "general" if its id is not in annotationCommentIds
      if (!c.parent_id) {
        return !annotationCommentIds.has(c.id);
      }
      // A reply is "general" if its parent_id is not in annotationCommentIds
      return !annotationCommentIds.has(c.parent_id);
    });
  }, [comments, annotationCommentIds]);

  const threads = useMemo(
    () => buildThreads(generalComments),
    [generalComments],
  );

  const generalCount = threads.length;

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const outbound = serializeMentions(trimmed, pickedMentions);
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/comments`, {
        body: outbound,
        ...(replyingTo ? { parent_id: replyingTo.id } : {}),
      });
      setBody("");
      resetMentions();
      setReplyingTo(null);
      onMutate();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("comments.deleteConfirm"))) return;
    await api.delete(`/documents/${documentId}/comments/${id}`);
    onMutate();
  }

  return (
    <div className="bg-surface-card border border-edge-soft rounded-b-[10px] border-t-0">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-2.5 cursor-pointer flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-brand" />
          <span className="font-semibold text-[12px] text-ink">
            {t("margin.generalDiscussion")}
          </span>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] bg-surface-chipActive rounded-full px-1.5 text-[10px] font-semibold text-brand">
            {generalCount}
          </span>
        </div>

        <div className="flex items-center gap-1 text-ink-soft">
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span className="text-[11px]">{t("margin.collapse")}</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span className="text-[11px]">{t("margin.expand")}</span>
            </>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <>
          {/* Scrollable comment list */}
          <div className="max-h-[300px] overflow-y-auto px-4 py-3">
            {threads.length === 0 ? (
              <p className="text-[12px] text-gray-500 text-center py-4">
                {t("comments.empty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {threads.map((thread) => (
                  <ThreadRow
                    key={thread.root.id}
                    thread={thread}
                    locale={locale}
                    me={me}
                    onDelete={remove}
                    onReply={(id, name) => {
                      setReplyingTo({ id, name });
                      textareaRef.current?.focus();
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-edge-soft px-4 py-3 relative">
            {me && (
              <div className="flex items-start gap-2.5">
                <Avatar
                  user={me}
                  size="xs"
                  className="mt-1 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  {replyingTo && (
                    <div className="flex items-center gap-2 px-3 py-1 mb-1 rounded-t-[6px] bg-surface-chipActive text-[11px] text-brand-deep">
                      <Reply className="w-3 h-3 opacity-70" />
                      <span>
                        {t("commentsPanel.replyingTo", {
                          name: replyingTo.name,
                        })}
                      </span>
                      <button
                        onClick={() => setReplyingTo(null)}
                        className="ml-auto text-gray-500 hover:text-ink p-0.5 rounded"
                      >
                        <span className="sr-only">{t("common.close")}</span>
                        &times;
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
                          submit();
                        }
                      }}
                      placeholder={t("margin.newComment")}
                      rows={1}
                      className="flex-1 resize-none bg-surface-hover rounded-[6px] border border-edge-soft focus:border-edge-focus px-3 py-2 outline-none text-[12px] leading-[1.5] text-ink placeholder:text-gray-400"
                      style={{ minHeight: 36 }}
                    />
                    <button
                      disabled={busy || !body.trim()}
                      onClick={submit}
                      className="p-2 rounded-[6px] bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-40 disabled:hover:bg-brand flex-shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mention autocomplete dropdown */}
            {mentionQuery !== null && suggestions.length > 0 && (
              <div className="absolute bottom-full left-12 mb-1 max-w-xs w-[260px] bg-surface-card border border-edge-soft rounded-[8px] shadow-[0_8px_24px_rgba(45,80,22,0.12)] z-10 max-h-[200px] overflow-y-auto">
                <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-b border-edge-soft bg-surface-hover">
                  {t("commentsPanel.mentionPickerTitle")}
                </div>
                {suggestions.map((u, idx) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(u, body, setBody);
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
                    <span className="truncate font-medium">
                      {u.full_name}
                    </span>
                    <span className="text-gray-400 text-[10.5px] truncate">
                      {u.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Thread row                                                       */
/* ---------------------------------------------------------------- */

function ThreadRow({
  thread,
  locale,
  me,
  onDelete,
  onReply,
}: {
  thread: CommentThread;
  locale: string;
  me: { id: string; role: string } | undefined;
  onDelete: (id: string) => void;
  onReply: (parentId: string, authorName: string) => void;
}) {
  const { root, replies } = thread;

  const canDelete = (c: Comment) =>
    !!me && (c.user_id === me.id || me.role === "admin");

  return (
    <li className="list-none">
      <CommentRow
        comment={root}
        locale={locale}
        canDelete={canDelete(root)}
        onDelete={() => onDelete(root.id)}
        onReply={() => onReply(root.id, root.author.full_name)}
      />

      {replies.length > 0 && (
        <ul className="pl-8 border-l-2 border-edge-soft ml-3 mt-1 space-y-1">
          {replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              locale={locale}
              canDelete={canDelete(reply)}
              onDelete={() => onDelete(reply.id)}
              onReply={() => onReply(root.id, reply.author.full_name)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- */
/*  Single comment row                                               */
/* ---------------------------------------------------------------- */

function CommentRow({
  comment,
  locale,
  canDelete,
  onDelete,
  onReply,
}: {
  comment: Comment;
  locale: string;
  canDelete: boolean;
  onDelete: () => void;
  onReply: () => void;
}) {
  const t = useTranslations();
  const date = new Date(comment.created_at);
  const isToday = new Date().toDateString() === date.toDateString();
  const fullStamp = date.toLocaleString(locale);
  const shortStamp = isToday
    ? date.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      });

  return (
    <li className="group relative flex gap-2.5 py-2 rounded-[5px] hover:bg-surface-hover transition-colors list-none">
      <Avatar
        user={{
          id: comment.author.id,
          full_name: comment.author.full_name,
          avatar_url: comment.author.avatar_url,
          updated_at: comment.author.updated_at,
        }}
        size="xs"
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-ink text-[12px]">
            {comment.author.full_name}
          </span>
          <time
            className="text-[10.5px] text-gray-500"
            title={fullStamp}
            dateTime={comment.created_at}
          >
            {shortStamp}
          </time>

          {/* Action buttons — visible on hover */}
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={onReply}
              className="text-ink-soft hover:text-brand p-0.5 rounded"
              title={t("commentsPanel.reply")}
              aria-label={t("commentsPanel.reply")}
            >
              <Reply className="w-3 h-3" />
            </button>
            {canDelete && (
              <button
                onClick={onDelete}
                className="text-ink-soft hover:text-dot-failed p-0.5 rounded"
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink whitespace-pre-wrap break-words">
          {renderBody(comment.body)}
        </p>
      </div>
    </li>
  );
}
