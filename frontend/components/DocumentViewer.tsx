"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import api from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface Props {
  fileUrl: string;
}

const SCROLL_PADDING = 32; // matches the px-4 + small breathing room on the page wrapper

export default function DocumentViewer({ fileUrl }: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  // `scale` is now a multiplier applied on top of fit-to-width — scale=1
  // means the page exactly matches the container width; zoom in/out lets the
  // user grow/shrink relative to that.
  const [scale, setScale] = useState(1.0);
  const [fullscreen, setFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  const scrollRef = useRef<HTMLDivElement>(null);

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
      const w = el.clientWidth - SCROLL_PADDING;
      if (w > 0) setContainerWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [blobUrl, fullscreen]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

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
      <div className="w-full flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
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
            onClick={() => setFullscreen((f) => !f)}
            className="p-1 rounded hover:bg-gray-100"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PDF Page */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 flex justify-center">
        <Document
          file={blobUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="p-8 text-gray-400 text-sm">Loading PDF...</div>}
        >
          <Page
            pageNumber={pageNumber}
            width={containerWidth * scale}
            className="shadow-lg"
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}
