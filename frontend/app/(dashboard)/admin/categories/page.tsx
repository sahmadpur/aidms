"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Plus, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function CategoriesPage() {
  const t = useTranslations("admin");
  const { data: categories, isLoading, mutate } = useSWR("/admin/categories", fetcher);
  const [form, setForm] = useState({ name_az: "", name_ru: "", name_en: "" });
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/admin/categories", form);
      setForm({ name_az: "", name_ru: "", name_en: "" });
      mutate();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("delete") + "?")) return;
    await api.delete(`/admin/categories/${id}`);
    mutate();
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("categories")}</TopBarTitle>
      </TopBar>
      <div className="px-[22px] py-4 space-y-4 max-w-2xl">
        <form onSubmit={handleCreate} className="bg-surface-card border border-edge-soft rounded-[10px] p-4 space-y-3">
          <h2 className="text-[13px] font-semibold text-gray-700">{t("newCategory")}</h2>
          {(["name_en", "name_az", "name_ru"] as const).map((field) => (
            <div key={field}>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">{t(field as any)}</label>
              <input
                type="text"
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                required
                className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand text-brand-pale text-[12px] rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {t("save")}
          </button>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          </div>
        ) : (
          <ul className="space-y-2">
            {categories?.map((cat: any) => (
              <li
                key={cat.id}
                className="bg-surface-card border border-edge-soft rounded-[10px] px-4 py-2.5 flex items-center justify-between"
              >
                <div>
                  <p className="text-[13px] font-medium text-gray-900">{cat.name_en}</p>
                  <p className="text-[11px] text-gray-500">
                    {cat.name_az} · {cat.name_ru}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
