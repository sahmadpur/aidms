"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  AlignLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Download,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";

interface Props {
  ocrText: string;
  ocrStatus?: "pending" | "processing" | "completed" | "failed" | null;
  language?: string | null;
  documentTitle?: string | null;
}

type ViewMode = "reading" | "raw";

const HIGHLIGHT_LIMIT = 1000;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Segment {
  type: "text" | "match";
  content: string;
  matchIdx?: number;
}

function buildSegments(text: string, query: string): Segment[] {
  if (!query.trim()) return [{ type: "text", content: text }];
  const re = new RegExp(escapeRegExp(query), "gi");
  const out: Segment[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      out.push({ type: "text", content: text.slice(cursor, m.index) });
    }
    out.push({ type: "match", content: m[0], matchIdx: i });
    cursor = m.index + m[0].length;
    i++;
    if (i >= HIGHLIGHT_LIMIT) break;
    // Guard against zero-width regex matches (shouldn't happen with literal escape, but safe)
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (cursor < text.length) {
    out.push({ type: "text", content: text.slice(cursor) });
  }
  return out;
}

export default function OCRTextPanel({
  ocrText,
  ocrStatus = null,
  language,
  documentTitle,
}: Props) {
  const t = useTranslations();

  const [view, setView] = useState<ViewMode>("reading");
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const text = ocrText ?? "";

  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return { words, chars: text.length };
  }, [text]);

  const segments = useMemo(() => buildSegments(text, query), [text, query]);
  const matchCount = useMemo(
    () => segments.filter((s) => s.type === "match").length,
    [segments]
  );

  // Reset/clamp active match when matches change.
  useEffect(() => {
    if (matchCount === 0) setActiveMatch(0);
    else if (activeMatch >= matchCount) setActiveMatch(0);
  }, [matchCount, activeMatch]);

  // Open search bar with Cmd/Ctrl+F when this panel is mounted/visible.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        // Only intercept if user isn't already in a different input outside this panel.
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setQuery("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // Scroll the active match into view whenever it changes.
  useLayoutEffect(() => {
    if (!query) return;
    const root = scrollerRef.current;
    if (!root) return;
    const node = root.querySelector<HTMLElement>(
      `[data-match-idx="${activeMatch}"]`
    );
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatch, query, view]);

  function nextMatch() {
    if (matchCount === 0) return;
    setActiveMatch((i) => (i + 1) % matchCount);
  }
  function prevMatch() {
    if (matchCount === 0) return;
    setActiveMatch((i) => (i - 1 + matchCount) % matchCount);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  function handleDownload() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeName = (documentTitle || "ocr-text")
      .replace(/[^\p{L}\p{N}_-]+/gu, "_")
      .slice(0, 80);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName || "ocr-text"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Status banners — shown when there's no usable OCR text yet.
  if (!text) {
    return (
      <div className="flex h-full flex-col">
        <PanelChrome
          stats={stats}
          language={language}
          view={view}
          onViewChange={setView}
          searchOpen={searchOpen}
          onSearchToggle={() => {
            setSearchOpen((v) => !v);
            if (!searchOpen) {
              setTimeout(() => searchInputRef.current?.focus(), 0);
            } else {
              setQuery("");
            }
          }}
          query={query}
          onQueryChange={setQuery}
          searchInputRef={searchInputRef}
          activeMatch={activeMatch}
          matchCount={matchCount}
          onPrev={prevMatch}
          onNext={nextMatch}
          onCopy={handleCopy}
          onDownload={handleDownload}
          copied={copied}
          disabled
        />
        <EmptyOCR status={ocrStatus} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PanelChrome
        stats={stats}
        language={language}
        view={view}
        onViewChange={setView}
        searchOpen={searchOpen}
        onSearchToggle={() => {
          setSearchOpen((v) => !v);
          if (!searchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 0);
          } else {
            setQuery("");
          }
        }}
        query={query}
        onQueryChange={setQuery}
        searchInputRef={searchInputRef}
        activeMatch={activeMatch}
        matchCount={matchCount}
        onPrev={prevMatch}
        onNext={nextMatch}
        onCopy={handleCopy}
        onDownload={handleDownload}
        copied={copied}
      />
      <div
        ref={scrollerRef}
        className="flex-1 overflow-auto bg-[linear-gradient(180deg,#fff_0%,#fbfdf6_100%)]"
      >
        {view === "reading" ? (
          <ReadingView segments={segments} activeMatch={activeMatch} />
        ) : (
          <RawView text={text} segments={segments} activeMatch={activeMatch} />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Toolbar                                                         */
/* ---------------------------------------------------------------- */

interface ChromeProps {
  stats: { words: number; chars: number };
  language?: string | null;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  searchOpen: boolean;
  onSearchToggle: () => void;
  query: string;
  onQueryChange: (v: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  activeMatch: number;
  matchCount: number;
  onPrev: () => void;
  onNext: () => void;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
  disabled?: boolean;
}

function PanelChrome(p: ChromeProps) {
  const t = useTranslations();
  return (
    <div className="border-b border-edge-soft bg-white">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-brand" />
          <span className="text-[12px] font-semibold tracking-wide text-brand">
            {t("ocrPanel.title")}
          </span>
          <span className="hidden sm:inline-flex items-center gap-2 text-[11px] text-gray-500 ml-1">
            <span className="h-3 w-px bg-edge-soft" />
            <span>
              {p.stats.words.toLocaleString()} {t("ocrPanel.words")}
            </span>
            {p.language && (
              <>
                <span className="h-3 w-px bg-edge-soft" />
                <span className="px-1.5 py-px rounded bg-surface-chipActive text-brand text-[10px] uppercase tracking-wider">
                  {p.language}
                </span>
              </>
            )}
          </span>
        </div>

        <div className="flex-1 flex justify-center">
          {p.searchOpen && !p.disabled ? (
            <div className="flex items-center gap-1 w-full max-w-md bg-surface-hover border border-edge-chip rounded-[6px] px-2 py-1 focus-within:border-edge-focus">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={p.searchInputRef}
                value={p.query}
                onChange={(e) => p.onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) p.onPrev();
                    else p.onNext();
                  }
                }}
                placeholder={t("ocrPanel.searchPlaceholder")}
                className="flex-1 bg-transparent outline-none text-[12.5px] text-gray-800 placeholder:text-gray-400 min-w-0"
              />
              {p.query && (
                <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                  {p.matchCount === 0
                    ? t("ocrPanel.noMatches")
                    : t("ocrPanel.matchCounter", {
                        current: p.activeMatch + 1,
                        total: p.matchCount,
                      })}
                </span>
              )}
              <button
                onClick={p.onPrev}
                disabled={p.matchCount === 0}
                className="p-0.5 rounded hover:bg-white text-gray-500 disabled:opacity-30"
                aria-label={t("ocrPanel.prevMatch")}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={p.onNext}
                disabled={p.matchCount === 0}
                className="p-0.5 rounded hover:bg-white text-gray-500 disabled:opacity-30"
                aria-label={t("ocrPanel.nextMatch")}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  p.onQueryChange("");
                  p.onSearchToggle();
                }}
                className="p-0.5 rounded hover:bg-white text-gray-400"
                aria-label={t("common.close")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!p.searchOpen && (
            <button
              onClick={p.onSearchToggle}
              disabled={p.disabled}
              className="px-2 py-1 rounded-[5px] text-gray-600 hover:bg-surface-hover hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label={t("ocrPanel.search")}
              title={t("ocrPanel.search")}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}

          {/* View toggle pill */}
          <div className="inline-flex items-center bg-surface-hover border border-edge-chip rounded-[6px] p-0.5 ml-1">
            <ViewToggleButton
              active={p.view === "reading"}
              onClick={() => p.onViewChange("reading")}
              icon={<AlignLeft className="w-3 h-3" />}
              label={t("ocrPanel.reading")}
              disabled={p.disabled}
            />
            <ViewToggleButton
              active={p.view === "raw"}
              onClick={() => p.onViewChange("raw")}
              icon={<Code2 className="w-3 h-3" />}
              label={t("ocrPanel.raw")}
              disabled={p.disabled}
            />
          </div>

          <button
            onClick={p.onCopy}
            disabled={p.disabled}
            className="px-2 py-1 rounded-[5px] text-gray-600 hover:bg-surface-hover hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent inline-flex items-center gap-1 text-[11.5px] ml-1"
            title={t("ocrPanel.copy")}
          >
            {p.copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-brand-accent" />
                <span className="hidden md:inline">{t("ocrPanel.copied")}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t("ocrPanel.copy")}</span>
              </>
            )}
          </button>
          <button
            onClick={p.onDownload}
            disabled={p.disabled}
            className="px-2 py-1 rounded-[5px] text-gray-600 hover:bg-surface-hover hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent inline-flex items-center gap-1 text-[11.5px]"
            title={t("ocrPanel.download")}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">.txt</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-0.5 rounded-[4px] text-[11px] inline-flex items-center gap-1 transition-colors ${
        active
          ? "bg-white text-brand shadow-[0_1px_2px_rgba(45,80,22,0.08)]"
          : "text-gray-500 hover:text-brand"
      } disabled:opacity-40`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/*  Reading view                                                    */
/* ---------------------------------------------------------------- */

function ReadingView({
  segments,
  activeMatch,
}: {
  segments: Segment[];
  activeMatch: number;
}) {
  return (
    <article className="mx-auto max-w-3xl px-8 py-10 font-brand text-[14.5px] leading-[1.85] text-ink whitespace-pre-wrap selection:bg-brand-pale selection:text-brand-deep">
      {segments.map((seg, i) =>
        seg.type === "match" ? (
          <Mark key={i} idx={seg.matchIdx!} active={seg.matchIdx === activeMatch}>
            {seg.content}
          </Mark>
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- */
/*  Raw view (with line-number gutter)                              */
/* ---------------------------------------------------------------- */

function RawView({
  text,
  segments,
  activeMatch,
}: {
  text: string;
  segments: Segment[];
  activeMatch: number;
}) {
  // We need to render line numbers, but search highlights need to span as one
  // segment list. Strategy: walk segments while breaking text on \n. Each line
  // becomes a row with its own `<pre>` content that includes the appropriate
  // highlight nodes.
  const lines = useMemo(() => {
    const rows: React.ReactNode[][] = [[]];
    segments.forEach((seg, segIdx) => {
      const parts = seg.content.split("\n");
      parts.forEach((p, pi) => {
        if (pi > 0) rows.push([]);
        if (p === "") return;
        if (seg.type === "match") {
          rows[rows.length - 1].push(
            <Mark
              key={`${segIdx}-${pi}`}
              idx={seg.matchIdx!}
              active={seg.matchIdx === activeMatch}
            >
              {p}
            </Mark>
          );
        } else {
          rows[rows.length - 1].push(<span key={`${segIdx}-${pi}`}>{p}</span>);
        }
      });
    });
    return rows;
  }, [segments, activeMatch]);

  const totalLines = lines.length;
  const gutterWidth = String(totalLines).length;

  return (
    <div className="font-mono text-[12px] leading-[1.65] text-ink">
      <div className="flex">
        <div
          className="select-none text-right pr-3 pl-4 py-6 text-gray-400 bg-[#f7f9f3] border-r border-edge-soft"
          style={{ minWidth: `${gutterWidth + 4}ch` }}
          aria-hidden
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 px-4 py-6 whitespace-pre-wrap break-words m-0">
          {lines.map((row, i) => (
            <div key={i}>{row.length === 0 ? " " : row}</div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Mark — search highlight                                         */
/* ---------------------------------------------------------------- */

function Mark({
  idx,
  active,
  children,
}: {
  idx: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <mark
      data-match-idx={idx}
      className={
        active
          ? "rounded-[2px] px-[1px] bg-brand-accent text-brand-pale shadow-[0_0_0_1.5px_rgba(125,181,66,0.35)]"
          : "rounded-[2px] px-[1px] bg-brand-pale text-brand-deep"
      }
    >
      {children}
    </mark>
  );
}

/* ---------------------------------------------------------------- */
/*  Empty / status state                                            */
/* ---------------------------------------------------------------- */

function EmptyOCR({
  status,
}: {
  status: "pending" | "processing" | "completed" | "failed" | null;
}) {
  const t = useTranslations();
  const isWorking = status === "pending" || status === "processing";
  const failed = status === "failed";

  const heading =
    status === "processing"
      ? t("ocrPanel.empty.processingHeading")
      : status === "pending"
      ? t("ocrPanel.empty.pendingHeading")
      : failed
      ? t("ocrPanel.empty.failedHeading")
      : t("ocrPanel.empty.emptyHeading");

  const body =
    status === "processing"
      ? t("ocrPanel.empty.processingBody")
      : status === "pending"
      ? t("ocrPanel.empty.pendingBody")
      : failed
      ? t("ocrPanel.empty.failedBody")
      : t("ocrPanel.empty.emptyBody");

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-surface-chipActive flex items-center justify-center">
          {isWorking ? (
            <Loader2 className="w-6 h-6 text-brand animate-spin" />
          ) : failed ? (
            <X className="w-6 h-6 text-[#c94949]" />
          ) : (
            <FileText className="w-6 h-6 text-brand" />
          )}
        </div>
        <h3 className="font-display text-[18px] text-brand-deep mb-1.5">
          {heading}
        </h3>
        <p className="text-[12.5px] text-gray-600 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
