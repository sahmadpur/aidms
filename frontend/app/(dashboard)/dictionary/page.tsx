"use client";

import { Fragment, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Loader2, Search } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { buildSegments } from "@/lib/highlight";

interface DictionaryEntry {
  id: string;
  scope: string;
  term_az: string;
  term_ru: string;
  term_en: string;
  definition_az: string;
  definition_ru: string;
  definition_en: string;
}

interface ListResponse {
  items: DictionaryEntry[];
  total: number;
}

interface Scope {
  id: string;
  key: string;
  name_az: string;
  name_ru: string;
  name_en: string;
}

const fetcher = (url: string) => api.get(url).then((r) => r.data);

function pickScopeName(s: Scope, locale: string): string {
  if (locale === "az") return s.name_az;
  if (locale === "ru") return s.name_ru;
  return s.name_en;
}

function pickLang(
  e: DictionaryEntry,
  locale: string,
): { term: string; definition: string } {
  if (locale === "az") return { term: e.term_az, definition: e.definition_az };
  if (locale === "ru") return { term: e.term_ru, definition: e.definition_ru };
  return { term: e.term_en, definition: e.definition_en };
}

export default function DictionaryPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [scope, setScope] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: scopes = [] } = useSWR<Scope[]>("/dictionary/scopes", fetcher);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (scope) p.set("scope", scope);
    if (search) p.set("q", search);
    p.set("limit", "500");
    return p.toString();
  }, [scope, search]);

  const { data, isLoading } = useSWR<ListResponse>(
    `/dictionary?${qs}`,
    fetcher,
  );

  // Counts per scope (computed from a single "all entries" fetch so the
  // left rail always has the full picture, independent of the current filter).
  const { data: allEntries } = useSWR<ListResponse>(
    "/dictionary?limit=500",
    fetcher,
  );
  const scopeCounts = useMemo(() => {
    const m = new Map<string, number>();
    (allEntries?.items ?? []).forEach((e) =>
      m.set(e.scope, (m.get(e.scope) ?? 0) + 1),
    );
    return m;
  }, [allEntries]);
  const totalCount = allEntries?.items.length ?? 0;

  const scopeByKey = useMemo(() => {
    const m = new Map<string, Scope>();
    scopes.forEach((s) => m.set(s.key, s));
    return m;
  }, [scopes]);

  function scopeLabel(key: string): string {
    const s = scopeByKey.get(key);
    return s ? pickScopeName(s, locale) : key;
  }

  const groups = useMemo(() => {
    const sorted = [...(data?.items ?? [])].sort((a, b) =>
      pickLang(a, locale).term.localeCompare(pickLang(b, locale).term, locale),
    );
    const out = new Map<string, DictionaryEntry[]>();
    for (const e of sorted) {
      const term = pickLang(e, locale).term;
      const letter = (term[0] ?? "").toLocaleUpperCase(locale) || "#";
      const arr = out.get(letter) ?? [];
      arr.push(e);
      out.set(letter, arr);
    }
    return Array.from(out.entries());
  }, [data?.items, locale]);

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("dictionary.title")}</TopBarTitle>
        <div className="flex-1 max-w-[480px] relative ml-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dictionary.searchPlaceholder")}
            className="w-full pl-8 pr-3 py-1.5 border border-edge-chip rounded-[6px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
          />
        </div>
      </TopBar>

      <div className="flex gap-6 px-[22px] py-4 max-w-[1100px]">
        <aside className="w-[220px] flex-shrink-0 sticky top-[80px] self-start space-y-0.5">
          <ScopeLink
            active={scope === ""}
            onClick={() => setScope("")}
            label={t("dictionary.scopeAll")}
            count={totalCount}
          />
          {scopes.map((s) => (
            <ScopeLink
              key={s.id}
              active={scope === s.key}
              onClick={() => setScope(s.key)}
              label={pickScopeName(s, locale)}
              count={scopeCounts.get(s.key) ?? 0}
            />
          ))}
        </aside>

        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-ink-soft" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="text-[12.5px] text-ink-soft italic py-16 text-center">
              {search
                ? t("dictionary.noResultsFor", { q: search })
                : t("dictionary.empty")}
            </p>
          ) : (
            <div className="space-y-10 pb-12">
              {groups.map(([letter, entries]) => (
                <section key={letter}>
                  <h2 className="font-display text-[28px] leading-none text-brand-deep sticky top-[80px] bg-surface py-2 z-0">
                    {letter}
                  </h2>
                  <ul className="mt-2 divide-y divide-edge-soft">
                    {entries.map((e) => (
                      <Entry
                        key={e.id}
                        entry={e}
                        locale={locale}
                        search={search}
                        scopeLabel={scopeLabel(e.scope)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ScopeLink({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center justify-between gap-2 py-1.5 rounded-[6px] text-[13px] transition-colors border-l-[3px] pl-[9px] pr-3 ${
        active
          ? "bg-surface-chipActive text-brand-deep border-brand-accent"
          : "text-ink-soft hover:text-ink hover:bg-surface-hover border-transparent"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-ink-soft">{count}</span>
    </button>
  );
}

function Entry({
  entry,
  locale,
  search,
  scopeLabel,
}: {
  entry: DictionaryEntry;
  locale: string;
  search: string;
  scopeLabel: string;
}) {
  const main = pickLang(entry, locale);
  return (
    <li className="py-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-display text-[18px] text-ink leading-tight">
          <Highlighted text={main.term} needle={search} />
        </h3>
        <span className="inline-block px-1.5 py-0.5 rounded bg-surface-chipActive text-brand-deep text-[10.5px] font-medium font-mono uppercase tracking-wider">
          {scopeLabel}
        </span>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink whitespace-pre-wrap">
        <Highlighted text={main.definition} needle={search} />
      </p>
    </li>
  );
}

function Highlighted({ text, needle }: { text: string; needle: string }) {
  if (!needle.trim()) return <>{text}</>;
  const segs = buildSegments(text, needle);
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="bg-brand-pale text-brand-deep rounded-[2px] px-0.5"
          >
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}
