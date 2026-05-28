"use client";

import { useCallback, useState } from "react";
import api from "./api";

export interface SearchResult {
  document_id: string;
  document_title: string;
  snippet: string;
  page_number: number;
  relevance_score: number;
  ocr_status: string;
  category_id: string | null;
  language: string | null;
  upload_date: string;
}

export interface SearchFilters {
  doc_type?: string;
  category_id?: string;
  department_id?: string;
  folder_id?: string;
  tags?: string[];
  language?: string;
  year?: number;          // resolved to date_from/date_to client-side
  date_from?: string;
  date_to?: string;
}

function filtersToBody(q: string, f: SearchFilters): Record<string, unknown> {
  const body: Record<string, unknown> = { query: q };
  if (f.doc_type) body.doc_type = f.doc_type;
  if (f.category_id) body.category_id = f.category_id;
  if (f.department_id) body.department_id = f.department_id;
  if (f.folder_id) body.folder_id = f.folder_id;
  if (f.language) body.language = f.language;
  if (f.tags?.length) body.tags = f.tags;
  if (f.date_from) body.date_from = f.date_from;
  if (f.date_to) body.date_to = f.date_to;
  if (f.year && !f.date_from && !f.date_to) {
    body.date_from = `${f.year}-01-01`;
    body.date_to = `${f.year}-12-31`;
  }
  return body;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async (q: string, filters: SearchFilters = {}) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setQuery(q);
    const started = performance.now();

    try {
      const { data } = await api.post("/search", filtersToBody(q, filters));
      setResults(data.results);
      setElapsedMs(Math.round(performance.now() - started));
      setHasSearched(true);
    } catch {
      setError("Search failed. Please try again.");
      setResults([]);
      setElapsedMs(null);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, query, elapsedMs, hasSearched, search };
}
