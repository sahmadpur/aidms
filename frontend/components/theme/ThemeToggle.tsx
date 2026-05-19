"use client";

import { Moon, Monitor, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemePref, useTheme } from "./ThemeProvider";

const ORDER: ThemePref[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const t = useTranslations("theme");

  const Icon =
    pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  const label =
    pref === "light" ? t("light") : pref === "dark" ? t("dark") : t("system");

  const next = () => {
    const idx = ORDER.indexOf(pref);
    const nextPref = ORDER[(idx + 1) % ORDER.length];
    setPref(nextPref);
  };

  return (
    <button
      type="button"
      onClick={next}
      aria-label={t("label")}
      title={t("tooltip", { current: label })}
      className="inline-flex items-center justify-center w-8 h-8 rounded-[6px] border border-edge-chip bg-surface-card text-ink-soft hover:text-brand hover:bg-surface-chipActive transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
