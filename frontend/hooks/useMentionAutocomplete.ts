"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import api from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
}

interface PickedMention {
  name: string;
  id: string;
}

export function useMentionAutocomplete() {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [pickedMentions, setPickedMentions] = useState<PickedMention[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null!);


  const { data: directoryUsers = [] } = useSWR<DirectoryUser[]>(
    mentionQuery !== null
      ? `/users/directory?q=${encodeURIComponent(mentionQuery)}`
      : null,
    fetcher,
  );

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = before.slice(atIdx + 1);
    if (/\n/.test(afterAt)) {
      setMentionQuery(null);
      return;
    }
    const charBefore = atIdx > 0 ? before[atIdx - 1] : " ";
    if (!/[\s(]/.test(charBefore) && atIdx !== 0) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(afterAt);
    setMentionStart(atIdx);
    setHighlightIdx(0);
  }

  function pickMention(
    user: DirectoryUser,
    body: string,
    setBody: (v: string) => void,
  ) {
    const display = `@${user.full_name} `;
    const before = body.slice(0, mentionStart);
    const after = body.slice(
      mentionStart + 1 + (mentionQuery?.length ?? 0),
    );
    setBody(before + display + after);
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

  function handleMentionKeyDown(
    e: React.KeyboardEvent,
    body: string,
    setBody: (v: string) => void,
  ): boolean {
    if (mentionQuery === null || directoryUsers.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, directoryUsers.length - 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(directoryUsers[highlightIdx], body, setBody);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMentionQuery(null);
      return true;
    }
    return false;
  }

  function resetMentions() {
    setPickedMentions([]);
    setMentionQuery(null);
  }

  return {
    textareaRef,
    mentionQuery,
    mentionStart,
    highlightIdx,
    setHighlightIdx,
    directoryUsers,
    pickedMentions,
    updateMentionState,
    pickMention,
    handleMentionKeyDown,
    resetMentions,
  };
}
