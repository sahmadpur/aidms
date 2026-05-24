"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { mutate as globalMutate } from "swr";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Avatar } from "@/components/Avatar";
import CommentBubble from "@/components/CommentBubble";
import {
  useAnnotation,
  type CreatingBubble,
} from "@/components/AnnotationContext";
import { useMentionAutocomplete } from "@/hooks/useMentionAutocomplete";
import { serializeMentions } from "@/lib/commentFormatting";
import { buildThreads, type CommentThread } from "@/lib/commentThreads";
import type { Annotation, Comment } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MarginCommentsProps {
  documentId: string;
  annotations: Annotation[];
  comments: Comment[];
  pageNumber: number;
  pageHeight: number;
  pageWidth: number;
}

/* ------------------------------------------------------------------ */
/*  Matched pair: annotation + its comment thread                      */
/* ------------------------------------------------------------------ */

interface AnnotationWithThread {
  annotation: Annotation;
  thread: CommentThread;
  /** Ideal Y position (scaled to current page dimensions) */
  idealY: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarginComments({
  documentId,
  annotations,
  comments,
  pageNumber,
  pageHeight,
  pageWidth,
}: MarginCommentsProps) {
  const {
    activeAnnotationId,
    setActiveAnnotationId,
    showResolved,
    creatingBubble,
    setCreatingBubble,
  } = useAnnotation();

  // ---- Build threads from all comments ----
  const threads = useMemo(() => buildThreads(comments), [comments]);
  const threadByRootId = useMemo(() => {
    const map = new Map<string, CommentThread>();
    for (const thread of threads) {
      map.set(thread.root.id, thread);
    }
    return map;
  }, [threads]);

  // ---- Filter annotations to current page + match to threads ----
  const matched = useMemo<AnnotationWithThread[]>(() => {
    const pairs: AnnotationWithThread[] = [];

    for (const ann of annotations) {
      if (ann.page_number !== pageNumber) continue;

      const thread = threadByRootId.get(ann.comment_id);
      if (!thread) continue;

      // If showResolved is false, skip resolved threads
      if (!showResolved && thread.root.is_resolved) continue;

      // Compute ideal Y from the first highlight rect
      const firstRect = ann.highlight_rects[0];
      if (!firstRect) continue;

      const scaleY = pageHeight / firstRect.pageHeight;
      const idealY = firstRect.y * scaleY;

      pairs.push({ annotation: ann, thread, idealY });
    }

    // Sort by idealY ascending
    pairs.sort((a, b) => a.idealY - b.idealY);
    return pairs;
  }, [annotations, pageNumber, threadByRootId, showResolved, pageHeight]);

  // ---- Bubble height tracking ----
  const [bubbleHeights, setBubbleHeights] = useState<Map<string, number>>(
    () => new Map(),
  );

  const bubbleRefCallback = useCallback(
    (annotationId: string) => (el: HTMLDivElement | null) => {
      if (!el) return;
      const height = el.offsetHeight;
      setBubbleHeights((prev) => {
        if (prev.get(annotationId) === height) return prev;
        const next = new Map(prev);
        next.set(annotationId, height);
        return next;
      });
    },
    [],
  );

  // ---- Compute actual positions with overlap avoidance ----
  const positioned = useMemo(() => {
    const result: Array<{
      annotation: Annotation;
      thread: CommentThread;
      idealY: number;
      actualY: number;
    }> = [];

    let previousBottom = -Infinity;

    for (const item of matched) {
      const gap = 8;
      const actualY = Math.max(item.idealY, previousBottom + gap);
      const measuredHeight = bubbleHeights.get(item.annotation.id) ?? 80; // default estimate
      previousBottom = actualY + measuredHeight;

      result.push({
        ...item,
        actualY,
      });
    }

    return result;
  }, [matched, bubbleHeights]);

  // ---- Auto-scroll active bubble into view ----
  const activeBubbleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeAnnotationId && activeBubbleRef.current) {
      activeBubbleRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeAnnotationId]);

  // ---- Compute creating bubble position (if on this page) ----
  const showCreating =
    creatingBubble && creatingBubble.pageNumber === pageNumber;

  return (
    <div
      className="w-[240px] flex-shrink-0 relative"
      style={{ minHeight: pageHeight }}
    >
      {/* Connector lines SVG */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
        style={{ overflow: "visible" }}
      >
        {positioned.map(({ annotation, thread, idealY, actualY }) => {
          const firstRect = annotation.highlight_rects[0];
          if (!firstRect) return null;

          const scaleY = pageHeight / firstRect.pageHeight;
          const highlightMidY =
            firstRect.y * scaleY + (firstRect.height * scaleY) / 2;

          const measuredHeight =
            bubbleHeights.get(annotation.id) ?? 80;
          const bubbleMidY = actualY + measuredHeight / 2;

          const isActive = annotation.comment_id === activeAnnotationId;
          const isResolved = thread.root.is_resolved;
          const lineColor = isActive
            ? "#facc15"
            : isResolved
              ? "#ccc"
              : "#94a3b8";
          const lineWidth = 1.5;

          // x=0 is the left edge of the margin column.
          // Negative x extends into the gap between PDF page and margin.
          const startX = -12;
          const endX = 0;

          if (Math.abs(actualY - idealY) < 1) {
            // Straight horizontal line at highlight midpoint
            return (
              <line
                key={`connector-${annotation.id}`}
                x1={startX}
                y1={highlightMidY}
                x2={endX}
                y2={highlightMidY}
                stroke={lineColor}
                strokeWidth={lineWidth}
              />
            );
          }

          // L-shaped connector: horizontal from highlight, down to bubble, then horizontal
          return (
            <path
              key={`connector-${annotation.id}`}
              d={`M ${startX} ${highlightMidY} L ${endX} ${highlightMidY} L ${endX} ${bubbleMidY} L ${endX + 12} ${bubbleMidY}`}
              fill="none"
              stroke={lineColor}
              strokeWidth={lineWidth}
            />
          );
        })}
      </svg>

      {/* Existing annotation bubbles */}
      {positioned.map(({ annotation, thread, actualY }) => {
        const isActive = annotation.comment_id === activeAnnotationId;
        return (
          <div
            key={annotation.id}
            ref={(el) => {
              bubbleRefCallback(annotation.id)(el);
              if (isActive) {
                activeBubbleRef.current = el;
              }
            }}
            className="absolute left-0 right-0"
            style={{ top: actualY }}
            onClick={() => setActiveAnnotationId(annotation.comment_id)}
          >
            <CommentBubble
              thread={thread}
              documentId={documentId}
              isActive={isActive}
              onActivate={() => setActiveAnnotationId(annotation.comment_id)}
              onMutate={() => { globalMutate(`/documents/${documentId}/comments`); globalMutate(`/documents/${documentId}/annotations`); }}
            />
          </div>
        );
      })}

      {/* Creating bubble (new annotation in progress) */}
      {showCreating && creatingBubble && (
        <CreatingBubbleComposer
          documentId={documentId}
          creatingBubble={creatingBubble}
          setCreatingBubble={setCreatingBubble}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Creating-bubble inline composer                                    */
/* ------------------------------------------------------------------ */

function CreatingBubbleComposer({
  documentId,
  creatingBubble,
  setCreatingBubble,
}: {
  documentId: string;
  creatingBubble: CreatingBubble;
  setCreatingBubble: (b: CreatingBubble | null) => void;
}) {
  const t = useTranslations();
  const { data: me } = useMe();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Auto-focus the textarea on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [textareaRef]);

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [body, textareaRef]);

  // Click outside with empty input -> cancel
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        if (!body.trim()) {
          setCreatingBubble(null);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [body, setCreatingBubble]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;

    const serialized = serializeMentions(trimmed, pickedMentions);

    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/annotations`, {
        page_number: creatingBubble.pageNumber,
        highlight_rects: creatingBubble.rects,
        selected_text: creatingBubble.selectedText,
        comment_body: serialized,
      });
      // Revalidate both comments and annotations
      globalMutate(`/documents/${documentId}/comments`);
      globalMutate(`/documents/${documentId}/annotations`);
      setBody("");
      resetMentions();
      setCreatingBubble(null);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = directoryUsers.slice(0, 6);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0"
      style={{ top: creatingBubble.yPosition }}
    >
      <div className="rounded-[8px] border border-brand bg-surface-card shadow-lg p-2">
        {me && (
          <div className="flex items-start gap-2 mb-1.5">
            <Avatar user={me} size="xs" className="mt-0.5 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-ink truncate">
              {me.full_name}
            </span>
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
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
              if (e.key === "Escape") {
                e.preventDefault();
                if (!body.trim()) {
                  setCreatingBubble(null);
                }
                return;
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={t("margin.newComment")}
            rows={1}
            className="w-full resize-none bg-transparent px-1 py-1 outline-none text-[12px] leading-[1.5] text-ink placeholder:text-gray-400 border border-edge-chip rounded-[4px] focus:border-brand"
            style={{ minHeight: 32 }}
          />

          {/* Mention autocomplete dropdown */}
          {mentionQuery !== null && suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full bg-surface-card border border-edge-soft rounded-[6px] shadow-lg z-20 max-h-[160px] overflow-y-auto">
              {suggestions.map((u, idx) => (
                <button
                  key={u.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(u, body, setBody);
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full text-left px-2 py-1 text-[11px] flex items-center gap-1.5 ${
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
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 mt-1.5">
          <button
            onClick={() => setCreatingBubble(null)}
            className="px-2 py-0.5 rounded-[4px] text-[10.5px] text-gray-500 hover:text-ink hover:bg-surface-hover"
          >
            {t("common.cancel")}
          </button>
          <button
            disabled={busy || !body.trim()}
            onClick={handleSubmit}
            className="px-2 py-0.5 rounded-[4px] bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-40 text-[10.5px] inline-flex items-center gap-1"
          >
            <Send className="w-2.5 h-2.5" />
            {t("comments.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
