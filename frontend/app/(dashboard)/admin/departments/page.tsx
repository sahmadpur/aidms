"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Plus, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import type { Department } from "@/lib/types";

const fetcher = (url: string) => api.get<Department[]>(url).then((r) => r.data);

const EMPTY = { name_az: "", name_ru: "", name_en: "" };

export default function AdminDepartmentsPage() {
  const t = useTranslations();
  const { data: departments, isLoading, mutate } = useSWR<Department[]>("/admin/departments", fetcher);
  const [form, setForm] = useState(EMPTY);
  const [showCreate, setShowCreate] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/admin/departments", form);
    setForm(EMPTY);
    setShowCreate(false);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    await api.delete(`/admin/departments/${id}`);
    mutate();
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("departments.title")}</TopBarTitle>
        <div className="flex-1" />
        <TopBarButton variant="primary" onClick={() => { setShowCreate(true); setForm(EMPTY); }}>
          <Plus className="w-3 h-3" />
          {t("departments.newDepartment")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4 space-y-3 max-w-2xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <ul className="space-y-2">
            {departments?.map((d) => (
              <li
                key={d.id}
                className="bg-surface-card border border-edge-soft rounded-[10px] px-4 py-2.5 flex items-center justify-between"
              >
                <div>
                  <p className="text-[13px] font-medium text-gray-900">{d.name_en}</p>
                  <p className="text-[11px] text-gray-500">
                    {d.name_az} · {d.name_ru}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <form
            onSubmit={handleCreate}
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-md border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">{t("departments.newDepartment")}</h2>
            </div>
            <div className="p-5 space-y-3">
              {(["name_en", "name_az", "name_ru"] as const).map((field) => (
                <label key={field} className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">{t(`admin.${field}` as any)}</span>
                  <input
                    required
                    value={(form as any)[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  />
                </label>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3.5 py-1.5 text-[12px] bg-white border border-edge-chip text-gray-700 rounded-[6px] hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
