"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePref = "light" | "dark" | "system";
export type ThemeResolved = "light" | "dark";

type ThemeContextValue = {
  pref: ThemePref;
  resolved: ThemeResolved;
  setPref: (next: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const COOKIE = "NEXT_THEME";
const LS_KEY = "NEXT_THEME";

function readCookie(): ThemePref | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )NEXT_THEME=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "light" || v === "dark" || v === "system" ? v : null;
}

function writeCookie(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE}=${pref}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

function resolvePref(pref: ThemePref): ThemeResolved {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyResolved(r: ThemeResolved) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", r);
  document.documentElement.style.colorScheme = r;
}

export function ThemeProvider({
  initialPref = "system",
  children,
}: {
  initialPref?: ThemePref;
  children: React.ReactNode;
}) {
  const [pref, setPrefState] = useState<ThemePref>(initialPref);
  const [resolved, setResolved] = useState<ThemeResolved>(() =>
    resolvePref(initialPref),
  );

  useEffect(() => {
    const stored =
      readCookie() ??
      ((typeof localStorage !== "undefined"
        ? (localStorage.getItem(LS_KEY) as ThemePref | null)
        : null) ??
        "system");
    setPrefState(stored);
    const r = resolvePref(stored);
    setResolved(r);
    applyResolved(r);
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = mq.matches ? "dark" : "light";
      setResolved(r);
      applyResolved(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    writeCookie(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {}
    const r = resolvePref(next);
    setResolved(r);
    applyResolved(r);
  }, []);

  const value = useMemo(
    () => ({ pref, resolved, setPref }),
    [pref, resolved, setPref],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
