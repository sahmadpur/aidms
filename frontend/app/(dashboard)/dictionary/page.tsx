"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Search, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { FilterBar, FilterChip } from "@/components/FilterBar";

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

function pickLang(e: DictionaryEntry, locale: string): { term: string; definition: string } {
  if (locale === "az") return { term: e.term_az, definition: e.definition_az };
  if (locale === "ru") return { term: e.term_ru, definition: e.definition_ru };
  return { term: e.term_en, definition: e.definition_en };
}

export default function DictionaryPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [scope, setScope] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: scopes = [] } = useSWR<Scope[]>("/dictionary/scopes", fetcher);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (scope) p.set("scope", scope);
    if (search) p.set("q", search);
    p.set("limit", "500");
    return p.toString();
  }, [scope, search]);

  const { data, isLoading } = useSWR<ListResponse>(`/dictionary?${qs}`, fetcher);

  const scopeByKey = useMemo(() => {
    const m = new Map<string, Scope>();
    scopes.forEach((s) => m.set(s.key, s));
    return m;
  }, [scopes]);

  function scopeLabel(key: string): string {
    const s = scopeByKey.get(key);
    return s ? pickScopeName(s, locale) : key;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("dictionary.title")}</TopBarTitle>
        <div className="flex-1 max-w-[420px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dictionary.search")}
            className="w-full pl-8 pr-3 py-1.5 border border-edge-chip rounded-[6px] text-[12px] bg-white outline-none focus:border-edge-focus"
          />
        </div>
      </TopBar>

      <FilterBar>
        <FilterChip active={scope === ""} onClick={() => setScope("")}>
          {t("filters.all")}
        </FilterChip>
        {scopes.map((s) => (
          <FilterChip key={s.id} active={scope === s.key} onClick={() => setScope(s.key)}>
            {pickScopeName(s, locale)}
          </FilterChip>
        ))}
      </FilterBar>

      <div className="px-[22px] py-4 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-[12.5px] text-gray-500 italic py-10 text-center">
            {t("dictionary.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.items.map((e) => {
              const main = pickLang(e, locale);
              const isOpen = expanded.has(e.id);
              return (
                <li
                  key={e.id}
                  className="bg-surface-card border border-edge-soft rounded-[10px] px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => toggle(e.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-gray-900">
                        {main.term}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-surface-chipActive text-[#3b6d11] text-[10px] font-medium">
                        {scopeLabel(e.scope)}
                      </span>
                    </div>
                    <p
                      className={
                        "text-[12.5px] text-gray-700 mt-1 whitespace-pre-wrap " +
                        (isOpen ? "" : "line-clamp-2")
                      }
                    >
                      {main.definition}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
