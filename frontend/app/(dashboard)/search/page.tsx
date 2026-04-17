"use client";

import { useTranslations } from "next-intl";
import SearchBar from "@/components/SearchBar";
import SearchResults from "@/components/SearchResults";
import { useSearch } from "@/lib/useSearch";

export default function SearchPage() {
  const t = useTranslations("search");
  const { results, loading, error, query, search } = useSearch();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>

      <SearchBar onSearch={search} loading={loading} />

      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}

      <SearchResults results={results} query={query} />
    </div>
  );
}
