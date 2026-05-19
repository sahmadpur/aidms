"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import {
  Check,
  FileText,
  Folder,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";

interface Category {
  id: string;
  name_az: string;
  name_ru: string;
  name_en: string;
  usage_count: number;
  created_at: string;
}

const fetcher = (url: string) => api.get<Category[]>(url).then((r) => r.data);
const EMPTY = { name_az: "", name_ru: "", name_en: "" };

export default function CategoriesPage() {
  const t = useTranslations();
  const { data: categories, isLoading, mutate } = useSWR<Category[]>(
    "/admin/categories",
    fetcher,
  );

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/admin/categories", createForm);
      setCreateForm(EMPTY);
      setCreating(false);
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditForm({
      name_az: cat.name_az,
      name_ru: cat.name_ru,
      name_en: cat.name_en,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditSubmitting(true);
    try {
      await api.patch(`/admin/categories/${editingId}`, editForm);
      setEditingId(null);
      mutate();
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(cat: Category) {
    if (cat.usage_count === 0) {
      if (!confirm(t("common.delete") + "?")) return;
      await api.delete(`/admin/categories/${cat.id}`);
      mutate();
      return;
    }
    const msg = t("categories.deleteWithUsage", { count: cat.usage_count });
    if (!confirm(msg)) return;
    await api.delete(`/admin/categories/${cat.id}?force=true`);
    mutate();
  }

  const isEmpty = !isLoading && (categories?.length ?? 0) === 0;
  const showExplainer = isEmpty || (categories?.length ?? 0) < 4;

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("admin.categories")}</TopBarTitle>
        <TopBarButton
          variant="primary"
          onClick={() => {
            setCreating(true);
            setCreateForm(EMPTY);
          }}
        >
          <Plus className="w-3 h-3" />
          {t("categories.newButton")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4 space-y-4 max-w-[1100px]">
        {showExplainer && (
          <section className="bg-surface-card border border-edge-soft rounded-[10px] p-5">
            <h2 className="font-display text-[18px] text-brand-deep">
              {t("categories.explainerTitle")}
            </h2>
            <p className="text-[13px] text-ink-soft mt-1.5 leading-[1.55] max-w-[60ch]">
              {t("categories.explainerBody")}
            </p>
            <div className="mt-3 flex items-center gap-4 text-[12px]">
              <Link
                href="/documents"
                className="inline-flex items-center gap-1.5 text-brand font-medium hover:underline"
              >
                <FileText className="w-3.5 h-3.5" />
                {t("categories.browseDocuments")}
              </Link>
              <span className="text-edge-chip">·</span>
              <Link
                href="/admin/folders"
                className="inline-flex items-center gap-1.5 text-brand font-medium hover:underline"
              >
                <Folder className="w-3.5 h-3.5" />
                {t("categories.learnFolders")}
              </Link>
            </div>
          </section>
        )}

        {creating && (
          <form
            onSubmit={handleCreate}
            className="bg-surface-card border border-edge-soft rounded-[10px] p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-accent" />
              <h3 className="text-[13px] font-semibold text-ink">
                {t("admin.newCategory")}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["name_en", "name_az", "name_ru"] as const).map((field) => (
                <Field key={field} label={t(`admin.${field}` as never)}>
                  <input
                    required
                    value={createForm[field]}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, [field]: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                  />
                </Field>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setCreateForm(EMPTY);
                }}
                className="px-3.5 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-ink-soft" />
          </div>
        ) : isEmpty ? (
          <p className="text-[12.5px] text-ink-soft text-center py-6">
            {t("categories.empty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories!.map((cat) =>
              editingId === cat.id ? (
                <form
                  key={cat.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit();
                  }}
                  className="bg-surface-card border border-brand-accent rounded-[10px] p-4 space-y-2.5"
                >
                  {(["name_en", "name_az", "name_ru"] as const).map((field) => (
                    <Field key={field} label={t(`admin.${field}` as never)}>
                      <input
                        required
                        value={editForm[field]}
                        onChange={(e) =>
                          setEditForm({ ...editForm, [field]: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                      />
                    </Field>
                  ))}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-surface-hover"
                      aria-label={t("common.cancel")}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="p-1.5 rounded text-brand hover:bg-surface-chipActive disabled:opacity-50"
                      aria-label={t("common.save")}
                    >
                      {editSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <article
                  key={cat.id}
                  className="group bg-surface-card border border-edge-soft rounded-[10px] p-4 hover:border-edge-chip transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold text-ink truncate">
                        {cat.name_en}
                      </h3>
                      <p className="text-[11.5px] text-ink-soft mt-0.5 truncate">
                        {cat.name_az} · {cat.name_ru}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded text-ink-soft hover:text-brand hover:bg-surface-chipActive"
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat)}
                        className="p-1.5 rounded text-ink-soft hover:text-danger-fg hover:bg-danger-bg"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Link
                    href={`/documents?category_id=${cat.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] bg-surface-chipActive text-brand-deep hover:bg-brand-pale transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    {t("categories.usedBy", { count: cat.usage_count })}
                  </Link>
                </article>
              ),
            )}
          </div>
        )}
      </div>
    </>
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
      <span className="block text-[11px] font-medium text-ink-soft mb-1">{label}</span>
      {children}
    </label>
  );
}
