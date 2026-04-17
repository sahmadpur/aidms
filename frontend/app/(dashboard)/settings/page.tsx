"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { useMe } from "@/lib/useMe";

export default function SettingsPage() {
  const t = useTranslations();
  const { data: me, mutate } = useMe();

  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState<"az" | "ru" | "en">("en");
  const [profileMsg, setProfileMsg] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (me) {
      setFullName(me.full_name);
      setLanguage(me.language_preference);
    }
  }, [me]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setSavingProfile(true);
    setProfileMsg("");
    try {
      await api.patch("/users/me", { full_name: fullName, language_preference: language });
      // Persist locale cookie so next-intl picks up change on reload
      document.cookie = `NEXT_LOCALE=${language}; path=/; max-age=${60 * 60 * 24 * 365}`;
      await mutate();
      setProfileMsg(t("settings.profileUpdated"));
      // Reload so the whole UI re-renders in the new locale
      setTimeout(() => window.location.reload(), 500);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    setPwMsg("");
    setPwErr("");
    try {
      await api.post("/users/me/password", {
        current_password: currentPw,
        new_password: newPw,
      });
      setCurrentPw("");
      setNewPw("");
      setPwMsg(t("settings.passwordChanged"));
    } catch (err: any) {
      setPwErr(err.response?.data?.detail || t("errors.generic"));
    } finally {
      setSavingPw(false);
    }
  }

  if (!me) {
    return (
      <>
        <TopBar><TopBarTitle>{t("settings.title")}</TopBarTitle></TopBar>
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar><TopBarTitle>{t("settings.title")}</TopBarTitle></TopBar>
      <div className="px-[22px] py-4 space-y-4 max-w-xl">
        {/* Profile */}
        <form onSubmit={saveProfile} className="bg-surface-card border border-edge-soft rounded-[10px] p-5 space-y-3">
          <h2 className="text-[13px] font-semibold text-gray-700">{t("settings.profile")}</h2>
          <Field label={t("auth.email")}>
            <input
              value={me.email}
              disabled
              className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-gray-100 text-gray-500"
            />
          </Field>
          <Field label={t("settings.fullName")}>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
            />
          </Field>
          <Field label={t("settings.language")}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "az" | "ru" | "en")}
              className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus"
            >
              <option value="en">English</option>
              <option value="az">Azərbaycan</option>
              <option value="ru">Русский</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
          >
            {savingProfile ? "..." : t("settings.updateProfile")}
          </button>
          {profileMsg && <p className="text-[12px] text-[#3b6d11]">{profileMsg}</p>}
        </form>

        {/* Password */}
        <form onSubmit={changePassword} className="bg-surface-card border border-edge-soft rounded-[10px] p-5 space-y-3">
          <h2 className="text-[13px] font-semibold text-gray-700">{t("settings.password")}</h2>
          <Field label={t("settings.currentPassword")}>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
            />
          </Field>
          <Field label={t("settings.newPassword")}>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
              className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
            />
          </Field>
          <button
            type="submit"
            disabled={savingPw}
            className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
          >
            {savingPw ? "..." : t("settings.changePassword")}
          </button>
          {pwMsg && <p className="text-[12px] text-[#3b6d11]">{pwMsg}</p>}
          {pwErr && <p className="text-[12px] text-red-600">{pwErr}</p>}
        </form>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
