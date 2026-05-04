"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { AuthShell, AuthField, AuthSubmit, AuthError } from "@/components/AuthShell";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm_password: "",
    full_name: "",
    language_preference: "en",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm_password) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      const { confirm_password: _omit, ...payload } = form;
      await api.post("/auth/register", payload);
      router.push(`/verify?email=${encodeURIComponent(form.email)}`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? detail[0]?.msg : detail || t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading={t("auth.registerHeading")}
      subtitle={t("auth.registerSubtitle")}
      footerPrompt={t("auth.registerPrompt")}
      footerLinkLabel={t("auth.signInLink")}
      footerHref="/login"
    >
      {error && <AuthError>{error}</AuthError>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          label={t("auth.fullName")}
          type="text"
          value={form.full_name}
          onChange={update("full_name")}
          required
          autoComplete="name"
          autoFocus
        />
        <AuthField
          label={t("auth.email")}
          type="email"
          value={form.email}
          onChange={update("email")}
          required
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
        />
        <div>
          <AuthField
            label={t("auth.password")}
            type="password"
            value={form.password}
            onChange={update("password")}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter value={form.password} />
        </div>
        <AuthField
          label={t("auth.confirmPassword")}
          type="password"
          value={form.confirm_password}
          onChange={update("confirm_password")}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <AuthField label={t("common.language")}>
          <select
            value={form.language_preference}
            onChange={update("language_preference")}
            className="w-full bg-transparent border-0 border-b border-ink/25 focus:border-brand outline-none py-2 text-[15px] text-ink transition-colors appearance-none cursor-pointer"
          >
            <option value="en">English</option>
            <option value="az">Azərbaycan</option>
            <option value="ru">Русский</option>
          </select>
        </AuthField>
        <AuthSubmit loading={loading}>
          {loading ? t("common.loading") : t("auth.enter")}
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
