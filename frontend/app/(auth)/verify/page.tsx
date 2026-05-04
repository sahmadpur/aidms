"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { AuthShell, AuthField, AuthSubmit, AuthError } from "@/components/AuthShell";

const RESEND_COOLDOWN = 60;

export default function VerifyPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") || "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (!email) router.replace("/register");
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const { data } = await api.post("/auth/verify-email", { email, code });
      setTokens(data.access_token, data.refresh_token);
      router.push("/documents");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        detail === "invalid_or_expired_code"
          ? t("errors.invalidCode")
          : Array.isArray(detail)
          ? detail[0]?.msg
          : detail || t("errors.generic"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    setInfo("");
    try {
      await api.post("/auth/resend-verification", { email });
      setInfo(t("auth.verifyResent"));
      setCooldown(RESEND_COOLDOWN);
    } catch (err: any) {
      const status = err.response?.status;
      const retryAfter = parseInt(err.response?.headers?.["retry-after"] ?? "0", 10);
      if (status === 429 && retryAfter > 0) {
        setCooldown(retryAfter);
      } else {
        const detail = err.response?.data?.detail;
        setError(
          Array.isArray(detail) ? detail[0]?.msg : detail || t("errors.generic"),
        );
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      heading={t("auth.verifyHeading")}
      subtitle={t("auth.verifySubtitle", { email: email || "—" })}
      footerPrompt={t("auth.verifyDifferentEmailPrompt")}
      footerLinkLabel={t("auth.verifyDifferentEmail")}
      footerHref="/register"
    >
      {error && <AuthError>{error}</AuthError>}
      {info && (
        <div className="mb-5 border-l-2 border-brand-accent bg-brand-accent/5 px-3 py-2 text-[12.5px] text-brand">
          {info}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField label={t("auth.verifyCodeLabel")}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            inputMode="numeric"
            pattern="\d{6}"
            autoFocus
            autoComplete="one-time-code"
            placeholder="••••••"
            className="w-full bg-transparent border-0 border-b border-ink/25 focus:border-brand outline-none py-2 font-mono text-[22px] tracking-[0.4em] text-ink placeholder:text-ink/20 transition-colors"
          />
        </AuthField>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-soft">
          {t("auth.verifyCodeHelp", { minutes: 15 })}
        </p>
        <AuthSubmit loading={loading}>
          {loading ? t("common.loading") : t("auth.verifySubmit")}
        </AuthSubmit>
      </form>
      <div className="mt-6 flex items-center justify-between font-mono text-[10.5px] tracking-[0.18em] uppercase">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="text-brand disabled:text-ink-soft disabled:cursor-not-allowed underline decoration-[1.5px] decoration-brand-accent underline-offset-[5px] hover:decoration-brand transition-colors"
        >
          {cooldown > 0
            ? t("auth.verifyResendCooldown", { seconds: cooldown })
            : t("auth.verifyResend")}
        </button>
      </div>
    </AuthShell>
  );
}
