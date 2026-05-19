"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { AvatarCropDialog } from "@/components/settings/AvatarCropDialog";
import { useMe, type Me } from "@/lib/useMe";
import { useTheme, type ThemePref } from "@/components/theme/ThemeProvider";

type DraftForm = {
  full_name: string;
  language_preference: "az" | "ru" | "en";
  notify_mentions: boolean;
  notify_doc_approvals: boolean;
  notify_ocr_complete: boolean;
};

function snapshot(me: Me): DraftForm {
  return {
    full_name: me.full_name,
    language_preference: me.language_preference,
    notify_mentions: me.notify_mentions,
    notify_doc_approvals: me.notify_doc_approvals,
    notify_ocr_complete: me.notify_ocr_complete,
  };
}

export default function SettingsPage() {
  const t = useTranslations();
  const { data: me, mutate } = useMe();

  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (me && !draft) setDraft(snapshot(me));
  }, [me, draft]);

  const dirty = useMemo(() => {
    if (!me || !draft) return false;
    const baseline = snapshot(me);
    return (Object.keys(baseline) as (keyof DraftForm)[]).some(
      (k) => baseline[k] !== draft[k],
    );
  }, [me, draft]);

  async function save() {
    if (!me || !draft || !dirty) return;
    setSaving(true);
    setToast(null);
    const baseline = snapshot(me);
    const changed: Partial<DraftForm> = {};
    (Object.keys(baseline) as (keyof DraftForm)[]).forEach((k) => {
      if (baseline[k] !== draft[k]) (changed as Record<string, unknown>)[k] = draft[k];
    });
    try {
      await api.patch("/users/me", changed);
      if ("language_preference" in changed) {
        document.cookie = `NEXT_LOCALE=${draft.language_preference}; path=/; max-age=${60 * 60 * 24 * 365}`;
      }
      await mutate();
      setToast(t("settings.savedToast"));
      if ("language_preference" in changed) {
        setTimeout(() => window.location.reload(), 400);
      } else {
        setTimeout(() => setToast(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!me) return;
    setDraft(snapshot(me));
  }

  async function removeAvatar() {
    if (!me?.avatar_url) return;
    setRemovingAvatar(true);
    try {
      await api.delete("/users/me/avatar");
      await mutate();
    } finally {
      setRemovingAvatar(false);
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
      setTimeout(() => setPwMsg(""), 3000);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("errors.generic");
      setPwErr(detail);
    } finally {
      setSavingPw(false);
    }
  }

  if (!me || !draft) {
    return (
      <>
        <TopBar>
          <TopBarTitle>{t("settings.title")}</TopBarTitle>
        </TopBar>
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-ink-soft" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("settings.title")}</TopBarTitle>
      </TopBar>

      <div className="px-[22px] py-6 flex gap-8 max-w-[960px]">
        <SectionNav />

        <div className="flex-1 max-w-[640px] space-y-4 pb-24">
          <Section id="profile" title={t("settings.section.profile")}>
            <div className="flex items-start gap-5">
              <div className="flex flex-col items-center gap-2">
                <Avatar user={me} size="xl" />
                <div className="flex flex-col gap-1 w-[96px]">
                  <button
                    type="button"
                    onClick={() => setAvatarOpen(true)}
                    className="px-2 py-1 text-[11px] bg-surface-card border border-edge-chip text-ink rounded-[5px] hover:bg-surface-hover"
                  >
                    {t("settings.avatar.change")}
                  </button>
                  {me.avatar_url && (
                    <button
                      type="button"
                      onClick={removeAvatar}
                      disabled={removingAvatar}
                      className="px-2 py-1 text-[11px] bg-surface-card border border-danger-edge text-danger-fg rounded-[5px] hover:bg-danger-bg inline-flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {removingAvatar ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      {t("settings.avatar.remove")}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <Field label={t("auth.email")}>
                  <input
                    value={me.email}
                    disabled
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover text-ink-soft"
                  />
                </Field>
                <Field label={t("settings.fullName")}>
                  <input
                    value={draft.full_name}
                    onChange={(e) =>
                      setDraft({ ...draft, full_name: e.target.value })
                    }
                    required
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section id="language" title={t("settings.section.language")}>
            <Field label={t("settings.language")}>
              <select
                value={draft.language_preference}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    language_preference: e.target.value as DraftForm["language_preference"],
                  })
                }
                className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus"
              >
                <option value="en">English</option>
                <option value="az">Azərbaycan</option>
                <option value="ru">Русский</option>
              </select>
            </Field>
          </Section>

          <Section id="notifications" title={t("settings.section.notifications")}>
            <ToggleRow
              title={t("notifications.mentions.title")}
              help={t("notifications.mentions.help")}
              checked={draft.notify_mentions}
              onChange={(v) => setDraft({ ...draft, notify_mentions: v })}
            />
            <ToggleRow
              title={t("notifications.docApprovals.title")}
              help={t("notifications.docApprovals.help")}
              checked={draft.notify_doc_approvals}
              onChange={(v) => setDraft({ ...draft, notify_doc_approvals: v })}
            />
            <ToggleRow
              title={t("notifications.ocrComplete.title")}
              help={t("notifications.ocrComplete.help")}
              checked={draft.notify_ocr_complete}
              onChange={(v) => setDraft({ ...draft, notify_ocr_complete: v })}
            />
          </Section>

          <Section id="password" title={t("settings.section.password")}>
            <form onSubmit={changePassword} className="space-y-3">
              <Field label={t("settings.currentPassword")}>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                />
              </Field>
              <Field label={t("settings.newPassword")}>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                />
              </Field>
              <button
                type="submit"
                disabled={savingPw}
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {savingPw ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : null}
                {t("settings.changePassword")}
              </button>
              {pwMsg && <p className="text-[12px] text-brand-deep">{pwMsg}</p>}
              {pwErr && <p className="text-[12px] text-danger-fg">{pwErr}</p>}
            </form>
          </Section>

          <Section id="appearance" title={t("settings.section.appearance")}>
            <ThemeChooser />
          </Section>
        </div>
      </div>

      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-surface-card border-t border-edge-soft px-[22px] py-3 flex items-center justify-end gap-2 shadow-[0_-4px_14px_-8px_rgba(0,0,0,0.2)]">
          <span className="text-[12px] text-ink-soft mr-auto">
            {t("settings.unsavedChanges")}
          </span>
          <button
            type="button"
            onClick={discard}
            className="px-3.5 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
          >
            {t("settings.discard")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {t("settings.save")}
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-surface-card border border-edge-soft rounded-[8px] px-4 py-2 text-[12px] text-brand-deep shadow-lg">
          {toast}
        </div>
      )}

      <AvatarCropDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        onSaved={() => mutate()}
      />
    </>
  );
}

function SectionNav() {
  const t = useTranslations();
  const items: Array<{ id: string; label: string }> = [
    { id: "profile", label: t("settings.section.profile") },
    { id: "language", label: t("settings.section.language") },
    { id: "notifications", label: t("settings.section.notifications") },
    { id: "password", label: t("settings.section.password") },
    { id: "appearance", label: t("settings.section.appearance") },
  ];
  return (
    <nav className="hidden md:block w-[180px] sticky top-[80px] self-start space-y-1">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="block px-3 py-1.5 text-[12.5px] text-ink-soft hover:text-brand-deep hover:bg-surface-hover rounded-[5px] transition-colors"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-surface-card border border-edge-soft rounded-[10px] p-5 scroll-mt-24"
    >
      <h2 className="text-[13px] font-semibold text-brand-deep mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-ink-soft mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  title,
  help,
  checked,
  onChange,
}: {
  title: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-[20px] w-[36px] flex-shrink-0 rounded-full border transition-colors ${
          checked
            ? "bg-brand border-brand"
            : "bg-surface-hover border-edge-chip"
        }`}
      >
        <span
          className={`absolute top-[1.5px] h-[15px] w-[15px] rounded-full bg-surface-card shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[1.5px]"
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink font-medium">{title}</div>
        <div className="text-[11.5px] text-ink-soft mt-0.5">{help}</div>
      </div>
    </label>
  );
}

function ThemeChooser() {
  const t = useTranslations("settings.appearance");
  const { pref, setPref } = useTheme();
  const options: Array<{
    value: ThemePref;
    label: string;
    Icon: typeof Sun;
  }> = [
    { value: "light", label: t("lightLabel"), Icon: Sun },
    { value: "dark", label: t("darkLabel"), Icon: Moon },
    { value: "system", label: t("systemLabel"), Icon: Monitor },
  ];
  return (
    <div className="inline-flex bg-surface-hover border border-edge-chip rounded-[8px] p-1 gap-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setPref(value)}
          className={`px-3 py-1.5 text-[12px] rounded-[5px] inline-flex items-center gap-1.5 transition-colors ${
            pref === value
              ? "bg-surface-card text-brand-deep shadow-sm"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
