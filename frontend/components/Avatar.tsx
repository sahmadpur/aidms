"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { avatarUrl, initials } from "@/lib/useMe";

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
 * image fails to load). Use everywhere we previously rendered initials
 * directly so a single component owns the fallback logic.
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
  const [errored, setErrored] = useState(false);
  const url = user ? avatarUrl(user) : null;
  const px = SIZE_PX[size];

  const base = clsx(
    "rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-brand-chip text-brand-pale font-semibold",
    SIZE_TEXT[size],
    className,
  );

  if (url && !errored) {
    return (
      <span
        className={base}
        style={{ width: px, height: px }}
      >
        <img
          src={url}
          alt={user?.full_name ?? ""}
          width={px}
          height={px}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
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
