"use client";

import { useCallback } from "react";
import type { Annotation } from "@/lib/types";
import { useAnnotationOptional } from "@/components/AnnotationContext";

interface AnnotationLayerProps {
  annotations: Annotation[];
  pageWidth: number;
  pageHeight: number;
  onAnnotationClick?: (annotationId: string) => void;
  activeAnnotationId?: string | null;
}

/**
 * Transparent overlay rendered on top of a single PDF page.
 *
 * Each annotation's `highlight_rects` are stored in the original page
 * coordinate system (with `pageWidth` / `pageHeight` recorded at creation
 * time). This component scales them to the current rendered dimensions.
 */
export default function AnnotationLayer({
  annotations,
  pageWidth,
  pageHeight,
  onAnnotationClick,
  activeAnnotationId,
}: AnnotationLayerProps) {
  const annotationCtx = useAnnotationOptional();

  const handleClick = useCallback(
    (commentId: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      // Prefer context when available, fall back to prop
      if (annotationCtx) {
        annotationCtx.setActiveAnnotationId(commentId);
      } else if (onAnnotationClick) {
        onAnnotationClick(commentId);
      }
    },
    [annotationCtx, onAnnotationClick],
  );

  const handleKeyDown = useCallback(
    (commentId: string) => (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (annotationCtx) {
          annotationCtx.setActiveAnnotationId(commentId);
        } else if (onAnnotationClick) {
          onAnnotationClick(commentId);
        }
      }
    },
    [annotationCtx, onAnnotationClick],
  );

  // Use context's activeAnnotationId if available, otherwise fall back to prop
  const resolvedActiveId = annotationCtx?.activeAnnotationId ?? activeAnnotationId;

  if (annotations.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {annotations.map((ann) =>
        ann.highlight_rects.map((rect, ri) => {
          const scaleX = pageWidth / rect.pageWidth;
          const scaleY = pageHeight / rect.pageHeight;

          const isActive = resolvedActiveId === ann.comment_id;

          return (
            <div
              key={`${ann.id}-${ri}`}
              role="button"
              tabIndex={0}
              onClick={handleClick(ann.comment_id)}
              onKeyDown={handleKeyDown(ann.comment_id)}
              className={`absolute pointer-events-auto cursor-pointer rounded-[2px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                isActive
                  ? "bg-yellow-300/60 ring-2 ring-yellow-500/50"
                  : "bg-yellow-200/40 hover:bg-yellow-300/60"
              }`}
              style={{
                left: rect.x * scaleX,
                top: rect.y * scaleY,
                width: rect.width * scaleX,
                height: rect.height * scaleY,
              }}
              title={ann.selected_text ?? undefined}
            />
          );
        }),
      )}
    </div>
  );
}
