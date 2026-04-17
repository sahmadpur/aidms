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
      <div className="px-[22px] py-4 space-y-4 max-w-3xl">
        <SearchBar onSearch={search} loading={loading} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <SearchResults results={results} query={query} />
      </div>
    </>
  );
}
