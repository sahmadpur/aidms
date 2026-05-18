"use client";

import { useTranslations } from "next-intl";
import SearchBar from "@/components/SearchBar";
import SearchResults from "@/components/SearchResults";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { useSearch } from "@/lib/useSearch";

export default function SearchPage() {
  const t = useTranslations("search");
  const { results, loading, error, query, search } = useSearch();

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("title")}</TopBarTitle>
      </TopBar>
      <div className="px-[22px] py-4 max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4 min-w-0">
          <SearchBar onSearch={search} loading={loading} />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <SearchResults results={results} query={query} />
        </div>
        <aside className="bg-surface-card border border-edge-soft rounded-[10px] p-4 h-fit md:sticky md:top-4 text-[13px] space-y-3">
          <div className="text-[11px] font-semibold text-brand uppercase tracking-[0.9px]">
            {t("instructionsTitle")}
          </div>
          <ul className="space-y-2 text-gray-700 list-disc pl-4 leading-snug">
            <li>{t("tips.keywords")}</li>
            <li>{t("tips.phrasing")}</li>
            <li>{t("tips.filters")}</li>
            <li>{t("tips.open")}</li>
            <li>{t("tips.aiChat")}</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
