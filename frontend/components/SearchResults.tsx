"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import useSWR from "swr";
import api from "@/lib/api";
import type { SearchResult } from "@/lib/useSearch";
import type { Document } from "@/lib/types";

type DocType = "contract" | "invoice" | "report" | "letter" | "permit" | "other";

const ruleClass: Record<DocType, string> = {
  contract: "bg-badge-contract-fg",
  invoice: "bg-badge-invoice-fg",
  report: "bg-badge-report-fg",
  letter: "bg-badge-letter-fg",
  permit: "bg-badge-permit-fg",
  other: "bg-badge-other-fg",
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Props {
  results: SearchResult[];
}

export default function SearchResults({ results }: Props) {
  const t = useTranslations();
  const locale = useLocale();

  // The /search endpoint doesn't return doc_type, so fetch the lean document
  // list once and look up extras (doc_type, display_id, department) by id.
  const { data: docs } = useSWR<{ items: Document[] }>(
    "/documents?page=1&page_size=200",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  const docMap = new Map((docs?.items ?? []).map((d) => [d.id, d]));

  return (
    <ul className="stagger space-y-3">
      {results.map((r, i) => {
        const meta = docMap.get(r.document_id);
        const docType = (meta?.doc_type ?? "other") as DocType;
        const displayId = meta?.display_id ?? null;
        const date = formatDate(r.upload_date, locale);

        return (
          <li key={`${r.document_id}-${r.page_number}-${i}`}>
            <Link
              href={`/documents/${r.document_id}`}
              className="group block relative pl-5 pr-4 py-4 rounded-[6px] bg-surface-card border border-edge-soft hover:border-edge-chip hover:bg-surface-hover transition-colors"
            >
              <span
                className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-sm ${ruleClass[docType]}`}
                aria-hidden
              />

              <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[1.4px] text-ink-soft mb-1.5">
                {displayId && (
                  <span className="font-mono not-italic text-brand-deep">
                    {displayId}
                  </span>
                )}
                {displayId && <Separator />}
                <span className="font-medium">{t(`docType.${docType}`)}</span>
                {date && <Separator />}
                {date && <span>{date}</span>}
              </div>

              <h3 className="font-display text-[18px] md:text-[19px] font-medium text-ink leading-snug pr-12">
                {r.document_title}
              </h3>

              {r.snippet && (
                <p
                  className="search-snippet mt-2 text-[13.5px] leading-relaxed text-ink-soft line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: r.snippet }}
                />
              )}

              <div className="mt-3 flex items-center justify-between text-[11px] text-ink-soft">
                <span className="inline-flex items-center gap-2.5">
                  {r.page_number > 0 && (
                    <span>
                      {t("search.page")} <strong className="text-ink font-medium">{r.page_number}</strong>
                    </span>
                  )}
                  {r.relevance_score > 0 && (
                    <>
                      <Separator />
                      <span className="font-mono text-[10.5px] tracking-wide">
                        {Math.round(r.relevance_score * 100)}%
                      </span>
                    </>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-brand opacity-0 group-hover:opacity-100 transition-opacity">
                  {t("common.open")}
                  <ChevronRight className="w-3 h-3" strokeWidth={2} />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Separator() {
  return <span className="text-edge-chip select-none" aria-hidden>·</span>;
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
