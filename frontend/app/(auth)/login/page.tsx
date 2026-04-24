"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { AuthShell, AuthField, AuthSubmit, AuthError } from "@/components/AuthShell";

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data } = await api.post("/auth/login", { email, password });
      setTokens(data.access_token, data.refresh_token);
      router.push("/documents");
    } catch (err: any) {
      setError(err.response?.data?.detail || t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading={t("auth.loginHeading")}
      subtitle={t("auth.loginSubtitle")}
      footerPrompt={t("auth.loginPrompt")}
      footerLinkLabel={t("auth.createLink")}
      footerHref="/register"
    >
      {error && <AuthError>{error}</AuthError>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          autoFocus
        />
        <AuthField
          label={t("auth.password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <AuthSubmit loading={loading}>
          {loading ? t("common.loading") : t("auth.enter")}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
