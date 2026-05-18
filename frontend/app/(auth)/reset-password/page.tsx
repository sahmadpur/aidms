"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { AuthShell, AuthField, AuthSubmit, AuthError } from "@/components/AuthShell";

export default function ResetPasswordPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const emailParam = params.get("email") || "";

  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (emailParam) setInfo(t("auth.resetPassword.codeSent", { email: emailParam }));
  }, [emailParam, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t("auth.acceptInvite.mismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/reset-password", {
        email,
        code,
        new_password: password,
      });
      setTokens(data.access_token, data.refresh_token);
      router.push("/documents");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === "invalid_or_expired_code") {
        setError(t("errors.invalidCode"));
      } else {
        setError(
          Array.isArray(detail) ? detail[0]?.msg : detail || t("errors.generic"),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading={t("auth.resetPassword.heading")}
      subtitle={t("auth.resetPassword.subtitle")}
      footerPrompt={t("auth.forgotPassword.backPrompt")}
      footerLinkLabel={t("auth.forgotPassword.backLink")}
      footerHref="/login"
    >
      {error && <AuthError>{error}</AuthError>}
      {info && !error && (
        <div className="mb-5 border-l-2 border-brand-accent bg-brand-accent/5 px-3 py-2 text-[12.5px] text-brand">
          {info}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <AuthField label={t("auth.resetPassword.codeLabel")}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            inputMode="numeric"
            pattern="\d{6}"
            autoComplete="one-time-code"
            placeholder="••••••"
            className="w-full bg-transparent border-0 border-b border-ink/25 focus:border-brand outline-none py-2 font-mono text-[22px] tracking-[0.4em] text-ink placeholder:text-ink/20 transition-colors"
          />
        </AuthField>
        <AuthField
          label={t("auth.resetPassword.newPassword")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <AuthField
          label={t("auth.acceptInvite.confirmPassword")}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <AuthSubmit loading={loading}>
          {loading ? t("common.loading") : t("auth.resetPassword.submit")}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
