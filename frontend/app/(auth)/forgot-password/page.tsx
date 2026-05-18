"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { AuthShell, AuthField, AuthSubmit, AuthError } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      router.push(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 429) {
        setError(t("errors.tooManyAttempts"));
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
      heading={t("auth.forgotPassword.heading")}
      subtitle={t("auth.forgotPassword.subtitle")}
      footerPrompt={t("auth.forgotPassword.backPrompt")}
      footerLinkLabel={t("auth.forgotPassword.backLink")}
      footerHref="/login"
    >
      {error && <AuthError>{error}</AuthError>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />
        <AuthSubmit loading={loading}>
          {loading ? t("common.loading") : t("auth.forgotPassword.submit")}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
