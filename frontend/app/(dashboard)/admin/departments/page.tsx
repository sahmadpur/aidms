"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Plus, Trash2, Loader2, Users, Pencil } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import type { Department } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  is_active: boolean;
}

interface DeptForm {
  name_az: string;
  name_ru: string;
  name_en: string;
  manager_ids: string[];
}

const EMPTY: DeptForm = { name_az: "", name_ru: "", name_en: "", manager_ids: [] };

export default function AdminDepartmentsPage() {
  const t = useTranslations();
  const { data: departments, isLoading, mutate } = useSWR<Department[]>(
    "/admin/departments",
    fetcher
  );
  const { data: users = [] } = useSWR<AdminUser[]>("/admin/users", fetcher);
  const [form, setForm] = useState<DeptForm>(EMPTY);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function openCreate() {
    setForm(EMPTY);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(d: Department) {
    setForm({
      name_az: d.name_az,
      name_ru: d.name_ru,
      name_en: d.name_en,
      manager_ids: (d.managers ?? []).map((m) => m.id),
    });
    setEditingId(d.id);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await api.patch(`/admin/departments/${editingId}`, form);
    } else {
      await api.post("/admin/departments", form);
    }
    setShowModal(false);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    await api.delete(`/admin/departments/${id}`);
    mutate();
  }

  function toggleManager(userId: string) {
    setForm((f) => ({
      ...f,
      manager_ids: f.manager_ids.includes(userId)
        ? f.manager_ids.filter((i) => i !== userId)
        : [...f.manager_ids, userId],
    }));
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("departments.title")}</TopBarTitle>
        <div className="flex-1" />
        <TopBarButton variant="primary" onClick={openCreate}>
          <Plus className="w-3 h-3" />
          {t("departments.newDepartment")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4 space-y-3 max-w-3xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <ul className="space-y-2">
            {departments?.map((d) => (
              <li
                key={d.id}
                className="bg-surface-card border border-edge-soft rounded-[10px] px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900">{d.name_en}</p>
                  <p className="text-[11px] text-gray-500">
                    {d.name_az} · {d.name_ru}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-600">
                    <Users className="w-3 h-3 text-gray-400" />
                    <span>{t("departments.managers")}:</span>
                    {d.managers && d.managers.length > 0 ? (
                      <span className="text-gray-800">
                        {d.managers.map((m) => m.full_name).join(", ")}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">
                        {t("departments.noManagers")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(d)}
                    className="p-1.5 text-gray-500 hover:text-brand rounded hover:bg-surface-hover"
                    title={t("common.edit")}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                    title={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-md border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {editingId ? t("common.edit") : t("departments.newDepartment")}
              </h2>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {(["name_en", "name_az", "name_ru"] as const).map((field) => (
                <label key={field} className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    {t(`admin.${field}` as "admin.name_en")}
                  </span>
                  <input
                    required
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  />
                </label>
              ))}
              <div>
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  {t("departments.managers")}
                </span>
                <div className="border border-edge-chip rounded-[5px] max-h-[200px] overflow-y-auto bg-white">
                  {users
                    .filter((u) => u.is_active)
                    .map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-surface-hover cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.manager_ids.includes(u.id)}
                          onChange={() => toggleManager(u.id)}
                        />
                        <span className="truncate">
                          {u.full_name}{" "}
                          <span className="text-gray-400">({u.email})</span>
                        </span>
                      </label>
                    ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {t("departments.managersHint")}
                </p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
