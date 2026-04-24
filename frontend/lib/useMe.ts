"use client";

import useSWR from "swr";
import api from "./api";

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  language_preference: "az" | "ru" | "en";
  is_active: boolean;
  managed_department_ids: string[];
  created_at: string;
  updated_at: string;
}

const fetcher = (url: string) => api.get<Me>(url).then((r) => r.data);

export function useMe() {
  return useSWR<Me>("/users/me", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
