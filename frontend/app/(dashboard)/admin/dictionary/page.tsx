"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Plus, Trash2, Loader2, Pencil, Search, Tags } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import { FilterBar, FilterChip } from "@/components/FilterBar";

interface DictionaryEntry {
  id: string;
  scope: string;
  term_az: string;
  term_ru: string;
  term_en: string;
  definition_az: string;
  definition_ru: string;
  definition_en: string;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  items: DictionaryEntry[];
  total: number;
}

interface Scope {
  id: string;
  key: string;
  name_az: string;
  name_ru: string;
  name_en: string;
}

interface EntryForm {
  scope: string;
  term_az: string;
  term_ru: string;
  term_en: string;
  definition_az: string;
  definition_ru: string;
  definition_en: string;
}

interface ScopeForm {
  key: string;
  name_az: string;
  name_ru: string;
  name_en: string;
}

const EMPTY_ENTRY: EntryForm = {
  scope: "term",
  term_az: "",
  term_ru: "",
  term_en: "",
  definition_az: "",
  definition_ru: "",
  definition_en: "",
};

const EMPTY_SCOPE: ScopeForm = {
  key: "",
  name_az: "",
  name_ru: "",
  name_en: "",
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

function pickScopeName(s: Scope, locale: string): string {
  if (locale === "az") return s.name_az;
  if (locale === "ru") return s.name_ru;
  return s.name_en;
}

export default function AdminDictionaryPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [scope, setScope] = useState<string>("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<EntryForm>(EMPTY_ENTRY);
  const [showModal, setShowModal] = useState(false);
  const [showScopesModal, setShowScopesModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scopeForm, setScopeForm] = useState<ScopeForm>(EMPTY_SCOPE);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeSubmitting, setScopeSubmitting] = useState(false);

  const { data: scopes = [], mutate: mutateScopes } = useSWR<Scope[]>(
    "/dictionary/scopes",
    fetcher
  );

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (scope) p.set("scope", scope);
    if (search) p.set("q", search);
    p.set("limit", "500");
    return p.toString();
  }, [scope, search]);

  const { data, isLoading, mutate } = useSWR<ListResponse>(
    `/dictionary?${qs}`,
    fetcher
  );

  const scopeByKey = useMemo(() => {
    const m = new Map<string, Scope>();
    scopes.forEach((s) => m.set(s.key, s));
    return m;
  }, [scopes]);

  function scopeLabel(key: string): string {
    const s = scopeByKey.get(key);
    return s ? pickScopeName(s, locale) : key;
  }

  function openCreate() {
    setForm({ ...EMPTY_ENTRY, scope: scopes[0]?.key ?? "term" });
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(e: DictionaryEntry) {
    setForm({
      scope: e.scope,
      term_az: e.term_az,
      term_ru: e.term_ru,
      term_en: e.term_en,
      definition_az: e.definition_az,
      definition_ru: e.definition_ru,
      definition_en: e.definition_en,
    });
    setEditingId(e.id);
    setShowModal(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/admin/dictionary/${editingId}`, form);
      } else {
        await api.post("/admin/dictionary", form);
      }
      setShowModal(false);
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("dictionary.confirmDelete"))) return;
    await api.delete(`/admin/dictionary/${id}`);
    mutate();
  }

  async function handleAddScope(ev: React.FormEvent) {
    ev.preventDefault();
    setScopeSubmitting(true);
    setScopeError(null);
    try {
      await api.post("/admin/dictionary/scopes", scopeForm);
      setScopeForm(EMPTY_SCOPE);
      mutateScopes();
    } catch (err: any) {
      setScopeError(
        err?.response?.data?.detail ?? t("dictionary.scopeError")
      );
    } finally {
      setScopeSubmitting(false);
    }
  }

  async function handleDeleteScope(s: Scope) {
    if (!confirm(t("dictionary.confirmDeleteScope", { name: pickScopeName(s, locale) }))) return;
    await api.delete(`/admin/dictionary/scopes/${s.id}`);
    mutateScopes();
    // entries that referenced this scope keep their (now-orphaned) tag — show as raw key
    mutate();
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("dictionary.title")}</TopBarTitle>
        <div className="flex-1 max-w-[340px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dictionary.search")}
            className="w-full pl-8 pr-3 py-1.5 border border-edge-chip rounded-[6px] text-[12px] bg-white outline-none focus:border-edge-focus"
          />
        </div>
        <TopBarButton onClick={() => setShowScopesModal(true)}>
          <Tags className="w-3 h-3" />
          {t("dictionary.manageScopes")}
        </TopBarButton>
        <TopBarButton variant="primary" onClick={openCreate}>
          <Plus className="w-3 h-3" />
          {t("dictionary.create")}
        </TopBarButton>
      </TopBar>

      <FilterBar>
        <FilterChip active={scope === ""} onClick={() => setScope("")}>
          {t("filters.all")}
        </FilterChip>
        {scopes.map((s) => (
          <FilterChip key={s.id} active={scope === s.key} onClick={() => setScope(s.key)}>
            {pickScopeName(s, locale)}
          </FilterChip>
        ))}
      </FilterBar>

      <div className="px-[22px] py-4 space-y-2 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : data && data.items.length === 0 ? (
          <p className="text-[12.5px] text-gray-500 italic py-6 text-center">
            {t("dictionary.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {data?.items.map((e) => (
              <li
                key={e.id}
                className="bg-surface-card border border-edge-soft rounded-[10px] px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900">
                      {e.term_en}
                    </span>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-surface-chipActive text-[#3b6d11] text-[10px] font-medium">
                      {scopeLabel(e.scope)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {e.term_az} · {e.term_ru}
                  </p>
                  <p className="text-[12px] text-gray-700 mt-1.5 line-clamp-2 whitespace-pre-wrap">
                    {e.definition_en}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(e)}
                    className="p-1.5 text-gray-500 hover:text-brand rounded hover:bg-surface-hover"
                    title={t("common.edit")}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(e.id)}
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
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-2xl border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {editingId ? t("dictionary.update") : t("dictionary.create")}
              </h2>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <label className="block">
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  {t("dictionary.scopeLabel")}
                </span>
                <select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                >
                  {scopes.length === 0 && (
                    <option value={form.scope}>{form.scope}</option>
                  )}
                  {scopes.map((s) => (
                    <option key={s.id} value={s.key}>
                      {pickScopeName(s, locale)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["term_en", "term_az", "term_ru"] as const).map((field) => (
                  <label key={field} className="block">
                    <span className="block text-[11px] font-medium text-gray-600 mb-1">
                      {t(`dictionary.${field}` as "dictionary.term_en")}
                    </span>
                    <input
                      required
                      value={form[field]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                    />
                  </label>
                ))}
              </div>

              {(["definition_en", "definition_az", "definition_ru"] as const).map((field) => (
                <label key={field} className="block">
                  <span className="block text-[11px] font-medium text-gray-600 mb-1">
                    {t(`dictionary.${field}` as "dictionary.definition_en")}
                  </span>
                  <textarea
                    required
                    rows={3}
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white resize-y"
                  />
                </label>
              ))}
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
                disabled={submitting}
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
              >
                {submitting ? t("common.loading") : t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {showScopesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-surface-card rounded-xl shadow-xl w-full max-w-2xl border border-edge-soft">
            <div className="px-5 py-4 border-b border-edge-soft flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {t("dictionary.manageScopes")}
              </h2>
              <button
                onClick={() => { setShowScopesModal(false); setScopeError(null); }}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none"
                aria-label={t("common.close")}
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <form onSubmit={handleAddScope} className="space-y-2 bg-surface-hover border border-edge-soft rounded-[8px] p-3">
                <p className="text-[11px] font-medium text-gray-700">
                  {t("dictionary.newScope")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    required
                    placeholder={t("dictionary.scopeKey")}
                    value={scopeForm.key}
                    onChange={(e) => setScopeForm({ ...scopeForm, key: e.target.value })}
                    className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-white outline-none focus:border-edge-focus font-mono"
                  />
                  <input
                    required
                    placeholder={t("dictionary.scopeName_en")}
                    value={scopeForm.name_en}
                    onChange={(e) => setScopeForm({ ...scopeForm, name_en: e.target.value })}
                    className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-white outline-none focus:border-edge-focus"
                  />
                  <input
                    required
                    placeholder={t("dictionary.scopeName_az")}
                    value={scopeForm.name_az}
                    onChange={(e) => setScopeForm({ ...scopeForm, name_az: e.target.value })}
                    className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-white outline-none focus:border-edge-focus"
                  />
                  <input
                    required
                    placeholder={t("dictionary.scopeName_ru")}
                    value={scopeForm.name_ru}
                    onChange={(e) => setScopeForm({ ...scopeForm, name_ru: e.target.value })}
                    className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-white outline-none focus:border-edge-focus"
                  />
                </div>
                <p className="text-[10px] text-gray-500">{t("dictionary.scopeKeyHint")}</p>
                {scopeError && (
                  <p className="text-[11px] text-red-600">{scopeError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={scopeSubmitting}
                    className="px-3 py-1 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover disabled:opacity-50 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    {scopeSubmitting ? t("common.loading") : t("common.save")}
                  </button>
                </div>
              </form>

              <ul className="space-y-1.5">
                {scopes.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between bg-white border border-edge-soft rounded-[6px] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-gray-900 font-medium">
                        {pickScopeName(s, locale)}
                        <span className="ml-2 text-[10px] text-gray-400 font-mono">{s.key}</span>
                      </div>
                      <div className="text-[10.5px] text-gray-500">
                        {s.name_en} · {s.name_az} · {s.name_ru}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteScope(s)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                      title={t("common.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
