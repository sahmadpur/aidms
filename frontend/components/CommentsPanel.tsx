"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, Send } from "lucide-react";
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

interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
}

function renderBody(body: string): React.ReactNode {
  // Splitting with a capturing regex yields [text, token, text, token, ...].
  // Simpler + more robust than matchAll with lastIndex state.
  return body.split(MENTION_SPLIT).map((part, idx) => {
    const m = part.match(MENTION_EXTRACT);
    if (m) {
      return (
        <span
          key={idx}
          className="inline-block px-1 rounded bg-brand-pale text-brand font-medium"
        >
          @{m[1]}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
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
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Each entry records a user the author explicitly picked from the autocomplete.
  // We show plain "@Full Name" in the textarea and only rewrite to
  // "@[Full Name](uuid)" tokens at submit time.
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

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) {
      setMentionQuery(null);
      return;
    }
    // must not be part of a token or email
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
    // Visible text is "@Full Name " — no UUID cruft in the composer.
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

  // Turn each picked "@Full Name" back into an "@[Full Name](uuid)" token so
  // the backend can resolve + notify the mentioned user. A picked mention whose
  // visible text has since been deleted is silently dropped.
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 && (
          <p className="text-[12px] text-gray-500 italic">{t("comments.empty")}</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-brand-chip text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
              {initials(c.author.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className="font-medium text-gray-800">
                  {c.author.full_name}
                </span>
                <span className="text-gray-500">
                  {new Date(c.created_at).toLocaleString(locale)}
                </span>
                {canDelete(c) && (
                  <button
                    onClick={() => remove(c.id)}
                    className="ml-auto text-gray-400 hover:text-rose-600"
                    title={t("common.delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[12.5px] text-gray-700 whitespace-pre-wrap mt-0.5">
                {renderBody(c.body)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-edge-soft p-3 bg-surface-hover relative">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              updateMentionState(e.target.value, e.target.selectionStart ?? 0);
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
                    (i) => (i - 1 + suggestions.length) % suggestions.length
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
            placeholder={t("comments.placeholder")}
            rows={2}
            className="flex-1 border border-edge-chip rounded p-2 text-[12.5px] outline-none focus:border-edge-focus resize-none bg-white"
          />
          <button
            disabled={busy || !body.trim()}
            onClick={submit}
            className="px-3 py-1.5 rounded bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-50 text-[12px] self-end flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            {t("comments.send")}
          </button>
        </div>
        {mentionQuery !== null && suggestions.length > 0 && (
          <div className="absolute bottom-[60px] left-3 right-3 max-w-xs bg-white border border-edge-soft rounded-md shadow-md z-10 max-h-[180px] overflow-y-auto">
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
                <span className="w-5 h-5 rounded-full bg-brand-chip text-white text-[9px] font-semibold flex items-center justify-center flex-shrink-0">
                  {initials(u.full_name)}
                </span>
                <span className="truncate">{u.full_name}</span>
                <span className="text-gray-400 text-[10.5px] truncate">
                  {u.email}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-1">
          {t("comments.mentionHint")}
        </p>
      </div>
    </div>
  );
}
