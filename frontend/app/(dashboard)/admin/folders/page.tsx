"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Edit2, Loader2, Folder, FileText } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import { useFolders, pathFor, FolderNode } from "@/components/FolderPicker";
import { localizedName } from "@/lib/types";

interface NewFolderForm {
  parent_id: string | null;
  name_az: string;
  name_ru: string;
  name_en: string;
}

const EMPTY: NewFolderForm = { parent_id: null, name_az: "", name_ru: "", name_en: "" };

export default function AdminFoldersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: folders = [], isLoading, mutate } = useFolders();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewFolderForm>(EMPTY);
  const [editing, setEditing] = useState<FolderNode | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/folders", form);
    setForm(EMPTY);
    setShowCreate(false);
    mutate();
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await api.patch(`/folders/${editing.id}`, {
      name_az: editing.name_az,
      name_ru: editing.name_ru,
      name_en: editing.name_en,
      parent_id: editing.parent_id,
    });
    setEditing(null);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("common.delete") + "?")) return;
    await api.delete(`/folders/${id}`);
    mutate();
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("folders.title")}</TopBarTitle>
        <div className="flex-1" />
        <TopBarButton variant="primary" onClick={() => { setShowCreate(true); setForm(EMPTY); }}>
          <Plus className="w-3 h-3" />
          {t("folders.newFolder")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden">
            {folders.length === 0 && <p className="text-center text-sm text-gray-500 py-8">{t("folders.empty")}</p>}
            {folders.map((f) => (
              <div
                key={f.id}
                className="flex items-center px-4 py-2.5 border-b border-[#eef3e8] last:border-b-0 hover:bg-surface-hover"
                style={{ paddingLeft: 16 + (f.depth - 1) * 20 }}
              >
                <Folder className="w-4 h-4 text-brand-accent flex-shrink-0" />
                <span className="ml-2 text-[13px] text-gray-900 font-medium">
                  {pathFor(f, locale)[pathFor(f, locale).length - 1]}
                </span>
                <span className="ml-2 text-[11px] text-gray-500 inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {f.document_count}
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => setEditing(f)}
                  className="p-1.5 text-gray-400 hover:text-brand rounded hover:bg-surface-chipActive"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(f.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <form
            onSubmit={editing ? handleUpdate : handleCreate}
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-md border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {editing ? t("folders.rename") : t("folders.newFolder")}
              </h2>
            </div>
            <div className="p-5 space-y-3">
              <Field label={t("folders.parent")}>
                <select
                  value={(editing ? editing.parent_id : form.parent_id) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    if (editing) setEditing({ ...editing, parent_id: v });
                    else setForm({ ...form, parent_id: v });
                  }}
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover focus:outline-none focus:border-edge-focus"
                >
                  <option value="">— {t("folders.none")} —</option>
                  {folders
                    .filter((f) => (editing ? f.id !== editing.id : true))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {pathFor(f, locale).join(" / ")}
                      </option>
                    ))}
                </select>
              </Field>
              {(["name_en", "name_az", "name_ru"] as const).map((field) => (
                <Field key={field} label={t(`admin.${field}` as any)}>
                  <input
                    required
                    value={(editing ? (editing as any)[field] : (form as any)[field]) ?? ""}
                    onChange={(e) => {
                      if (editing) setEditing({ ...editing, [field]: e.target.value } as FolderNode);
                      else setForm({ ...form, [field]: e.target.value });
                    }}
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  />
                </Field>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setEditing(null); }}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
