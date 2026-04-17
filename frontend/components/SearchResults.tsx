"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import type { SearchResult } from "@/lib/useSearch";

interface Props {
  results: SearchResult[];
  query: string;
}

export default function SearchResults({ results, query }: Props) {
  const t = useTranslations("search");

  if (!query) return null;

  if (results.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">{t("noResults")}</p>;
  }

  return (
    <ul className="space-y-3">
      {results.map((r) => (
        <li key={`${r.document_id}-${r.page_number}`}>
          <Link href={`/documents/${r.document_id}`}>
            <div className="bg-surface-card border border-edge-soft rounded-[10px] p-4 hover:border-brand-accent transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-brand-accent flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {r.document_title}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {r.page_number > 0 && (
                    <span className="text-xs text-gray-400">
                      {t("page")} {r.page_number}
                    </span>
                  )}
                  <span className="text-xs text-[#3b6d11] font-medium bg-surface-chipActive px-2 py-0.5 rounded-full">
                    {Math.round(r.relevance_score * 100)}%
                  </span>
                </div>
              </div>
              <p
                className="mt-2 text-sm text-gray-600 line-clamp-3"
                dangerouslySetInnerHTML={{ __html: r.snippet }}
              />
              <p className="mt-1 text-xs text-gray-400">{r.upload_date?.split("T")[0]}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
