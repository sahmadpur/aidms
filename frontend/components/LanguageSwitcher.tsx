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
    <div className="flex items-center gap-1">
      {LOCALES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => switchLocale(value)}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            locale === value
              ? "bg-primary-100 text-primary-700"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
