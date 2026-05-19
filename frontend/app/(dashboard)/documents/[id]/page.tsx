"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { Comment } from "@/lib/types";
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
  const tabParam = searchParams.get("tab");
  const [railTab, setRailTab] = useState<"comments" | "ocr">(
    tabParam === "ocr" ? "ocr" : "comments"
  );
  const [railMode, setRailMode] = useState<"expanded" | "collapsed">(
    tabParam === "pdf" ? "collapsed" : "expanded"
  );
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "ocr") {
      setRailTab("ocr");
      setRailMode("expanded");
    } else if (t === "comments") {
      setRailTab("comments");
      setRailMode("expanded");
    } else if (t === "pdf") {
      setRailMode("collapsed");
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
  // Dedupe: CommentsPanel keys off the same URL, SWR shares the response.
  const { data: comments = [] } = useSWR<Comment[]>(
    `/documents/${id}/comments`,
    fetcher,
  );

  const commentCount = comments.length;
  const mentionsMeCount = useMemo(() => {
    if (!me) return 0;
    const needle = `(${me.id})`;
    return comments.reduce(
      (n, c) => (c.body.includes(needle) ? n + 1 : n),
      0,
    );
  }, [comments, me]);
  const ocrWordCount = useMemo(() => {
    const text = ocrData?.ocr_text?.trim() ?? "";
    return text ? text.split(/\s+/).length : 0;
  }, [ocrData?.ocr_text]);
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
                className="px-3 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-brand rounded-[6px] hover:bg-surface-chipActive inline-flex items-center gap-1.5"
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
                  className="px-3 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
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
                  className="px-3 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-brand rounded-[6px] hover:bg-surface-chipActive"
                >
                  {t("documents.edit")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-[12px] bg-surface-card border border-danger-edge text-danger-fg rounded-[6px] hover:bg-danger-bg inline-flex items-center gap-1.5 disabled:opacity-50"
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

        {railMode === "expanded" ? (
          <aside className="w-[420px] flex-shrink-0 bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden flex flex-col">
            <div className="flex items-stretch border-b border-edge-soft">
              <RailTab
                active={railTab === "comments"}
                onClick={() => setRailTab("comments")}
                icon={<MessageSquare className="w-[18px] h-[18px]" />}
                label={t("documents.rail.discussionTab")}
                badge={
                  mentionsMeCount > 0
                    ? {
                        kind: "accent",
                        text: t("documents.rail.mentionsCount", {
                          count: mentionsMeCount,
                        }),
                      }
                    : commentCount > 0
                    ? { kind: "neutral", text: String(commentCount) }
                    : null
                }
              />
              <RailTab
                active={railTab === "ocr"}
                onClick={() => setRailTab("ocr")}
                icon={<ScanText className="w-[18px] h-[18px]" />}
                label={t("documents.rail.ocrTab")}
                badge={
                  doc.ocr_status === "completed" && ocrWordCount > 0
                    ? {
                        kind: "neutral",
                        text: formatCount(ocrWordCount) + " w",
                      }
                    : null
                }
              />
              <div className="flex-1" />
              <button
                onClick={() => setRailMode("collapsed")}
                className="px-3 text-ink-soft hover:text-brand hover:bg-surface-hover transition-colors"
                title={t("documents.rail.collapse")}
                aria-label={t("documents.rail.collapse")}
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
          <aside className="w-[64px] flex-shrink-0 bg-surface-card border border-edge-soft rounded-[10px] flex flex-col items-stretch p-1.5 gap-1.5">
            <RailTile
              active={false}
              icon={<MessageSquare className="w-[20px] h-[20px]" />}
              label={t("documents.rail.discussionTab")}
              badge={
                mentionsMeCount > 0
                  ? {
                      kind: "accent",
                      text: String(mentionsMeCount),
                    }
                  : commentCount > 0
                  ? { kind: "neutral", text: String(commentCount) }
                  : null
              }
              onClick={() => {
                setRailTab("comments");
                setRailMode("expanded");
              }}
            />
            <RailTile
              active={false}
              icon={<ScanText className="w-[20px] h-[20px]" />}
              label={t("documents.rail.ocrTab")}
              badge={
                doc.ocr_status === "completed" && ocrWordCount > 0
                  ? { kind: "neutral", text: formatCount(ocrWordCount) }
                  : null
              }
              onClick={() => {
                setRailTab("ocr");
                setRailMode("expanded");
              }}
            />
            <div className="flex-1" />
            <button
              onClick={() => setRailMode("expanded")}
              title={t("documents.rail.expand")}
              aria-label={t("documents.rail.expand")}
              className="w-full h-9 rounded-[6px] inline-flex items-center justify-center text-ink-soft hover:text-brand hover:bg-surface-hover transition-colors"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}

type RailBadge = { kind: "accent" | "neutral"; text: string } | null;

function RailTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge: RailBadge;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[44px] px-4 text-[14px] font-semibold inline-flex items-center gap-2 border-b-[3px] -mb-px transition-colors ${
        active
          ? "border-brand-accent text-brand-deep"
          : "border-transparent text-ink-soft hover:text-ink"
      }`}
    >
      <span className={active ? "text-brand" : "text-ink-soft"}>{icon}</span>
      {label}
      {badge && (
        <span
          className={`ml-1 px-1.5 py-[1px] rounded-full text-[10.5px] font-medium tabular-nums ${
            badge.kind === "accent"
              ? "bg-brand-accent text-brand-pale"
              : "bg-surface-chipActive text-brand-deep"
          }`}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
}

function RailTile({
  active,
  icon,
  label,
  onClick,
  badge,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge: RailBadge;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group relative w-full aspect-square rounded-[8px] inline-flex flex-col items-center justify-center gap-1 transition-colors ${
        active
          ? "bg-surface-chipActive text-brand-deep"
          : "text-ink-soft hover:text-brand hover:bg-surface-hover"
      }`}
    >
      {icon}
      <span className="text-[9px] font-medium uppercase tracking-[0.05em]">
        {label.split(" ")[0]}
      </span>
      {badge && (
        <span
          className={`absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold inline-flex items-center justify-center tabular-nums ${
            badge.kind === "accent"
              ? "bg-brand-accent text-brand-pale"
              : "bg-edge-chip text-ink"
          }`}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
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
