"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  ScanText,
  Trash2,
} from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import OCRTextPanel from "@/components/OCRTextPanel";
import CommentsPanel from "@/components/CommentsPanel";
import { DocTypeBadge, OcrStatusDot, ValidationStatusDot } from "@/components/Badge";
import { ApprovalBadge } from "@/components/ApprovalBadge";
import { ApprovalActions } from "@/components/ApprovalActions";
import { FolderPicker, FolderBreadcrumb, useFolders } from "@/components/FolderPicker";
import api, { API_URL } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import type { Department, Document } from "@/lib/types";
import { DOC_TYPES, localizedName, formatBytes } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface EditForm {
  title: string;
  description: string | null;
  language: string | null;
  doc_type: string | null;
  physical_location: string | null;
  folder_id: string | null;
  department_id: string | null;
}

export default function DocumentDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const searchParams = useSearchParams();
  const initialRail =
    searchParams.get("tab") === "ocr"
      ? "ocr"
      : searchParams.get("tab") === "pdf"
      ? null
      : "comments";
  const [railTab, setRailTab] = useState<"comments" | "ocr">(
    initialRail === "ocr" ? "ocr" : "comments"
  );
  const [railOpen, setRailOpen] = useState<boolean>(initialRail !== null);
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "ocr") {
      setRailTab("ocr");
      setRailOpen(true);
    } else if (t === "comments") {
      setRailTab("comments");
      setRailOpen(true);
    } else if (t === "pdf") {
      setRailOpen(false);
    }
  }, [searchParams]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: me } = useMe();
  const { data: doc, isLoading, mutate } = useSWR<Document>(`/documents/${id}`, fetcher);
  const { data: ocrData } = useSWR(
    doc?.ocr_status === "completed" ? `/documents/${id}/ocr-text` : null,
    fetcher
  );
  const { data: folders } = useFolders();
  const { data: departments = [] } = useSWR<Department[]>("/admin/departments", fetcher, {
    revalidateOnFocus: false,
  });

  async function handleReprocess() {
    await api.post(`/documents/${id}/reprocess`);
    mutate();
  }

  async function handleSave() {
    if (!doc || !form) return;
    const updates: Partial<EditForm> = {};
    (Object.keys(form) as (keyof EditForm)[]).forEach((k) => {
      if (form[k] !== (doc as any)[k]) (updates as any)[k] = form[k];
    });
    if (Object.keys(updates).length > 0) {
      await api.patch(`/documents/${id}`, updates);
    }
    setEditing(false);
    mutate();
  }

  async function handleDelete() {
    if (!confirm(t("documents.confirmDelete"))) return;
    setDeleting(true);
    try {
      await api.delete(`/documents/${id}`);
      router.push("/documents");
    } catch (e) {
      setDeleting(false);
      alert(t("errors.generic"));
    }
  }

  const canWrite = !!me && !!doc && (me.role === "admin" || me.id === doc.user_id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!doc) return <p className="p-6 text-gray-500">{t("errors.notFound")}</p>;

  // Cache-bust the PDF URL whenever the underlying row changes (e.g. after a
  // resubmit replaces the file). Without this, the browser shows the cached PDF.
  const fileUrl = `${API_URL}/documents/${id}/file?v=${encodeURIComponent(doc.updated_at)}`;

  return (
    <div className="p-6 max-w-[1500px] mx-auto h-full flex flex-col gap-4">
      <div className="flex items-center gap-2 text-[12px] text-gray-500">
        <Link href="/documents" className="inline-flex items-center gap-1 hover:text-brand">
          <ArrowLeft className="w-3.5 h-3.5" /> {t("documents.title")}
        </Link>
        <span>/</span>
        <span className="font-mono">{doc.display_id ?? "—"}</span>
      </div>

      <div className="bg-surface-card border border-edge-soft rounded-[10px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editing && form ? (
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full text-lg font-semibold border-b border-edge-chip focus:outline-none focus:border-edge-focus"
              />
            ) : (
              <h1 className="text-lg font-semibold text-gray-900 truncate">{doc.title}</h1>
            )}
            <div className="text-[12px] text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              <span>{new Date(doc.created_at).toLocaleDateString(locale)}</span>
              <span>·</span>
              <span>{formatBytes(doc.file_size_bytes)}</span>
              {doc.doc_type && !editing && (
                <>
                  <span>·</span>
                  <DocTypeBadge type={doc.doc_type} label={t(`docType.${doc.doc_type}`)} />
                </>
              )}
              <span>·</span>
              <OcrStatusDot status={doc.ocr_status} label={t(`ocr.${doc.ocr_status}`)} />
              <span>·</span>
              <ApprovalBadge
                status={doc.approval_status}
                label={t(`approval.s_${doc.approval_status}`)}
              />
              <span>·</span>
              <ValidationStatusDot
                status={doc.validation_status}
                label={t(`validation.status.${doc.validation_status}`)}
              />
            </div>
            {me && (
              <div className="mt-3">
                <ApprovalActions doc={doc} me={me} onChange={mutate} size="md" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canWrite && doc.ocr_status !== "completed" && doc.ocr_status !== "processing" && (
              <button
                onClick={handleReprocess}
                className="px-3 py-1.5 text-[12px] bg-white border border-edge-chip text-brand rounded-[6px] hover:bg-[#f0f7e6] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                {t("documents.reprocess")}
              </button>
            )}
            {editing && form ? (
              <>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover"
                >
                  {t("common.save")}
                </button>
                <button
                  onClick={() => { setEditing(false); setForm(null); }}
                  className="px-3 py-1.5 text-[12px] bg-white border border-edge-chip text-gray-700 rounded-[6px] hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : canWrite ? (
              <>
                <button
                  onClick={() => {
                    setForm({
                      title: doc.title,
                      description: doc.description,
                      language: doc.language,
                      doc_type: doc.doc_type,
                      physical_location: doc.physical_location,
                      folder_id: doc.folder_id,
                      department_id: doc.department_id,
                    });
                    setEditing(true);
                  }}
                  className="px-3 py-1.5 text-[12px] bg-white border border-edge-chip text-brand rounded-[6px] hover:bg-[#f0f7e6]"
                >
                  {t("documents.edit")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-[12px] bg-white border border-[#e0b4b4] text-[#c94949] rounded-[6px] hover:bg-[#fdf1f1] inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  {t("documents.delete")}
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-edge-soft">
          <MetaField label={t("documents.type")}>
            {editing && form ? (
              <select
                value={form.doc_type ?? ""}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value || null })}
                className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
              >
                <option value="">—</option>
                {DOC_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {t(`docType.${tp}`)}
                  </option>
                ))}
              </select>
            ) : (
              <DocTypeBadge type={doc.doc_type} label={doc.doc_type ? t(`docType.${doc.doc_type}`) : undefined} />
            )}
          </MetaField>
          <MetaField label={t("documents.department")}>
            {editing && form ? (
              <select
                value={form.department_id ?? ""}
                onChange={(e) => setForm({ ...form, department_id: e.target.value || null })}
                className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {localizedName(d, locale)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[12px] text-gray-800">
                {doc.department_id
                  ? localizedName(departments.find((d) => d.id === doc.department_id) ?? { name_az: "—", name_ru: "—", name_en: "—" }, locale)
                  : "—"}
              </span>
            )}
          </MetaField>
          <MetaField label={t("documents.folder")}>
            {editing && form ? (
              <FolderPicker value={form.folder_id} onChange={(v) => setForm({ ...form, folder_id: v })} locale={locale} />
            ) : (
              <FolderBreadcrumb folderId={doc.folder_id} folders={folders} locale={locale} />
            )}
          </MetaField>
          <MetaField label={t("documents.physicalLocation")}>
            {editing && form ? (
              <input
                value={form.physical_location ?? ""}
                onChange={(e) => setForm({ ...form, physical_location: e.target.value })}
                className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
              />
            ) : (
              <span className="text-[12px] text-gray-800">{doc.physical_location ?? "—"}</span>
            )}
          </MetaField>
        </div>
      </div>

      {doc.validation_status === "failed" && (
        <ValidationFailedBanner doc={doc} />
      )}

      {/* Workspace: PDF on the left, collapsible side rail on the right. */}
      <div className="flex gap-3 flex-1 min-h-[520px]">
        <div className="flex-1 min-w-0 bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden">
          <DocumentViewer fileUrl={fileUrl} />
        </div>

        {railOpen ? (
          <aside className="w-[420px] flex-shrink-0 bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden flex flex-col">
            <div className="flex items-center border-b border-edge-soft pl-2 pr-1">
              <RailTab
                active={railTab === "comments"}
                onClick={() => setRailTab("comments")}
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                label={t("commentsPanel.title")}
              />
              <RailTab
                active={railTab === "ocr"}
                onClick={() => setRailTab("ocr")}
                icon={<ScanText className="w-3.5 h-3.5" />}
                label={t("ocrPanel.title")}
              />
              <div className="flex-1" />
              <button
                onClick={() => setRailOpen(false)}
                className="p-1.5 rounded-[5px] text-gray-400 hover:text-brand hover:bg-surface-hover"
                title={t("documents.collapsePanel")}
                aria-label={t("documents.collapsePanel")}
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {railTab === "comments" ? (
                <CommentsPanel documentId={id} />
              ) : (
                <OCRTextPanel
                  ocrText={ocrData?.ocr_text || ""}
                  ocrStatus={doc.ocr_status}
                  language={doc.language}
                  documentTitle={doc.title}
                />
              )}
            </div>
          </aside>
        ) : (
          <div className="flex-shrink-0 flex flex-col gap-2">
            <RailExpandButton
              icon={<MessageSquare className="w-4 h-4" />}
              label={t("commentsPanel.title")}
              onClick={() => {
                setRailTab("comments");
                setRailOpen(true);
              }}
            />
            <RailExpandButton
              icon={<ScanText className="w-4 h-4" />}
              label={t("ocrPanel.title")}
              onClick={() => {
                setRailTab("ocr");
                setRailOpen(true);
              }}
            />
            <RailExpandButton
              icon={<PanelRightOpen className="w-4 h-4" />}
              label={t("documents.expandPanel")}
              onClick={() => setRailOpen(true)}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RailTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-[12.5px] font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
        active
          ? "border-brand-accent text-brand"
          : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RailExpandButton({
  icon,
  label,
  onClick,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group bg-surface-card border border-edge-soft rounded-[10px] hover:border-edge-chip hover:bg-surface-hover transition-colors text-gray-500 hover:text-brand inline-flex flex-col items-center justify-center w-10 ${
        compact ? "py-2" : "py-3 gap-2"
      }`}
    >
      {icon}
      {!compact && (
        <span
          className="text-[10.5px] tracking-wider uppercase whitespace-nowrap"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function ValidationFailedBanner({
  doc,
}: {
  doc: { validation_results: { rule_name: string; severity: string; passed: boolean; message: string }[] | null };
}) {
  const t = useTranslations();
  const failed = (doc.validation_results ?? []).filter(
    (r) => !r.passed && r.severity === "error"
  );
  const warnings = (doc.validation_results ?? []).filter(
    (r) => !r.passed && r.severity === "warning"
  );
  return (
    <div className="bg-red-50 border border-red-200 rounded-[10px] p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-red-800">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm0 7a1 1 0 112 0 1 1 0 01-2 0z"
            clipRule="evenodd"
          />
        </svg>
        {t("validation.banner.title", { count: failed.length })}
      </div>
      <ul className="text-[11.5px] text-red-700 list-disc pl-5 space-y-0.5">
        {failed.map((r, i) => (
          <li key={`e-${i}`}>
            <span className="font-medium">{r.rule_name}</span>
            {r.message && (
              <span className="text-red-600"> — {r.message}</span>
            )}
          </li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-amber-700 pt-1.5">
            {t("validation.banner.warnings")}
          </div>
          <ul className="text-[11.5px] text-amber-700 list-disc pl-5 space-y-0.5">
            {warnings.map((r, i) => (
              <li key={`w-${i}`}>
                <span className="font-medium">{r.rule_name}</span>
                {r.message && (
                  <span className="text-amber-600"> — {r.message}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
