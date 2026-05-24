"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import api from "@/lib/api";
import type { Annotation, Comment } from "@/lib/types";
import AnnotationLayerComponent from "@/components/AnnotationLayer";
import MarginComments from "@/components/MarginComments";
import { useAnnotationOptional } from "@/components/AnnotationContext";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Props {
  fileUrl: string;
  documentId?: string;
  onOcrClick?: () => void;
}

const SCROLL_PADDING = 32; // matches the px-4 + small breathing room on the page wrapper
const MARGIN_WIDTH = 240;

export default function DocumentViewer({ fileUrl, documentId, onOcrClick }: Props) {
  const t = useTranslations();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  // `scale` is now a multiplier applied on top of fit-to-width — scale=1
  // means the page exactly matches the container width; zoom in/out lets the
  // user grow/shrink relative to that.
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Mobile detection for margin column
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Annotation context (optional — works without it)
  const annotationCtx = useAnnotationOptional();

  // Fetch annotations if documentId is provided
  const { data: annotations = [] } = useSWR<Annotation[]>(
    documentId ? `/documents/${documentId}/annotations` : null,
    fetcher,
  );

  // Fetch comments if documentId is provided
  const { data: comments = [] } = useSWR<Comment[]>(
    documentId ? `/documents/${documentId}/comments` : null,
    fetcher,
  );

  // Filter annotations for the current page
  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.page_number === pageNumber),
    [annotations, pageNumber],
  );

  // Register scrollToPage with the context so external components can navigate
  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= numPages) {
        setPageNumber(page);
      }
    },
    [numPages],
  );

  useEffect(() => {
    annotationCtx?.registerScrollToPage(goToPage);
  }, [annotationCtx, goToPage]);

  useEffect(() => {
    let objectUrl: string;
    api
      .get(fileUrl, { responseType: "blob" })
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      })
      .catch(() => setFetchError("Failed to load PDF."));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);

  // Track the scroll-container width so react-pdf can render at fit-to-width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const marginOffset = documentId && !isMobile ? MARGIN_WIDTH : 0;
      const w = el.clientWidth - SCROLL_PADDING - marginOffset;
      if (w > 0) setContainerWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [blobUrl, fullscreen, documentId, isMobile]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  // Compute the rendered page dimensions (after rotation + scale).
  // react-pdf's `width` prop controls the *width* of the page, but when
  // rotation is 90/270 the visual width/height are swapped.
  const renderedWidth = containerWidth * scale;
  // react-pdf keeps the rendered element the same width regardless of rotation
  // and adjusts height. For our overlay we use the container's actual dimensions
  // via pageContainerRef, which automatically accounts for rotation and scale.

  // Handle text selection for annotation creation — creates an instant bubble
  const handleMouseUp = useCallback(() => {
    if (!annotationCtx || !documentId) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    const pageEl = pageContainerRef.current;
    if (!pageEl) return;

    const range = sel.getRangeAt(0);
    const clientRects = range.getClientRects();
    if (clientRects.length === 0) return;

    const pageRect = pageEl.getBoundingClientRect();

    // The actual page canvas / text layer dimensions
    const pageW = pageEl.offsetWidth;
    const pageH = pageEl.offsetHeight;

    // Build highlight rects relative to the page container
    const highlightRects: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      pageWidth: number;
      pageHeight: number;
    }> = [];
    for (let i = 0; i < clientRects.length; i++) {
      const cr = clientRects[i];
      highlightRects.push({
        x: cr.left - pageRect.left,
        y: cr.top - pageRect.top,
        width: cr.width,
        height: cr.height,
        pageWidth: pageW,
        pageHeight: pageH,
      });
    }

    // Get the Y position from the first rect for bubble positioning
    const firstRect = highlightRects[0];

    // Immediately create a bubble instead of showing a floating button
    annotationCtx.setCreatingBubble({
      pageNumber,
      yPosition: firstRect.y,
      rects: highlightRects,
      selectedText,
    });

    // Clear the text selection
    window.getSelection()?.removeAllRanges();
  }, [annotationCtx, documentId, pageNumber]);

  // Handle annotation highlight click — set active annotation + scroll
  const handleAnnotationClick = useCallback(
    (commentId: string) => {
      annotationCtx?.setActiveAnnotationId(commentId);
    },
    [annotationCtx],
  );

  const container = fullscreen
    ? "fixed inset-0 z-50 bg-gray-900 flex flex-col items-stretch overflow-hidden"
    : "flex flex-col bg-gray-100 h-full overflow-hidden";

  if (fetchError) {
    return <div className="p-8 text-red-500 text-sm">{fetchError}</div>;
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={container}>
      {/* Toolbar */}
      <div className="w-full flex items-center justify-between px-4 py-2 bg-surface-card border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 tabular-nums">
            {pageNumber} / {numPages || "—"}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)))}
            className="p-1 rounded hover:bg-gray-100"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale(1)}
            className="text-sm text-gray-600 w-12 text-center tabular-nums hover:text-brand"
            title="Fit width"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}
            className="p-1 rounded hover:bg-gray-100"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1 rounded hover:bg-gray-100"
            title="Rotate"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="p-1 rounded hover:bg-gray-100"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          {onOcrClick && (
            <button
              onClick={onOcrClick}
              className="px-2 py-1 text-[11px] border border-edge-chip rounded-[5px] hover:bg-surface-hover"
            >
              {t("margin.ocrText")}
            </button>
          )}
        </div>
      </div>

      {/* PDF Page + Margin */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 flex justify-center">
        <Document
          file={blobUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="p-8 text-gray-400 text-sm">Loading PDF...</div>}
        >
          <div className="flex gap-0 items-start">
            {/* PDF page */}
            <div
              ref={pageContainerRef}
              className="relative"
              onMouseUp={handleMouseUp}
            >
              <Page
                pageNumber={pageNumber}
                width={renderedWidth}
                rotate={rotation}
                className="shadow-lg"
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />

              {/* Annotation highlights overlay */}
              {documentId && pageAnnotations.length > 0 && (
                <AnnotationLayerComponent
                  annotations={pageAnnotations}
                  pageWidth={pageContainerRef.current?.offsetWidth ?? renderedWidth}
                  pageHeight={pageContainerRef.current?.offsetHeight ?? 0}
                  onAnnotationClick={handleAnnotationClick}
                  activeAnnotationId={annotationCtx?.activeAnnotationId}
                />
              )}
            </div>

            {/* Comment margin (desktop only) */}
            {documentId && !isMobile && (
              <MarginComments
                documentId={documentId}
                annotations={annotations}
                comments={comments}
                pageNumber={pageNumber}
                pageHeight={pageContainerRef.current?.offsetHeight ?? 0}
                pageWidth={pageContainerRef.current?.offsetWidth ?? renderedWidth}
              />
            )}
          </div>
        </Document>
      </div>
    </div>
  );
}
