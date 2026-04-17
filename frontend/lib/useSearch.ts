"use client";

import { useState, useCallback } from "react";
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
  category_id?: string;
  tags?: string[];
  language?: string;
  date_from?: string;
  date_to?: string;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const search = useCallback(async (q: string, filters: SearchFilters = {}) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setQuery(q);

    try {
      const { data } = await api.post("/search", { query: q, ...filters });
      setResults(data.results);
    } catch {
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, query, search };
}
