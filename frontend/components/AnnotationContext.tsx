"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface PendingAnnotation {
  pageNumber: number;
  highlightRects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  }>;
  selectedText: string;
}

export interface CreatingBubble {
  pageNumber: number;
  yPosition: number;
  rects: PendingAnnotation["highlightRects"];
  selectedText: string;
}

interface AnnotationContextValue {
  activeAnnotationId: string | null;
  setActiveAnnotationId: (id: string | null) => void;
  pendingAnnotation: PendingAnnotation | null;
  setPendingAnnotation: (p: PendingAnnotation | null) => void;
  showResolved: boolean;
  setShowResolved: (v: boolean) => void;
  creatingBubble: CreatingBubble | null;
  setCreatingBubble: (b: CreatingBubble | null) => void;
  scrollToPage: (page: number) => void;
  registerScrollToPage: (fn: (page: number) => void) => void;
}

const AnnotationContext = createContext<AnnotationContextValue | null>(null);

export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(
    null,
  );
  const [pendingAnnotation, setPendingAnnotation] =
    useState<PendingAnnotation | null>(null);
  const [showResolved, setShowResolved] = useState(true);
  const [creatingBubble, setCreatingBubble] = useState<CreatingBubble | null>(null);

  const scrollFnRef = useRef<((page: number) => void) | null>(null);

  const registerScrollToPage = useCallback(
    (fn: (page: number) => void) => {
      scrollFnRef.current = fn;
    },
    [],
  );

  const scrollToPage = useCallback((page: number) => {
    scrollFnRef.current?.(page);
  }, []);

  return (
    <AnnotationContext.Provider
      value={{
        activeAnnotationId,
        setActiveAnnotationId,
        pendingAnnotation,
        setPendingAnnotation,
        showResolved,
        setShowResolved,
        creatingBubble,
        setCreatingBubble,
        scrollToPage,
        registerScrollToPage,
      }}
    >
      {children}
    </AnnotationContext.Provider>
  );
}

export function useAnnotation() {
  const ctx = useContext(AnnotationContext);
  if (!ctx) {
    throw new Error("useAnnotation must be used inside an AnnotationProvider");
  }
  return ctx;
}

/**
 * Optional hook that returns null when outside a provider — for components
 * that may render with or without annotation support.
 */
export function useAnnotationOptional() {
  return useContext(AnnotationContext);
}
