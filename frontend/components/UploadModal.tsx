"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useLocale, useTranslations } from "next-intl";
import axios from "axios";
import useSWR from "swr";
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/api";
import api from "@/lib/api";
import { DOC_TYPES } from "@/lib/types";
import { FolderPicker } from "./FolderPicker";
import type { Department } from "@/lib/types";
import { localizedName } from "@/lib/types";

interface Upload {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  documentId?: string;
}

const MAX_SIZE = 50 * 1024 * 1024;
const deptFetcher = (url: string) => api.get<Department[]>(url).then((r) => r.data);

export default function UploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [files, setFiles] = useState<Upload[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [docType, setDocType] = useState<string>("");
  const [physicalLocation, setPhysicalLocation] = useState("");

  const { data: departments = [] } = useSWR<Department[]>(
    open ? "/admin/departments" : null,
    deptFetcher,
    { revalidateOnFocus: false }
  );

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    setFiles((prev) => [
      ...prev,
      ...accepted.map<Upload>((f) => ({ file: f, progress: 0, status: "pending" })),
      ...rejected.map<Upload>((r) => ({
        file: r.file,
        progress: 0,
        status: "error",
        error: r.errors?.[0]?.code === "file-too-large" ? t("upload.fileTooLarge") : t("upload.notPdf"),
      })),
    ]);
  }, [t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_SIZE,
  });

  async function startUpload() {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f)));

      const fd = new FormData();
      fd.append("files", files[i].file);
      if (folderId) fd.append("folder_id", folderId);
      if (departmentId) fd.append("department_id", departmentId);
      if (docType) fd.append("doc_type", docType);
      if (physicalLocation.trim()) fd.append("physical_location", physicalLocation.trim());

      try {
        const { data } = await axios.post(`${API_URL}/documents/upload`, fd, {
          headers: {
            "Content-Type": "multipart/form-data",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded * 100) / (e.total || 1));
            setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, progress: pct } : f)));
          },
        });
        const docId = data[0]?.id;
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "done", progress: 100, documentId: docId } : f
          )
        );
      } catch (err: any) {
        const msg = err.response?.data?.detail || t("errors.generic");
        setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "error", error: String(msg) } : f)));
      }
    }
    onUploaded();
  }

  function close() {
    setFiles([]);
    setFolderId(null);
    setDepartmentId(null);
    setDocType("");
    setPhysicalLocation("");
    onClose();
  }

  if (!open) return null;

  const pending = files.filter((f) => f.status === "pending").length;
  const uploading = files.some((f) => f.status === "uploading");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-surface-card rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-edge-soft">
        <div className="px-6 py-4 border-b border-edge-soft flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">{t("upload.title")}</h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-[10px] p-6 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-brand-accent bg-surface-hover"
                : "border-edge-chip hover:border-brand-accent hover:bg-surface-hover"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto w-7 h-7 text-gray-400 mb-2" />
            <p className="text-gray-700 text-sm">{t("upload.drag")}</p>
            <p className="text-xs text-gray-500 mt-1">
              {t("upload.or")}{" "}
              <span className="text-brand font-medium">{t("upload.browse")}</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-1.5">
              {t("upload.pdfOnly")} · {t("upload.maxSize")}
            </p>
          </div>

          {/* Metadata fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("documents.type")}>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
              >
                <option value="">—</option>
                {DOC_TYPES.map((t2) => (
                  <option key={t2} value={t2}>
                    {t(`docType.${t2}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("documents.department")}>
              <select
                value={departmentId ?? ""}
                onChange={(e) => setDepartmentId(e.target.value || null)}
                className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {localizedName(d, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("documents.folder")}>
              <FolderPicker value={folderId} onChange={setFolderId} locale={locale} />
            </Field>
            <Field label={t("documents.physicalLocation")}>
              <input
                value={physicalLocation}
                onChange={(e) => setPhysicalLocation(e.target.value)}
                placeholder="Shelf A-1, Box 3"
                className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
              />
            </Field>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <ul className="space-y-2 border-t border-edge-soft pt-4">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 border border-edge-soft rounded-md px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">{f.file.name}</p>
                    {f.status === "uploading" && (
                      <div className="mt-1">
                        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-accent rounded-full transition-all" style={{ width: `${f.progress}%` }} />
                        </div>
                      </div>
                    )}
                    {f.status === "error" && <p className="text-[11px] text-red-600 mt-0.5">{f.error}</p>}
                  </div>
                  {f.status === "uploading" && <Loader2 className="w-4 h-4 text-brand-accent animate-spin" />}
                  {f.status === "done" && <CheckCircle className="w-4 h-4 text-[#639922]" />}
                  {f.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                  {f.status !== "uploading" && (
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
          <button
            onClick={close}
            className="px-3.5 py-1.5 rounded-[6px] text-[12px] bg-white border border-edge-chip text-brand hover:bg-[#f0f7e6]"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={startUpload}
            disabled={pending === 0 || uploading}
            className="px-3.5 py-1.5 rounded-[6px] text-[12px] bg-brand text-brand-pale border border-brand hover:bg-brand-hover disabled:opacity-50"
          >
            {uploading ? t("upload.uploading") : t("common.uploadDoc")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
