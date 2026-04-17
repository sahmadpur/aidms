"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import OCRTextPanel from "@/components/OCRTextPanel";
import { DocTypeBadge, OcrStatusDot } from "@/components/Badge";
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

  const [activeTab, setActiveTab] = useState<"pdf" | "ocr">("pdf");
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

  const fileUrl = `${API_URL}/documents/${id}/file`;

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
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
            </div>
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-edge-soft">
        {(["pdf", "ocr"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab ? "border-brand-accent text-brand" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "pdf" ? t("documents.viewFile") : t("documents.viewOcr")}
          </button>
        ))}
      </div>

      <div className="h-[70vh] bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden">
        {activeTab === "pdf" && <DocumentViewer fileUrl={fileUrl} />}
        {activeTab === "ocr" && <OCRTextPanel ocrText={ocrData?.ocr_text || ""} />}
      </div>
    </div>
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
