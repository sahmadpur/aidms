"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import SearchResults from "@/components/SearchResults";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import api from "@/lib/api";
import { DOC_TYPES, localizedName, type Department } from "@/lib/types";
import { useSearch, type SearchFilters } from "@/lib/useSearch";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const LANGUAGES = ["az", "ru", "en"] as const;

export default function SearchPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { results, loading, error, query, elapsedMs, hasSearched, search } =
    useSearch();

  const [docType, setDocType] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [language, setLanguage] = useState<string>("");

  const { data: departments = [] } = useSWR<Department[]>(
    "/admin/departments",
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => now - i);
  }, []);

  function runSearch(q: string) {
    const filters: SearchFilters = {};
    if (docType) filters.doc_type = docType;
    if (departmentId) filters.department_id = departmentId;
    if (year) filters.year = Number(year);
    if (language) filters.language = language;
    search(q, filters);
  }

  function chooseExample(q: string) {
    setDocType("");
    setDepartmentId("");
    setYear("");
    setLanguage("");
    search(q);
  }

  const examples = (t.raw("search.examples") as string[]) ?? [];

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("search.title")}</TopBarTitle>
      </TopBar>

      <div className="px-[22px] py-10 md:py-14 max-w-3xl mx-auto">
        {/* Hero — section caption + serif subtitle anchor the page */}
        <div className="mb-7">
          <div className="text-[10.5px] uppercase tracking-[3.5px] text-brand font-medium">
            {t("search.heading")}
          </div>
          <div
            aria-hidden
            className="mt-2 h-px w-10 bg-brand-accent"
          />
          <p className="mt-3 font-display text-[15.5px] italic text-ink-soft">
            {t("search.subheading")}
          </p>
        </div>

        <SearchBar onSearch={runSearch} loading={loading} initialQuery={query} />

        {/* Filter shelf */}
        <div className="mt-4 flex items-center flex-wrap gap-x-2 gap-y-2">
          <FilterPill
            value={docType}
            onChange={setDocType}
            placeholder={t("filters.type")}
            options={DOC_TYPES.map((tp) => ({
              value: tp,
              label: t(`docType.${tp}`),
            }))}
          />
          <FilterPill
            value={departmentId}
            onChange={setDepartmentId}
            placeholder={t("filters.department")}
            options={departments.map((d) => ({
              value: d.id,
              label: localizedName(d, locale),
            }))}
          />
          <FilterPill
            value={year}
            onChange={setYear}
            placeholder={t("filters.year")}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <FilterPill
            value={language}
            onChange={setLanguage}
            placeholder={t("common.language")}
            options={LANGUAGES.map((l) => ({
              value: l,
              label: l.toUpperCase(),
            }))}
          />
          <span className="ml-auto hidden md:inline-flex items-center gap-1.5 text-[10.5px] text-ink-soft/80 italic">
            <kbd className="font-mono not-italic text-[10px] px-1.5 py-0.5 rounded border border-edge-soft bg-surface-card">
              /
            </kbd>
            {t("search.focusHint")}
          </span>
        </div>

        {/* Match-count strip */}
        {hasSearched && !loading && !error && (
          <div className="mt-9 mb-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-edge-soft" aria-hidden />
            <span className="font-display italic text-[12.5px] text-ink-soft">
              {results.length === 0
                ? t("search.summaryNone")
                : t("search.summary", {
                    count: results.length,
                    ms: elapsedMs ?? 0,
                  })}
            </span>
            <span className="h-px flex-1 bg-edge-soft" aria-hidden />
          </div>
        )}

        {/* States */}
        {loading && <ResultsSkeleton />}

        {!loading && error && (
          <p className="mt-8 text-center text-[13px] text-danger-fg">{error}</p>
        )}

        {!loading && !error && hasSearched && results.length === 0 && (
          <NoMatch query={query} />
        )}

        {!loading && !error && results.length > 0 && (
          <div className="mt-2">
            <SearchResults results={results} />
          </div>
        )}

        {!hasSearched && !loading && (
          <EmptyState examples={examples} onPick={chooseExample} />
        )}
      </div>
    </>
  );
}

/* ---------- Filter pill ---------- */

interface PillOption {
  value: string;
  label: string;
}

function FilterPill({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: PillOption[];
}) {
  const active = !!value;
  const label = active
    ? options.find((o) => o.value === value)?.label ?? placeholder
    : placeholder;
  return (
    <label
      className={`relative inline-flex items-center gap-1 text-[11.5px] rounded-full pl-3 pr-7 py-[5px] cursor-pointer transition-colors border ${
        active
          ? "bg-surface-chipActive border-edge-chip text-brand-deep"
          : "bg-surface-card border-edge-soft text-ink-soft hover:border-edge-chip hover:text-ink"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        aria-hidden
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] opacity-60"
      >
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------- Empty state ---------- */

function EmptyState({
  examples,
  onPick,
}: {
  examples: string[];
  onPick: (q: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className="mt-10 text-center">
      <div
        aria-hidden
        className="mx-auto w-8 h-8 mb-5 rounded-full grid place-items-center text-brand-accent border border-edge-chip"
      >
        ✦
      </div>
      <h2 className="font-display text-[22px] md:text-[24px] font-medium text-ink leading-tight">
        {t("search.emptyHeading")}
      </h2>
      <p className="mt-2 text-[13px] text-ink-soft max-w-md mx-auto leading-relaxed">
        {t("search.emptyBody")}
      </p>

      {examples.length > 0 && (
        <div className="mt-7">
          <div className="text-[10px] uppercase tracking-[2.5px] text-ink-soft/70 mb-3">
            {t("search.tryLabel")}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {examples.map((q) => (
              <button
                key={q}
                onClick={() => onPick(q)}
                className="text-[12.5px] italic text-brand-deep border border-edge-soft hover:border-brand-accent hover:bg-surface-chipActive bg-surface-card px-3 py-1.5 rounded-full transition-colors font-display"
              >
                &ldquo;{q}&rdquo;
              </button>
            ))}
          </div>
        </div>
      )}

      <a
        href="/chat"
        className="mt-9 inline-flex items-center gap-2 text-[12px] text-brand hover:text-brand-deep border-b border-dotted border-brand/40 hover:border-brand-deep pb-px transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t("search.chatHint")}
      </a>
    </div>
  );
}

/* ---------- No match ---------- */

function NoMatch({ query }: { query: string }) {
  const t = useTranslations();
  return (
    <div className="mt-8 text-center py-12 border border-dashed border-edge-soft rounded-lg bg-surface-card/40">
      <h2 className="font-display text-[19px] font-medium text-ink">
        {t("search.noMatchHeading")}
      </h2>
      <p className="mt-2 text-[13px] text-ink-soft">
        {t.rich("search.noMatchBody", {
          q: () => (
            <span className="font-display italic text-ink">&laquo;{query}&raquo;</span>
          ),
        })}
      </p>
    </div>
  );
}

/* ---------- Skeleton ---------- */

function ResultsSkeleton() {
  return (
    <ul className="mt-9 space-y-3">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="relative pl-5 pr-4 py-4 rounded-[6px] bg-surface-card border border-edge-soft animate-pulse"
        >
          <span
            aria-hidden
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-sm bg-edge-soft"
          />
          <div className="h-2.5 w-40 bg-edge-soft rounded mb-3" />
          <div className="h-4 w-3/4 bg-edge-soft rounded mb-3" />
          <div className="h-3 w-full bg-edge-soft/70 rounded mb-1.5" />
          <div className="h-3 w-5/6 bg-edge-soft/70 rounded" />
        </li>
      ))}
    </ul>
  );
}
