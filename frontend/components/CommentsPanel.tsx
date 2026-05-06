"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { useLocale, useTranslations } from "next-intl";
import {
  AtSign,
  ArrowDown,
  ArrowDownUp,
  MessageSquare,
  Send,
  Trash2,
} from "lucide-react";
import api from "@/lib/api";
import { useMe, initials } from "@/lib/useMe";
import type { Comment } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

// Keep this regex in sync with MENTION_RE in backend/app/routers/comments.py.
// Wrap in a capturing group so String.split preserves the token as an array slot.
const MENTION_TOKEN_SRC = "@\\[[^\\]]{1,80}\\]\\([0-9a-fA-F-]{36}\\)";
const MENTION_SPLIT = new RegExp(`(${MENTION_TOKEN_SRC})`, "g");
const MENTION_EXTRACT = new RegExp(
  `^@\\[([^\\]]{1,80})\\]\\([0-9a-fA-F-]{36}\\)$`
);
// Extract mention UUIDs from a stored comment body — lets us detect when the
// current viewer was personally mentioned without parsing the body twice.
const MENTION_ID_RE = new RegExp(
  `@\\[[^\\]]{1,80}\\]\\(([0-9a-fA-F-]{36})\\)`,
  "g"
);

const COMPOSER_MAX = 4000;
type SortMode = "newest" | "oldest";

interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
}

function renderBody(body: string): React.ReactNode {
  return body.split(MENTION_SPLIT).map((part, idx) => {
    const m = part.match(MENTION_EXTRACT);
    if (m) {
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-0.5 align-baseline px-1.5 py-px rounded-[3px] bg-brand-pale text-brand-deep font-medium text-[12px] leading-[1.4]"
        >
          <AtSign className="w-3 h-3 -ml-0.5 opacity-70" />
          {m[1]}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function commentMentionsUser(body: string, userId: string | undefined) {
  if (!userId) return false;
  const ids = body.match(MENTION_ID_RE);
  if (!ids) return false;
  return ids.some((tok) => tok.includes(userId));
}

/**
 * Bucket comments into "Today", "Yesterday" and dated sections so the feed
 * reads like a journal rather than an undifferentiated stream.
 */
function bucketLabel(date: Date, locale: string, t: ReturnType<typeof useTranslations>) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays === 0) return t("commentsPanel.today");
  if (diffDays === 1) return t("commentsPanel.yesterday");
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: that.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function timeOnly(date: Date, locale: string) {
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CommentsPanel({ documentId }: { documentId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { data: me } = useMe();
  const { data: comments = [], mutate } = useSWR<Comment[]>(
    `/documents/${documentId}/comments`,
    fetcher
  );

  const [sort, setSort] = useState<SortMode>("oldest");
  const [onlyMentions, setOnlyMentions] = useState(false);

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [pickedMentions, setPickedMentions] = useState<
    Array<{ name: string; id: string }>
  >([]);

  // @-mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const { data: directoryUsers = [] } = useSWR<DirectoryUser[]>(
    mentionQuery !== null
      ? `/users/directory?q=${encodeURIComponent(mentionQuery)}`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const suggestions = useMemo(
    () => directoryUsers.slice(0, 6),
    [directoryUsers]
  );

  useEffect(() => {
    setHighlightIdx(0);
  }, [mentionQuery]);

  // Auto-grow the textarea up to a reasonable cap.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [body]);

  // Track scroll position so we can show a "jump to latest" pill.
  const [showJump, setShowJump] = useState(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJump(distFromBottom > 120);
    }
    el.addEventListener("scroll", onScroll);
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [comments.length, sort]);

  // When new comments arrive and we were already at the bottom, follow them.
  const prevCountRef = useRef(comments.length);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const grew = comments.length > prevCountRef.current;
    prevCountRef.current = comments.length;
    if (!grew) return;
    if (sort !== "oldest") return;
    // Only auto-follow if we're already near the bottom.
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [comments.length, sort]);

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    if (sort === "oldest") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) {
      setMentionQuery(null);
      return;
    }
    const charBefore = atIdx === 0 ? "" : before[atIdx - 1];
    if (charBefore && !/\s/.test(charBefore)) {
      setMentionQuery(null);
      return;
    }
    const fragment = before.slice(atIdx + 1);
    if (/\n/.test(fragment) || fragment.length > 30) {
      setMentionQuery(null);
      return;
    }
    setMentionStart(atIdx);
    setMentionQuery(fragment);
  }

  function pickMention(user: DirectoryUser) {
    const before = body.slice(0, mentionStart);
    const afterCaret = body.slice(
      textareaRef.current?.selectionStart ?? mentionStart + 1
    );
    const display = `@${user.full_name} `;
    const next = before + display + afterCaret;
    setBody(next);
    setPickedMentions((prev) => [
      ...prev,
      { name: user.full_name, id: user.id },
    ]);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = (before + display).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function serializeMentions(displayText: string): string {
    let out = displayText;
    for (const m of pickedMentions) {
      const needle = `@${m.name}`;
      const idx = out.indexOf(needle);
      if (idx === -1) continue;
      const replacement = `@[${m.name}](${m.id})`;
      out = out.slice(0, idx) + replacement + out.slice(idx + needle.length);
    }
    return out;
  }

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const outbound = serializeMentions(trimmed);
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/comments`, { body: outbound });
      setBody("");
      setPickedMentions([]);
      setMentionQuery(null);
      mutate();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("comments.deleteConfirm"))) return;
    await api.delete(`/documents/${documentId}/comments/${id}`);
    mutate();
  }

  const canDelete = (c: Comment) =>
    !!me && (c.user_id === me.id || me.role === "admin");

  // Sort + filter pipeline. Server returns oldest-first; we mutate locally.
  const visible = useMemo(() => {
    let rows = comments;
    if (onlyMentions) {
      rows = rows.filter((c) => commentMentionsUser(c.body, me?.id));
    }
    return sort === "newest" ? [...rows].reverse() : rows;
  }, [comments, sort, onlyMentions, me?.id]);

  // Group by date label for the section dividers.
  const grouped = useMemo(() => {
    const groups: { label: string; items: Comment[] }[] = [];
    visible.forEach((c) => {
      const d = new Date(c.created_at);
      const label = bucketLabel(d, locale, t);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(c);
      else groups.push({ label, items: [c] });
    });
    return groups;
  }, [visible, locale, t]);

  const totalCount = comments.length;
  const mentionsCount = useMemo(
    () =>
      comments.filter((c) => commentMentionsUser(c.body, me?.id)).length,
    [comments, me?.id]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-edge-soft bg-white">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-brand" />
          <span className="text-[12px] font-semibold tracking-wide text-brand">
            {t("commentsPanel.title")}
          </span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 text-[10.5px] font-semibold rounded-full bg-surface-chipActive text-brand">
            {totalCount}
          </span>
        </div>

        <div className="flex-1" />

        {me && mentionsCount > 0 && (
          <button
            onClick={() => setOnlyMentions((v) => !v)}
            className={`px-2 py-1 rounded-[5px] text-[11.5px] inline-flex items-center gap-1 border transition-colors ${
              onlyMentions
                ? "bg-brand-pale border-edge-chip text-brand-deep"
                : "bg-white border-edge-soft text-gray-600 hover:text-brand hover:border-edge-chip"
            }`}
            title={t("commentsPanel.onlyMentionsHelp")}
          >
            <AtSign className="w-3 h-3" />
            <span>
              {t("commentsPanel.onlyMentions", { count: mentionsCount })}
            </span>
          </button>
        )}

        <button
          onClick={() => setSort((s) => (s === "oldest" ? "newest" : "oldest"))}
          className="px-2 py-1 rounded-[5px] text-[11.5px] inline-flex items-center gap-1 border border-edge-soft text-gray-600 hover:text-brand hover:border-edge-chip"
          title={t("commentsPanel.sortToggle")}
        >
          <ArrowDownUp className="w-3 h-3" />
          {sort === "oldest"
            ? t("commentsPanel.oldestFirst")
            : t("commentsPanel.newestFirst")}
        </button>
      </div>

      {/* Feed */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto relative">
        {comments.length === 0 ? (
          <EmptyState />
        ) : visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-[12.5px] text-gray-500">
            {t("commentsPanel.noFiltered")}
          </div>
        ) : (
          <div className="px-5 py-4">
            {grouped.map((g, gi) => (
              <section key={`${g.label}-${gi}`} className="mb-2">
                <DateDivider label={g.label} />
                <ul className="space-y-1">
                  {g.items.map((c) => (
                    <CommentRow
                      key={c.id}
                      comment={c}
                      locale={locale}
                      isMine={!!me && c.user_id === me.id}
                      mentionsMe={commentMentionsUser(c.body, me?.id)}
                      canDelete={canDelete(c)}
                      onDelete={() => remove(c.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {showJump && comments.length > 0 && sort === "oldest" && (
          <button
            onClick={jumpToLatest}
            className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand text-brand-pale text-[11.5px] shadow-[0_4px_14px_rgba(45,80,22,0.25)] hover:bg-brand-hover"
          >
            <ArrowDown className="w-3 h-3" />
            {t("commentsPanel.jumpToLatest")}
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-edge-soft bg-surface-hover/70 backdrop-blur-[1px]">
        <div className="relative px-3 pt-3 pb-2">
          {me && (
            <div className="flex items-start gap-2.5">
              <Avatar
                name={me.full_name}
                size="md"
                className="mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0 rounded-[8px] border border-edge-chip bg-white focus-within:border-edge-focus shadow-[0_1px_0_rgba(45,80,22,0.04)]">
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(e) => {
                    if (e.target.value.length > COMPOSER_MAX) return;
                    setBody(e.target.value);
                    updateMentionState(
                      e.target.value,
                      e.target.selectionStart ?? 0
                    );
                  }}
                  onClick={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    updateMentionState(body, target.selectionStart ?? 0);
                  }}
                  onKeyDown={(e) => {
                    if (mentionQuery !== null && suggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightIdx((i) => (i + 1) % suggestions.length);
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightIdx(
                          (i) =>
                            (i - 1 + suggestions.length) % suggestions.length
                        );
                        return;
                      }
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        pickMention(suggestions[highlightIdx]);
                        return;
                      }
                      if (e.key === "Escape") {
                        setMentionQuery(null);
                        return;
                      }
                    }
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={t("commentsPanel.composerPlaceholder", {
                    name: me.full_name.split(" ")[0],
                  })}
                  rows={1}
                  className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1.5 outline-none text-[13px] leading-[1.55] text-ink placeholder:text-gray-400"
                  style={{ minHeight: 36 }}
                />
                <div className="flex items-center gap-2 px-2.5 pb-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const el = textareaRef.current;
                      if (!el) return;
                      const start = el.selectionStart ?? body.length;
                      const next =
                        body.slice(0, start) +
                        (body.slice(0, start).endsWith(" ") || start === 0
                          ? "@"
                          : " @") +
                        body.slice(start);
                      setBody(next);
                      requestAnimationFrame(() => {
                        el.focus();
                        const pos = next.length;
                        el.setSelectionRange(pos, pos);
                        updateMentionState(next, pos);
                      });
                    }}
                    className="text-gray-400 hover:text-brand p-1 rounded"
                    title={t("comments.mentionHint")}
                  >
                    <AtSign className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10.5px] text-gray-400 hidden sm:inline">
                    {t("commentsPanel.kbdHint")}
                  </span>
                  <div className="flex-1" />
                  {body.length > COMPOSER_MAX * 0.8 && (
                    <span
                      className={`text-[10.5px] tabular-nums ${
                        body.length >= COMPOSER_MAX
                          ? "text-[#c94949]"
                          : "text-gray-400"
                      }`}
                    >
                      {body.length} / {COMPOSER_MAX}
                    </span>
                  )}
                  <button
                    disabled={busy || !body.trim()}
                    onClick={submit}
                    className="px-2.5 py-1 rounded-[5px] bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-40 disabled:hover:bg-brand text-[11.5px] inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3 h-3" />
                    {t("comments.send")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {mentionQuery !== null && suggestions.length > 0 && (
            <div className="absolute bottom-[calc(100%-6px)] left-12 max-w-xs w-[260px] bg-white border border-edge-soft rounded-[8px] shadow-[0_8px_24px_rgba(45,80,22,0.12)] z-10 max-h-[200px] overflow-y-auto">
              <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-b border-edge-soft bg-surface-hover">
                {t("commentsPanel.mentionPickerTitle")}
              </div>
              {suggestions.map((u, idx) => (
                <button
                  key={u.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(u);
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full text-left px-2.5 py-1.5 text-[12px] flex items-center gap-2 ${
                    idx === highlightIdx
                      ? "bg-surface-chipActive text-brand"
                      : "hover:bg-surface-hover"
                  }`}
                >
                  <Avatar name={u.full_name} size="xs" />
                  <span className="truncate font-medium">{u.full_name}</span>
                  <span className="text-gray-400 text-[10.5px] truncate">
                    {u.email}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Comment row                                                     */
/* ---------------------------------------------------------------- */

function CommentRow({
  comment,
  locale,
  isMine,
  mentionsMe,
  canDelete,
  onDelete,
}: {
  comment: Comment;
  locale: string;
  isMine: boolean;
  mentionsMe: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const date = new Date(comment.created_at);
  const isToday =
    new Date().toDateString() === date.toDateString();
  const fullStamp = date.toLocaleString(locale);
  const shortStamp = isToday
    ? timeOnly(date, locale)
    : date.toLocaleString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      });

  return (
    <li
      className={`group relative flex gap-3 py-2.5 pl-2 pr-3 rounded-[6px] hover:bg-surface-hover transition-colors ${
        mentionsMe ? "bg-[#fbfbef]" : ""
      }`}
    >
      {mentionsMe && (
        <span
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-brand-accent"
          aria-hidden
        />
      )}
      <Avatar name={comment.author.full_name} size="md" className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-ink text-[12.5px]">
            {comment.author.full_name}
          </span>
          {isMine && (
            <span className="px-1.5 py-px rounded-[3px] bg-surface-chipActive text-brand text-[9.5px] uppercase tracking-wider font-medium">
              {t("commentsPanel.you")}
            </span>
          )}
          {mentionsMe && !isMine && (
            <span className="px-1.5 py-px rounded-[3px] bg-brand-pale text-brand-deep text-[9.5px] uppercase tracking-wider font-medium inline-flex items-center gap-0.5">
              <AtSign className="w-2.5 h-2.5" />
              {t("commentsPanel.mentionsYou")}
            </span>
          )}
          <time
            className="text-[11px] text-gray-500"
            title={fullStamp}
            dateTime={comment.created_at}
          >
            {shortStamp}
          </time>
          {canDelete && (
            <button
              onClick={onDelete}
              className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-[#c94949] transition-opacity"
              title={t("common.delete")}
              aria-label={t("common.delete")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-[1.55] text-ink whitespace-pre-wrap break-words">
          {renderBody(comment.body)}
        </p>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- */
/*  Helpers                                                         */
/* ---------------------------------------------------------------- */

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2 select-none">
      <span className="h-px flex-1 bg-edge-soft" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-edge-soft" />
    </div>
  );
}

function Avatar({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const dim =
    size === "xs"
      ? "w-5 h-5 text-[9px]"
      : size === "sm"
      ? "w-6 h-6 text-[10px]"
      : "w-8 h-8 text-[11.5px]";
  return (
    <span
      className={`rounded-full bg-brand-chip text-white font-semibold flex items-center justify-center ring-2 ring-white shadow-[0_1px_2px_rgba(45,80,22,0.2)] ${dim} ${className}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function EmptyState() {
  const t = useTranslations();
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-surface-chipActive flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-brand" />
        </div>
        <h3 className="font-display text-[18px] text-brand-deep mb-1.5">
          {t("commentsPanel.emptyHeading")}
        </h3>
        <p className="text-[12.5px] text-gray-600 leading-relaxed">
          {t("commentsPanel.emptyBody")}
        </p>
      </div>
    </div>
  );
}
