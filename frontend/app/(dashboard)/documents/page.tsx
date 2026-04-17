"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { FileText, Loader2, Trash2, ExternalLink, Search } from "lucide-react";
import DocumentUploader from "@/components/DocumentUploader";
import api from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const OCR_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function DocumentsPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
      setPage(1);
    }, 400);
  }

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  const swrKey = debouncedQuery
    ? `/documents?page=${page}&page_size=20&q=${encodeURIComponent(debouncedQuery)}`
    : `/documents?page=${page}&page_size=20`;

  const { data, isLoading, mutate } = useSWR(swrKey, fetcher, {
    refreshInterval: 5000, // refresh every 5s to catch OCR status updates
  });

  async function deleteDocument(id: string) {
    if (!confirm(t("documents.confirmDelete"))) return;
    await api.delete(`/documents/${id}`);
    mutate();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{t("documents.title")}</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("documents.searchPlaceholder")}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        />
      </div>

      <DocumentUploader onUploadComplete={() => mutate()} />

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && data?.items?.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">{t("documents.noDocuments")}</p>
      )}

      {data?.items && data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((doc: any) => (
            <li
              key={doc.id}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    OCR_STATUS_COLORS[doc.ocr_status] || OCR_STATUS_COLORS.pending
                  }`}
                >
                  {t(`ocr.${doc.ocr_status}`)}
                </span>
                <Link
                  href={`/documents/${doc.id}`}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => deleteDocument(doc.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > 20 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 flex items-center px-2">
            {page} / {Math.ceil(data.total / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(data.total / 20)}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
