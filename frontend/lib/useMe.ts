"use client";

import useSWR from "swr";
import api, { API_URL } from "./api";

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  language_preference: "az" | "ru" | "en" | "uz";
  is_active: boolean;
  avatar_url: string | null;
  notify_mentions: boolean;
  notify_doc_approvals: boolean;
  notify_ocr_complete: boolean;
  email_notify_mentions: boolean;
  email_notify_doc_approvals: boolean;
  email_notify_ocr_complete: boolean;
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

/**
 * Build a URL for a user's avatar image. Returns null when the user has no
 * avatar uploaded (caller should fall back to initials). The `?v=` cache-bust
 * uses updated_at so a new upload invalidates the browser cache immediately.
 */
export function avatarUrl(
  user: { id: string; avatar_url: string | null; updated_at: string } | null | undefined,
): string | null {
  if (!user || !user.avatar_url) return null;
  return `${API_URL}/users/${user.id}/avatar?v=${encodeURIComponent(user.updated_at)}`;
}
