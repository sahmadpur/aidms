"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

const LOCALES = [
  { value: "en", label: "EN" },
  { value: "az", label: "AZ" },
  { value: "ru", label: "RU" },
];

export default function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();

  function switchLocale(newLocale: string) {
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-0 border border-edge-chip rounded-full p-[2px] bg-white">
      {LOCALES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => switchLocale(value)}
          aria-pressed={locale === value}
          className={`px-2 py-0.5 text-[10px] font-mono tracking-[0.18em] uppercase rounded-full transition-colors ${
            locale === value
              ? "bg-brand text-brand-pale"
              : "text-gray-500 hover:text-brand"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
