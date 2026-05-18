"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Loader2, Check } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";

interface AISettings {
  chat_model: string;
  allowed_models: string[];
  updated_at: string | null;
}

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const MODEL_META: Record<string, { titleKey: string; hintKey: string }> = {
  "claude-sonnet-4-6": {
    titleKey: "modelSonnetTitle",
    hintKey: "modelSonnetHint",
  },
  "claude-haiku-4-5": {
    titleKey: "modelHaikuTitle",
    hintKey: "modelHaikuHint",
  },
};

export default function AISettingsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const { data, isLoading, mutate } = useSWR<AISettings>(
    "/admin/settings/ai",
    fetcher
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (data && selected === null) {
      setSelected(data.chat_model);
    }
  }, [data, selected]);

  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(id);
  }, [justSaved]);

  const dirty = data && selected !== null && selected !== data.chat_model;

  async function handleSave() {
    if (!selected || !dirty) return;
    setSaving(true);
    try {
      const res = await api.patch<AISettings>("/admin/settings/ai", {
        chat_model: selected,
      });
      await mutate(res.data, { revalidate: false });
      setJustSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("aiSettings")}</TopBarTitle>
      </TopBar>
      <div className="px-[22px] py-4 space-y-4 max-w-2xl">
        <div className="bg-surface-card border border-edge-soft rounded-[10px] p-4 space-y-4">
          <div>
            <h2 className="text-[13px] font-semibold text-gray-700">
              {t("chatModel")}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {t("aiSettingsDescription")}
            </p>
          </div>

          {isLoading || !data ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {data.allowed_models.map((model) => {
                  const meta = MODEL_META[model];
                  const isSelected = selected === model;
                  return (
                    <li key={model}>
                      <label
                        className={
                          "flex items-start gap-3 p-3 rounded-[8px] border cursor-pointer transition-colors " +
                          (isSelected
                            ? "border-brand-accent bg-brand-pale/40"
                            : "border-edge-soft hover:bg-surface-hover")
                        }
                      >
                        <input
                          type="radio"
                          name="chat_model"
                          value={model}
                          checked={isSelected}
                          onChange={() => setSelected(model)}
                          className="mt-0.5 accent-brand"
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-gray-900">
                            {meta ? t(meta.titleKey as any) : model}
                          </p>
                          {meta && (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {t(meta.hintKey as any)}
                            </p>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand text-brand-pale text-[12px] rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  {t("save")}
                </button>
                {justSaved && (
                  <span className="flex items-center gap-1 text-[12px] text-brand">
                    <Check className="w-3.5 h-3.5" />
                    {t("saved")}
                  </span>
                )}
                {data.updated_at && !justSaved && (
                  <span className="text-[11px] text-gray-500">
                    {t("lastUpdated")}:{" "}
                    {new Date(data.updated_at).toLocaleString(locale)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
