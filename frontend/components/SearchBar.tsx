"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

interface Props {
  onSearch: (query: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const t = useTranslations();
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="w-full pl-10 pr-4 py-2 border border-edge-chip rounded-[6px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="px-5 py-2 bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50 text-[13px] font-medium"
      >
        {loading ? "..." : t("common.search")}
      </button>
    </form>
  );
}
