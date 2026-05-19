"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  FileText,
  Folder,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import { useFolders, pathFor, FolderNode } from "@/components/FolderPicker";

interface NewFolderForm {
  parent_id: string | null;
  name_az: string;
  name_ru: string;
  name_en: string;
}

const EMPTY: NewFolderForm = { parent_id: null, name_az: "", name_ru: "", name_en: "" };
const STORAGE_KEY = "folders.expanded";
const INDENT = 18;

export default function AdminFoldersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: folders = [], isLoading, mutate } = useFolders();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewFolderForm>(EMPTY);
  const [editing, setEditing] = useState<FolderNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Restore expanded state from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  // Persist expanded state whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(expanded)));
    } catch {}
  }, [expanded]);

  // Default: root nodes expanded the first time a folder is loaded.
  useEffect(() => {
    if (folders.length === 0) return;
    if (expanded.size > 0) return;
    const defaults = folders.filter((f) => f.depth === 1).map((f) => f.id);
    setExpanded(new Set(defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.length]);

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, FolderNode[]>();
    folders.forEach((f) => {
      const arr = m.get(f.parent_id) ?? [];
      arr.push(f);
      m.set(f.parent_id, arr);
    });
    m.forEach((arr) =>
      arr.sort((a, b) =>
        pathFor(a, locale).join("/").localeCompare(pathFor(b, locale).join("/")),
      ),
    );
    return m;
  }, [folders, locale]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    folders.forEach((f) => {
      if (pathFor(f, locale).join(" / ").toLowerCase().includes(q)) {
        // Mark the node and every ancestor as visible.
        let cur: FolderNode | undefined = f;
        while (cur) {
          set.add(cur.id);
          cur = folders.find((p) => p.id === cur!.parent_id);
        }
      }
    });
    return set;
  }, [folders, locale, search]);

  // When searching, auto-expand the matching subtrees.
  const effectiveExpanded = useMemo(() => {
    if (!matches) return expanded;
    return new Set<string>([...Array.from(expanded), ...Array.from(matches)]);
  }, [expanded, matches]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(folders.map((f) => f.id)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

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

  function renderBranch(parentId: string | null, depth: number): React.ReactNode {
    const kids = childrenOf.get(parentId) ?? [];
    if (kids.length === 0) return null;
    return kids.map((f) => {
      const hasChildren = (childrenOf.get(f.id)?.length ?? 0) > 0;
      const isOpen = effectiveExpanded.has(f.id);
      const visible = !matches || matches.has(f.id);
      const isMatch = !!matches &&
        pathFor(f, locale).join(" / ").toLowerCase().includes(search.trim().toLowerCase());
      const leaf = pathFor(f, locale).slice(-1)[0] ?? "";
      const fullPath = pathFor(f, locale).join(" / ");

      if (!visible) return null;

      return (
        <div key={f.id}>
          <div
            className={`group flex items-center gap-1.5 py-2 pr-3 rounded-[6px] hover:bg-surface-hover transition-colors ${
              matches && !isMatch ? "opacity-50" : ""
            }`}
            style={{ paddingLeft: 8 + depth * INDENT }}
            title={fullPath}
          >
            {hasChildren ? (
              <button
                onClick={() => toggle(f.id)}
                className="w-5 h-5 inline-flex items-center justify-center rounded text-ink-soft hover:text-brand hover:bg-surface-card flex-shrink-0"
                aria-label={isOpen ? "Collapse" : "Expand"}
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-5 h-5 flex-shrink-0" />
            )}
            <Folder className="w-4 h-4 text-brand-accent flex-shrink-0" />
            <span className="text-[13px] text-ink font-medium truncate">{leaf}</span>
            <span className="text-[11px] text-ink-soft inline-flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {f.document_count}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setEditing(f)}
              className="p-1.5 rounded text-ink-soft hover:text-brand hover:bg-surface-chipActive opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label={t("common.edit")}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDelete(f.id)}
              className="p-1.5 rounded text-ink-soft hover:text-danger-fg hover:bg-danger-bg opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label={t("common.delete")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {isOpen && renderBranch(f.id, depth + 1)}
        </div>
      );
    });
  }

  const rootCount = (childrenOf.get(null) ?? []).length;
  const matchCount = matches?.size ?? 0;

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("folders.editTitle")}</TopBarTitle>
        <div className="flex-1 max-w-[320px] relative ml-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("folders.filter")}
            className="w-full pl-8 pr-2.5 py-1.5 border border-edge-chip rounded-[6px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
          />
        </div>
        <TopBarButton onClick={expandAll}>{t("folders.expandAll")}</TopBarButton>
        <TopBarButton onClick={collapseAll}>{t("folders.collapseAll")}</TopBarButton>
        <TopBarButton
          variant="primary"
          onClick={() => {
            setShowCreate(true);
            setForm(EMPTY);
          }}
        >
          <Plus className="w-3 h-3" />
          {t("folders.newFolder")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4 space-y-3">
        {search && matches && (
          <p className="text-[11.5px] text-ink-soft">
            {matchCount > 0
              ? t("folders.matchSummary", { count: matchCount })
              : t("folders.noMatches", { q: search })}
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-ink-soft" />
          </div>
        ) : rootCount === 0 ? (
          <div className="bg-surface-card border border-edge-soft rounded-[10px] p-8 text-center">
            <p className="text-[12.5px] text-ink-soft">{t("folders.empty")}</p>
          </div>
        ) : (
          <div className="bg-surface-card border border-edge-soft rounded-[10px] py-1.5">
            {renderBranch(null, 0)}
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
              <h2 className="text-[15px] font-semibold text-ink">
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
                <Field key={field} label={t(`admin.${field}` as never)}>
                  <input
                    required
                    value={
                      (editing
                        ? (editing as unknown as Record<string, string>)[field]
                        : (form as unknown as Record<string, string>)[field]) ?? ""
                    }
                    onChange={(e) => {
                      if (editing)
                        setEditing({ ...editing, [field]: e.target.value } as FolderNode);
                      else setForm({ ...form, [field]: e.target.value });
                    }}
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-surface-card"
                  />
                </Field>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setEditing(null);
                }}
                className="px-3.5 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
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
      <span className="block text-[11px] font-medium text-ink-soft mb-1">{label}</span>
      {children}
    </label>
  );
}
