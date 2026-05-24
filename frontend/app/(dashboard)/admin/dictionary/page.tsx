"use client";

import { Fragment, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import { buildSegments } from "@/lib/highlight";

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

function pickLang(
  e: DictionaryEntry,
  locale: string,
): { term: string; definition: string } {
  if (locale === "az") return { term: e.term_az, definition: e.definition_az };
  if (locale === "ru") return { term: e.term_ru, definition: e.definition_ru };
  return { term: e.term_en, definition: e.definition_en };
}

export default function AdminDictionaryPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [scope, setScope] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showScopesPanel, setShowScopesPanel] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryForm>(EMPTY_ENTRY);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [submittingEntry, setSubmittingEntry] = useState(false);

  const { data: scopes = [], mutate: mutateScopes } = useSWR<Scope[]>(
    "/dictionary/scopes",
    fetcher,
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
    fetcher,
  );

  const { data: allEntries, mutate: mutateAll } = useSWR<ListResponse>(
    "/dictionary?limit=500",
    fetcher,
  );
  const scopeCounts = useMemo(() => {
    const m = new Map<string, number>();
    (allEntries?.items ?? []).forEach((e) =>
      m.set(e.scope, (m.get(e.scope) ?? 0) + 1),
    );
    return m;
  }, [allEntries]);
  const totalCount = allEntries?.items.length ?? 0;

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
    setEntryForm({ ...EMPTY_ENTRY, scope: scopes[0]?.key ?? "term" });
    setEditingEntryId(null);
    setShowEntryModal(true);
  }

  function openEdit(e: DictionaryEntry) {
    setEntryForm({
      scope: e.scope,
      term_az: e.term_az,
      term_ru: e.term_ru,
      term_en: e.term_en,
      definition_az: e.definition_az,
      definition_ru: e.definition_ru,
      definition_en: e.definition_en,
    });
    setEditingEntryId(e.id);
    setShowEntryModal(true);
  }

  async function handleSubmitEntry(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmittingEntry(true);
    try {
      if (editingEntryId) {
        await api.patch(`/admin/dictionary/${editingEntryId}`, entryForm);
      } else {
        await api.post("/admin/dictionary", entryForm);
      }
      setShowEntryModal(false);
      mutate();
      mutateAll();
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm(t("dictionary.confirmDelete"))) return;
    await api.delete(`/admin/dictionary/${id}`);
    mutate();
    mutateAll();
  }

  const groups = useMemo(() => {
    const sorted = [...(data?.items ?? [])].sort((a, b) =>
      pickLang(a, locale).term.localeCompare(pickLang(b, locale).term, locale),
    );
    const out = new Map<string, DictionaryEntry[]>();
    for (const e of sorted) {
      const term = pickLang(e, locale).term;
      const letter = (term[0] ?? "").toLocaleUpperCase(locale) || "#";
      const arr = out.get(letter) ?? [];
      arr.push(e);
      out.set(letter, arr);
    }
    return Array.from(out.entries());
  }, [data?.items, locale]);

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("dictionary.title")}</TopBarTitle>
        <div className="flex-1 max-w-[420px] relative ml-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dictionary.searchPlaceholder")}
            className="w-full pl-8 pr-3 py-1.5 border border-edge-chip rounded-[6px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
          />
        </div>
        <TopBarButton onClick={() => setShowScopesPanel(true)}>
          <Tags className="w-3 h-3" />
          {t("dictionary.manageScopes")}
        </TopBarButton>
        <TopBarButton variant="primary" onClick={openCreate}>
          <Plus className="w-3 h-3" />
          {t("dictionary.create")}
        </TopBarButton>
      </TopBar>

      <div className="flex gap-6 px-[22px] py-4 max-w-[1100px]">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-ink-soft" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="text-[12.5px] text-ink-soft italic py-16 text-center">
              {search
                ? t("dictionary.noResultsFor", { q: search })
                : t("dictionary.empty")}
            </p>
          ) : (
            <div className="space-y-10 pb-12">
              {groups.map(([letter, entries]) => (
                <section key={letter}>
                  <h2 className="font-display text-[28px] leading-none text-brand-deep sticky top-[80px] bg-surface py-2 z-0">
                    {letter}
                  </h2>
                  <ul className="mt-2 divide-y divide-edge-soft">
                    {entries.map((e) => (
                      <li key={e.id} className="py-4 group">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                          <h3 className="font-display text-[18px] text-ink leading-tight">
                            <Highlighted text={pickLang(e, locale).term} needle={search} />
                          </h3>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-surface-chipActive text-brand-deep text-[10.5px] font-medium font-mono uppercase tracking-wider">
                              {scopeLabel(e.scope)}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEdit(e)}
                                className="p-1 rounded text-ink-soft hover:text-brand hover:bg-surface-chipActive"
                                aria-label={t("common.edit")}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(e.id)}
                                className="p-1 rounded text-ink-soft hover:text-danger-fg hover:bg-danger-bg"
                                aria-label={t("common.delete")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink whitespace-pre-wrap">
                          <Highlighted
                            text={pickLang(e, locale).definition}
                            needle={search}
                          />
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="w-[220px] flex-shrink-0 sticky top-[80px] self-start space-y-0.5">
          <ScopeLink
            active={scope === ""}
            onClick={() => setScope("")}
            label={t("dictionary.scopeAll")}
            count={totalCount}
          />
          {scopes.map((s) => (
            <ScopeLink
              key={s.id}
              active={scope === s.key}
              onClick={() => setScope(s.key)}
              label={pickScopeName(s, locale)}
              count={scopeCounts.get(s.key) ?? 0}
            />
          ))}
        </aside>
      </div>

      {showEntryModal && (
        <EntryModal
          form={entryForm}
          setForm={setEntryForm}
          scopes={scopes}
          locale={locale}
          editing={!!editingEntryId}
          submitting={submittingEntry}
          onClose={() => setShowEntryModal(false)}
          onSubmit={handleSubmitEntry}
        />
      )}

      {showScopesPanel && (
        <ScopesPanel
          scopes={scopes}
          locale={locale}
          onClose={() => setShowScopesPanel(false)}
          mutate={() => {
            mutateScopes();
            mutate();
            mutateAll();
          }}
        />
      )}
    </>
  );
}

function ScopeLink({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center justify-between gap-2 py-1.5 rounded-[6px] text-[13px] transition-colors border-l-[3px] pl-[9px] pr-3 ${
        active
          ? "bg-surface-chipActive text-brand-deep border-brand-accent"
          : "text-ink-soft hover:text-ink hover:bg-surface-hover border-transparent"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-ink-soft">{count}</span>
    </button>
  );
}

function Highlighted({ text, needle }: { text: string; needle: string }) {
  if (!needle.trim()) return <>{text}</>;
  const segs = buildSegments(text, needle);
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="bg-brand-pale text-brand-deep rounded-[2px] px-0.5"
          >
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

function EntryModal({
  form,
  setForm,
  scopes,
  locale,
  editing,
  submitting,
  onClose,
  onSubmit,
}: {
  form: EntryForm;
  setForm: (f: EntryForm) => void;
  scopes: Scope[];
  locale: string;
  editing: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useTranslations();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={onSubmit}
        className="bg-surface-card rounded-xl shadow-xl w-full max-w-2xl border border-edge-soft"
      >
        <div className="px-5 py-4 border-b border-edge-soft">
          <h2 className="text-[15px] font-semibold text-ink">
            {editing ? t("dictionary.update") : t("dictionary.create")}
          </h2>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <label className="block">
            <span className="block text-[11px] font-medium text-ink-soft mb-1">
              {t("dictionary.scopeLabel")}
            </span>
            <select
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
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
                <span className="block text-[11px] font-medium text-ink-soft mb-1">
                  {t(`dictionary.${field}` as never)}
                </span>
                <input
                  required
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                />
              </label>
            ))}
          </div>

          {(["definition_en", "definition_az", "definition_ru"] as const).map(
            (field) => (
              <label key={field} className="block">
                <span className="block text-[11px] font-medium text-ink-soft mb-1">
                  {t(`dictionary.${field}` as never)}
                </span>
                <textarea
                  required
                  rows={3}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card resize-y"
                />
              </label>
            ),
          )}
        </div>
        <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
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
  );
}

function ScopesPanel({
  scopes,
  locale,
  onClose,
  mutate,
}: {
  scopes: Scope[];
  locale: string;
  onClose: () => void;
  mutate: () => void;
}) {
  const t = useTranslations();
  const [newScope, setNewScope] = useState<ScopeForm>(EMPTY_SCOPE);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateErr(null);
    try {
      await api.post("/admin/dictionary/scopes", newScope);
      setNewScope(EMPTY_SCOPE);
      mutate();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("dictionary.scopeError");
      setCreateErr(detail);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-surface-card rounded-xl shadow-xl w-full max-w-2xl border border-edge-soft">
        <div className="px-5 py-4 border-b border-edge-soft flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">
            {t("dictionary.manageScopes")}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-ink-soft hover:text-ink rounded"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <form
            onSubmit={handleCreate}
            className="space-y-2 bg-surface-hover border border-edge-soft rounded-[8px] p-3"
          >
            <p className="text-[11px] font-medium text-ink">
              {t("dictionary.newScope")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                required
                placeholder={t("dictionary.scopeKey")}
                value={newScope.key}
                onChange={(e) =>
                  setNewScope({ ...newScope, key: e.target.value })
                }
                className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-card outline-none focus:border-edge-focus font-mono"
              />
              {(["name_en", "name_az", "name_ru"] as const).map((field) => (
                <input
                  key={field}
                  required
                  placeholder={t(`dictionary.scopeName_${field.split("_")[1]}` as never)}
                  value={newScope[field]}
                  onChange={(e) =>
                    setNewScope({ ...newScope, [field]: e.target.value })
                  }
                  className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-card outline-none focus:border-edge-focus"
                />
              ))}
            </div>
            <p className="text-[10px] text-ink-soft">
              {t("dictionary.scopeKeyHint")}
            </p>
            {createErr && (
              <p className="text-[11px] text-danger-fg">{createErr}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="px-3 py-1 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover disabled:opacity-50 inline-flex items-center gap-1"
              >
                {creating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                {t("common.save")}
              </button>
            </div>
          </form>

          <p className="text-[11px] text-ink-soft pt-1">
            {t("dictionary.renameScopeHelp")}
          </p>

          <ul className="space-y-1.5">
            {scopes.map((s) => (
              <ScopeRow key={s.id} scope={s} locale={locale} onChange={mutate} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ScopeRow({
  scope,
  locale,
  onChange,
}: {
  scope: Scope;
  locale: string;
  onChange: () => void;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ScopeForm>({
    key: scope.key,
    name_az: scope.name_az,
    name_ru: scope.name_ru,
    name_en: scope.name_en,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSubmitting(true);
    setErr(null);
    try {
      await api.patch(`/admin/dictionary/scopes/${scope.id}`, form);
      setEditing(false);
      onChange();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("dictionary.scopeError");
      setErr(detail);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (
      !confirm(
        t("dictionary.confirmDeleteScope", {
          name: pickScopeName(scope, locale),
        }),
      )
    )
      return;
    await api.delete(`/admin/dictionary/scopes/${scope.id}`);
    onChange();
  }

  if (editing) {
    return (
      <li className="bg-surface-hover border border-brand-accent rounded-[6px] p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            required
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            placeholder={t("dictionary.scopeKey")}
            className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-card outline-none focus:border-edge-focus font-mono"
          />
          {(["name_en", "name_az", "name_ru"] as const).map((field) => (
            <input
              key={field}
              required
              value={form[field]}
              onChange={(e) =>
                setForm({ ...form, [field]: e.target.value })
              }
              placeholder={t(`dictionary.scopeName_${field.split("_")[1]}` as never)}
              className="px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-card outline-none focus:border-edge-focus"
            />
          ))}
        </div>
        {err && <p className="text-[11px] text-danger-fg">{err}</p>}
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setErr(null);
              setForm({
                key: scope.key,
                name_az: scope.name_az,
                name_ru: scope.name_ru,
                name_en: scope.name_en,
              });
            }}
            className="p-1.5 rounded text-ink-soft hover:text-ink hover:bg-surface-hover"
            aria-label={t("common.cancel")}
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={save}
            className="p-1.5 rounded text-brand hover:bg-surface-chipActive disabled:opacity-50"
            aria-label={t("common.save")}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between bg-surface-card border border-edge-soft rounded-[6px] px-3 py-2 group">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink font-medium">
          {pickScopeName(scope, locale)}
          <span className="ml-2 text-[10px] text-ink-soft font-mono">
            {scope.key}
          </span>
        </div>
        <div className="text-[10.5px] text-ink-soft">
          {scope.name_en} · {scope.name_az} · {scope.name_ru}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded text-ink-soft hover:text-brand hover:bg-surface-chipActive"
          title={t("dictionary.renameScope")}
          aria-label={t("dictionary.renameScope")}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={remove}
          className="p-1.5 rounded text-ink-soft hover:text-danger-fg hover:bg-danger-bg"
          aria-label={t("common.delete")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}
