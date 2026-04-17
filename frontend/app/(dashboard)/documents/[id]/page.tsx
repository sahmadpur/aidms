"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import DocumentViewer from "@/components/DocumentViewer";
import OCRTextPanel from "@/components/OCRTextPanel";
import api from "@/lib/api";
import { API_URL } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function DocumentDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<"pdf" | "ocr">("pdf");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const { data: doc, isLoading, mutate } = useSWR(`/documents/${id}`, fetcher);
  const { data: ocrData } = useSWR(
    doc?.ocr_status === "completed" ? `/documents/${id}/ocr-text` : null,
    fetcher
  );

  async function handleReprocess() {
    await api.post(`/documents/${id}/reprocess`);
    mutate();
  }

  async function handleSaveEdit() {
    const updates: any = {};
    if (editForm.title !== doc.title) updates.title = editForm.title;
    if (editForm.description !== doc.description) updates.description = editForm.description;
    if (editForm.language !== doc.language) updates.language = editForm.language;
    await api.patch(`/documents/${id}`, updates);
    setEditing(false);
    mutate();
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!doc) return <p className="text-gray-400 text-sm">{t("errors.notFound")}</p>;

  const fileUrl = `${API_URL}/documents/${id}/file`;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {editing ? (
            <input
              value={editForm?.title}
              onChange={(e) => setEditForm((f: any) => ({ ...f, title: e.target.value }))}
              className="text-xl font-semibold border-b border-gray-300 focus:outline-none focus:border-primary-500"
            />
          ) : (
            <h1 className="text-xl font-semibold text-gray-900">{doc.title}</h1>
          )}
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date(doc.created_at).toLocaleDateString()} ·{" "}
            {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>

        <div className="flex items-center gap-2">
          {doc.ocr_status !== "completed" && (
            <button
              onClick={handleReprocess}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("documents.reprocess")}
            </button>
          )}
          {editing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                {t("common.save")}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setEditForm({ title: doc.title, description: doc.description, language: doc.language });
                setEditing(true);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t("documents.edit")}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["pdf", "ocr"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "pdf" ? t("documents.viewFile") : t("documents.viewOcr")}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="h-[70vh]">
        {activeTab === "pdf" && <DocumentViewer fileUrl={fileUrl} />}
        {activeTab === "ocr" && <OCRTextPanel ocrText={ocrData?.ocr_text || ""} />}
      </div>
    </div>
  );
}
