"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X, CornerDownLeft } from "lucide-react";

interface Props {
  onSearch: (query: string) => void;
  loading?: boolean;
  initialQuery?: string;
}

export default function SearchBar({ onSearch, loading, initialQuery = "" }: Props) {
  const t = useTranslations();
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere on the page to focus the search input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q) onSearch(q);
  }

  function clear() {
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="group">
      <div
        className={`relative flex items-center gap-3 pb-2.5 transition-colors border-b ${
          focused
            ? "border-brand-accent"
            : "border-edge-chip group-hover:border-brand-accent/60"
        }`}
      >
        <Search
          className={`w-5 h-5 flex-shrink-0 transition-colors ${
            focused ? "text-brand" : "text-ink-soft"
          }`}
          strokeWidth={1.5}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t("search.placeholder")}
          autoFocus
          spellCheck={false}
          className="flex-1 bg-transparent outline-none border-0 py-2 text-[22px] md:text-[26px] font-display font-light tracking-tight placeholder:text-ink-soft/55 placeholder:italic text-ink"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label={t("common.close")}
            className="flex-shrink-0 w-7 h-7 grid place-items-center rounded-full text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.6} />
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[1.2px] font-medium text-brand-deep border border-edge-chip rounded-[4px] bg-surface-card hover:bg-surface-chipActive disabled:opacity-40 disabled:hover:bg-surface-card transition-colors"
        >
          {loading ? (
            <span className="inline-block w-3 h-3 rounded-full border border-brand border-t-transparent animate-spin" />
          ) : (
            <CornerDownLeft className="w-3 h-3" strokeWidth={1.8} />
          )}
          {t("common.search")}
        </button>
      </div>
    </form>
  );
}
