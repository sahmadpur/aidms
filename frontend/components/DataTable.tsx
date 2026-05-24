"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

export type Column<T> = {
  key: string;
  header: ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  hiddenOnMobile?: boolean;
  render: (row: T) => ReactNode;
};

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  minWidth = 900,
  storageKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  minWidth?: number;
  storageKey?: string;
}) {
  const isMobile = useIsMobile();

  // Filter out columns hidden on mobile
  const visibleColumns = useMemo(
    () => (isMobile ? columns.filter((c) => !c.hiddenOnMobile) : columns),
    [columns, isMobile]
  );

  // Column width state — initialized from localStorage or column.width props
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`dt-cols-${storageKey}`);
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {};
  });

  // Persist widths to localStorage when they change
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!storageKey) return;
    if (Object.keys(colWidths).length === 0) return;
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`dt-cols-${storageKey}`, JSON.stringify(colWidths));
      } catch {
        // ignore quota errors
      }
    }, 300);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [colWidths, storageKey]);

  // Drag state refs to avoid re-renders during drag
  const dragRef = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [draggingCol, setDraggingCol] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Get the effective width for a column (state > prop > undefined)
  const getColWidth = useCallback(
    (col: Column<T>): number | undefined => {
      if (colWidths[col.key] !== undefined) return colWidths[col.key];
      if (col.width) return parseInt(col.width, 10) || undefined;
      return undefined;
    },
    [colWidths]
  );

  // Measure the column's actual rendered width if no explicit width is set
  const measureColWidth = useCallback(
    (colKey: string): number => {
      if (!tableRef.current) return 120;
      const thEls = tableRef.current.querySelectorAll("thead th");
      const idx = visibleColumns.findIndex((c) => c.key === colKey);
      if (idx >= 0 && thEls[idx]) {
        return (thEls[idx] as HTMLElement).getBoundingClientRect().width;
      }
      return 120;
    },
    [visibleColumns]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, colKey: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = colWidths[colKey] ?? measureColWidth(colKey);
      dragRef.current = { colKey, startX: e.clientX, startWidth };
      setDraggingCol(colKey);
    },
    [colWidths, measureColWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const newWidth = Math.max(40, dragRef.current.startWidth + delta);
      setColWidths((prev) => ({
        ...prev,
        [dragRef.current!.colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDraggingCol(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="overflow-x-auto rounded-[10px] border border-edge-soft bg-surface-card">
      <table
        ref={tableRef}
        className="w-full border-collapse"
        style={{ minWidth, tableLayout: "fixed" }}
      >
        <thead className="bg-surface-thead">
          <tr>
            {visibleColumns.map((c) => {
              const w = getColWidth(c);
              return (
                <th
                  key={c.key}
                  className={clsx(
                    "relative px-3 py-2.5 text-[11px] font-semibold text-brand-deep border-b border-edge-chip whitespace-nowrap group",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.align !== "right" && c.align !== "center" && "text-left"
                  )}
                  style={w ? { width: `${w}px` } : c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                  {/* Resize handle */}
                  <span
                    onMouseDown={(e) => handleMouseDown(e, c.key)}
                    className={clsx(
                      "absolute right-0 top-0 h-full w-[4px] cursor-col-resize select-none",
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      draggingCol === c.key
                        ? "opacity-100 bg-brand/40"
                        : "hover:bg-edge-chip"
                    )}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length}
                className="py-12 text-center text-ink-soft text-sm"
              >
                {empty ?? "No data."}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-hover">
                {visibleColumns.map((c) => {
                  const w = getColWidth(c);
                  return (
                    <td
                      key={c.key}
                      className={clsx(
                        "px-3 py-2.5 text-[12.5px] text-ink border-b border-edge-soft align-middle",
                        "overflow-hidden text-ellipsis whitespace-nowrap",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center"
                      )}
                      style={w ? { width: `${w}px` } : c.width ? { width: c.width } : undefined}
                    >
                      {c.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
