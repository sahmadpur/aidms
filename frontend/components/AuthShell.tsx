"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";

/**
 * AuthShell — split-screen layout for /login and /register.
 * Left: deep-green editorial panel with hero typography + floating catalog cards.
 * Right: warm paper panel hosting the form (provided via children).
 */
export function AuthShell({
  heading,
  subtitle,
  children,
  footerPrompt,
  footerLinkLabel,
  footerHref,
}: {
  heading: string;
  subtitle: string;
  children: ReactNode;
  footerPrompt: string;
  footerLinkLabel: string;
  footerHref: string;
}) {
  const t = useTranslations("auth");

  return (
    <div className="min-h-screen grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-paper text-ink font-brand">
      <HeroPanel />
      <section className="relative flex flex-col min-h-screen md:min-h-0 bg-paper bg-grain-light bg-blend-multiply">
        <TopRightBar />
        <div className="flex-1 flex items-center justify-center px-6 py-16 sm:py-20">
          <div className="w-full max-w-[440px] stagger">
            <div className="mb-10 md:hidden">
              <MobileBrand />
            </div>
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft">
                <span aria-hidden className="block w-4 h-px bg-brand-accent" />
                {t("tagline")}
              </span>
            </div>
            <h1 className="font-display text-[44px] sm:text-[52px] leading-[0.95] tracking-[-0.01em] text-ink mt-5">
              {heading}
            </h1>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-soft max-w-[34ch]">
              {subtitle}
            </p>
            <div className="mt-10">{children}</div>
            <p className="mt-10 text-[12.5px] text-ink-soft">
              {footerPrompt}{" "}
              <Link
                href={footerHref}
                className="text-brand font-medium underline decoration-[1.5px] decoration-brand-accent underline-offset-[5px] hover:decoration-brand transition-colors"
              >
                {footerLinkLabel}
              </Link>
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 text-center md:text-right">
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-soft/70">
            © {new Date().getFullYear()} CyberCraft LLC
          </p>
        </div>
      </section>
    </div>
  );
}

function HeroPanel() {
  const t = useTranslations("auth");
  return (
    <aside
      aria-hidden
      className="hidden md:flex relative overflow-hidden bg-brand-deep text-paper min-h-screen"
    >
      {/* Warm radial glow from upper left */}
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,#3c6a1c_0%,transparent_65%)] opacity-55 pointer-events-none" />
      {/* Subtle grain */}
      <div className="absolute inset-0 bg-grain opacity-[0.16] pointer-events-none mix-blend-screen" />
      {/* Ruled margin line on the right edge — like a ledger */}
      <div className="absolute right-0 top-0 bottom-0 w-px bg-brand-accent/20" />
      {/* Horizontal rule near top */}
      <div className="absolute top-[88px] left-12 right-12 h-px bg-paper/10" />

      <div className="relative z-10 flex flex-col w-full px-14 py-10 lg:py-12 stagger">
        {/* Top brand strip */}
        <div className="flex items-center gap-3">
          <span
            className="font-display text-[22px] leading-none text-paper tracking-tight"
            style={{ fontFeatureSettings: '"ss01", "liga"' }}
          >
            DocArchive
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-brand-accent">
            AI
          </span>
        </div>

        {/* Hero heading — sits in upper-middle, capped width so it never meets the cards */}
        <div className="mt-12 lg:mt-14 xl:mt-20 max-w-[480px]">
          <h2
            className="font-display text-[48px] lg:text-[56px] xl:text-[64px] leading-[0.95] tracking-[-0.015em] text-paper"
            style={{ fontFeatureSettings: '"ss01"' }}
          >
            <span className="block">{t("heroLine1")}</span>
            <span className="block italic text-brand-light">{t("heroLine2")}</span>
            <span className="block">{t("heroLine3")}</span>
          </h2>
          <p className="mt-6 max-w-[38ch] text-[14px] leading-[1.65] text-brand-light/90">
            {t("heroSubtitle")}
          </p>
        </div>

        {/* Flex spacer pushes cards + meta to bottom */}
        <div className="flex-1 min-h-[16px]" />

        {/* Catalog cards — dedicated slot at bottom-right, no longer overlapping heading.
            Hidden on md where the panel is too narrow; appear on lg+. */}
        <div className="hidden lg:block relative h-[240px] mr-[-40px] mb-5 pointer-events-none">
          <CatalogCards />
        </div>

        {/* Footer meta row */}
        <div className="flex items-end justify-between gap-6">
          <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-brand-accent/80">
            {t("meta")}
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper/40">
            N° 01
          </span>
        </div>
      </div>
    </aside>
  );
}

/**
 * Two tilted archive-catalog cards, anchored to the bottom-right of the hero panel.
 * Positioned within a dedicated parent slot — do not overlap the heading.
 */
function CatalogCards() {
  return (
    <>
      {/* Card 1 — larger, tilted left, back; right-anchored */}
      <div className="absolute top-2 right-4 w-[300px] origin-center animate-float1">
        <ArchiveCard
          cardNo="02847"
          title="Xidmət müqaviləsi № 142/A"
          titleLang="az"
          rows={[
            ["Type", "Contract"],
            ["Dept", "Finance"],
            ["Pages", "12"],
            ["Shelf", "B4 / 07"],
          ]}
          status="indexed"
          stamp="APPROVED"
          stampYear="2026"
        />
      </div>
      {/* Card 2 — compact, tilted right, overlapping left-forward */}
      <div className="absolute top-[120px] right-[210px] w-[232px] origin-center animate-float2">
        <ArchiveCard
          compact
          cardNo="01324"
          title="Годовой отчёт — 2024"
          titleLang="ru"
          rows={[
            ["Type", "Report"],
            ["Pages", "48"],
            ["Lang", "ru / en"],
          ]}
          status="indexed"
        />
      </div>
    </>
  );
}

function ArchiveCard({
  cardNo,
  title,
  titleLang,
  rows,
  status,
  stamp,
  stampYear,
  compact = false,
}: {
  cardNo: string;
  title: string;
  titleLang?: string;
  rows: [string, string][];
  status: "indexed" | "pending";
  stamp?: string;
  stampYear?: string;
  compact?: boolean;
}) {
  return (
    <div
      className="relative bg-paper text-ink shadow-[0_22px_44px_-18px_rgba(0,0,0,0.45)] ring-1 ring-paper-edge"
      style={{
        padding: compact ? "14px 16px" : "18px 20px",
      }}
    >
      {/* Edge tick marks — top corners */}
      <span className="absolute top-0 left-0 w-3 h-px bg-ink/40" />
      <span className="absolute top-0 left-0 w-px h-3 bg-ink/40" />
      <span className="absolute top-0 right-0 w-3 h-px bg-ink/40" />
      <span className="absolute top-0 right-0 w-px h-3 bg-ink/40" />
      <span className="absolute bottom-0 left-0 w-3 h-px bg-ink/40" />
      <span className="absolute bottom-0 left-0 w-px h-3 bg-ink/40" />
      <span className="absolute bottom-0 right-0 w-3 h-px bg-ink/40" />
      <span className="absolute bottom-0 right-0 w-px h-3 bg-ink/40" />

      {/* Perforation row at top */}
      <div className="flex gap-[3px] mb-3 opacity-40">
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className="w-[3px] h-[3px] rounded-full bg-ink" />
        ))}
      </div>

      {/* Header row: DOC ID + mini badge */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] tracking-[0.22em] uppercase text-ink-soft/80">
            Archive Card · 2026
          </div>
          <div className="font-mono text-[17px] tracking-[0.02em] text-ink mt-[3px]">
            DOC-0{cardNo}
          </div>
        </div>
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-brand border border-brand/40 px-1.5 py-0.5">
          {titleLang?.toUpperCase() ?? "EN"}
        </span>
      </div>

      {/* Title */}
      <div
        className="font-display italic text-ink text-[17px] leading-snug mt-3"
        lang={titleLang}
      >
        {title}
      </div>

      {/* Metadata rows */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-dashed border-ink/15 pb-[2px]">
            <dt className="uppercase tracking-[0.12em] text-ink-soft/70">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Footer row */}
      <div className="mt-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em]">
        <span className="flex items-center gap-1.5 text-brand">
          <span
            className={`inline-block w-[7px] h-[7px] rounded-full ${
              status === "indexed" ? "bg-dot-done" : "bg-dot-progress"
            }`}
          />
          {status === "indexed" ? "Indexed" : "Processing"}
        </span>
        <span className="text-ink-soft/70">v2 · OCR</span>
      </div>

      {/* Approval stamp */}
      {stamp && (
        <div
          className="absolute -top-3 -right-2 rotate-[14deg] origin-bottom-left animate-stamp"
          aria-hidden
        >
          <div className="font-mono text-[14px] tracking-[0.2em] uppercase px-2.5 py-1 border-[1.5px] border-red-700/80 text-red-700/85 bg-paper/60 backdrop-blur-[1px]">
            {stamp}
            {stampYear && (
              <span className="block text-[9px] tracking-[0.3em] mt-0.5 text-red-700/75">
                · {stampYear} ·
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TopRightBar() {
  return (
    <div className="flex items-center justify-end gap-4 px-6 pt-5">
      <AuthLanguageSwitcher />
    </div>
  );
}

function MobileBrand() {
  const t = useTranslations("auth");
  return (
    <div className="flex items-center gap-2">
      <span className="font-display text-[20px] leading-none text-ink tracking-tight">
        DocArchive
      </span>
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-brand">
        AI
      </span>
    </div>
  );
}

function AuthLanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const locales = [
    { v: "en", label: "EN" },
    { v: "az", label: "AZ" },
    { v: "ru", label: "RU" },
  ];

  function switchLocale(v: string) {
    document.cookie = `locale=${v}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-0 border border-paper-edge bg-paper/60 rounded-full p-[3px]">
      {locales.map(({ v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => switchLocale(v)}
          aria-pressed={locale === v}
          className={`px-3 py-1 font-mono text-[10px] tracking-[0.18em] uppercase rounded-full transition-colors ${
            locale === v
              ? "bg-brand text-paper"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * AuthField — refined underline-only input used inside AuthShell children.
 */
export function AuthField({
  label,
  type = "text",
  value,
  onChange,
  required,
  minLength,
  placeholder,
  autoFocus,
  autoComplete,
  children,
}: {
  label: string;
  type?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  children?: ReactNode;
}) {
  return (
    <label className="block group">
      <span className="block font-mono text-[9.5px] tracking-[0.24em] uppercase text-ink-soft mb-2">
        {label}
      </span>
      {children ? (
        children
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className="w-full bg-transparent border-0 border-b border-ink/25 focus:border-brand outline-none py-2 text-[15px] text-ink placeholder:text-ink/30 transition-colors"
        />
      )}
    </label>
  );
}

/**
 * AuthSubmit — brand-green stamp-like primary button with sliding arrow.
 */
export function AuthSubmit({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group relative w-full mt-2 py-[14px] px-5 bg-brand hover:bg-brand-hover text-paper disabled:opacity-60 transition-colors flex items-center justify-between font-mono text-[11px] tracking-[0.26em] uppercase"
    >
      <span>{children}</span>
      <span className="flex items-center gap-2">
        <span className="w-6 h-px bg-paper/40 group-hover:w-10 transition-[width] duration-300" />
        <span className={loading ? "animate-pulse" : "group-hover:translate-x-[3px] transition-transform"}>
          {loading ? "···" : "→"}
        </span>
      </span>
    </button>
  );
}

/**
 * AuthError — slim inline error strip above the form.
 */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 border-l-2 border-red-700 bg-red-700/5 px-3 py-2 text-[12.5px] text-red-800">
      {children}
    </div>
  );
}
