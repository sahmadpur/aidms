"use client";

import { useTranslations } from "next-intl";

type Bucket = "empty" | "weak" | "fair" | "good" | "strong";

function score(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[a-z]/.test(pw)) s += 1;
  if (/[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}

function bucket(pw: string): Bucket {
  if (!pw) return "empty";
  const s = score(pw);
  if (s <= 2) return "weak";
  if (s === 3) return "fair";
  if (s === 4) return "good";
  return "strong";
}

const FILL_BY_BUCKET: Record<Bucket, number> = {
  empty: 0,
  weak: 1,
  fair: 2,
  good: 3,
  strong: 4,
};

export function PasswordStrengthMeter({ value }: { value: string }) {
  const t = useTranslations("auth.passwordStrength");
  const b = bucket(value);
  const filled = FILL_BY_BUCKET[b];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 transition-colors ${
              i < filled ? "bg-brand-accent" : "bg-ink/10"
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] tracking-[0.22em] uppercase text-ink-soft">
        <span>{t("label")}</span>
        <span className={b === "empty" ? "opacity-40" : ""}>
          {b === "empty" ? "—" : t(b)}
        </span>
      </div>
    </div>
  );
}
