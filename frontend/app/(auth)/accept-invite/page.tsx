"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { AuthShell, AuthField, AuthSubmit, AuthError } from "@/components/AuthShell";

interface InviteInfo {
  email: string;
  full_name: string;
}

export default function AcceptInvitePage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(true);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    api
      .get(`/auth/invite/${encodeURIComponent(token)}`)
      .then(({ data }) => setInfo(data))
      .catch(() => setError(t("auth.acceptInvite.invalid")))
      .finally(() => setLoadingInfo(false));
  }, [token, router, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t("auth.acceptInvite.mismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/accept-invite", { token, password });
      setTokens(data.access_token, data.refresh_token);
      router.push("/documents");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === "invite_invalid_or_expired") {
        setError(t("auth.acceptInvite.invalid"));
      } else {
        setError(
          Array.isArray(detail) ? detail[0]?.msg : detail || t("errors.generic"),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (loadingInfo) {
    return (
      <AuthShell
        heading={t("auth.acceptInvite.heading")}
        subtitle={t("common.loading")}
        footerPrompt=""
        footerLinkLabel=""
        footerHref="/login"
      >
        <div className="text-[12.5px] text-ink-soft">{t("common.loading")}</div>
      </AuthShell>
    );
  }

  if (!info) {
    return (
      <AuthShell
        heading={t("auth.acceptInvite.heading")}
        subtitle={t("auth.acceptInvite.invalid")}
        footerPrompt={t("auth.acceptInvite.backPrompt")}
        footerLinkLabel={t("auth.acceptInvite.backLink")}
        footerHref="/login"
      >
        {error && <AuthError>{error}</AuthError>}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading={t("auth.acceptInvite.heading")}
      subtitle={t("auth.acceptInvite.subtitle", { name: info.full_name, email: info.email })}
      footerPrompt={t("auth.acceptInvite.backPrompt")}
      footerLinkLabel={t("auth.acceptInvite.backLink")}
      footerHref="/login"
    >
      {error && <AuthError>{error}</AuthError>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          label={t("auth.acceptInvite.newPassword")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
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
          {loading ? t("common.loading") : t("auth.acceptInvite.submit")}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
