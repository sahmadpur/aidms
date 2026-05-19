"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import api from "@/lib/api";
import { initials } from "@/lib/useMe";

type AvatarUser = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  updated_at: string;
};

const SIZE_PX: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 22,
  sm: 28,
  md: 32,
  lg: 48,
  xl: 96,
};

const SIZE_TEXT: Record<"xs" | "sm" | "md" | "lg" | "xl", string> = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-[14px]",
  xl: "text-[28px]",
};

/**
 * Round avatar that prefers the uploaded image and falls back to a
 * brand-coloured initials chip when the user has no avatar (or the
 * image fails to load).
 *
 * The avatar endpoint requires a Bearer token, but browser <img> tags
 * don't go through our axios interceptor — so we fetch the image as a
 * blob (auth header attached) and render the object URL. Same pattern
 * used by DocumentViewer for PDF files.
 */
export function Avatar({
  user,
  size = "md",
  className,
}: {
  user: AvatarUser | null | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const px = SIZE_PX[size];
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Cache-bust the request when avatar_url or updated_at changes — that's
  // how a new upload invalidates the previous blob URL.
  const key = user?.avatar_url ? `${user.id}@${user.updated_at}` : null;

  useEffect(() => {
    if (!user || !user.avatar_url) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    api
      .get(`/users/${user.id}/avatar`, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(res.data);
        setBlobUrl(createdUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setBlobUrl(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const base = clsx(
    "rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-brand-chip text-brand-pale font-semibold",
    SIZE_TEXT[size],
    className,
  );

  if (blobUrl) {
    return (
      <span className={base} style={{ width: px, height: px }}>
        <img
          src={blobUrl}
          alt={user?.full_name ?? ""}
          width={px}
          height={px}
          className="w-full h-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={base} style={{ width: px, height: px }}>
      {initials(user?.full_name ?? "")}
    </span>
  );
}
