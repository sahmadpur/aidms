"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslations } from "next-intl";
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import axios from "axios";
import { API_URL } from "@/lib/api";

interface UploadFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  documentId?: string;
  ocrStatus?: string;
}

interface Props {
  onUploadComplete?: () => void;
}

export default function DocumentUploader({ onUploadComplete }: Props) {
  const t = useTranslations();
  const [files, setFiles] = useState<UploadFile[]>([]);

  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    const newFiles: UploadFile[] = accepted.map((f) => ({
      file: f,
      progress: 0,
      status: "pending",
    }));

    // Validate rejected files
    for (const r of rejected) {
      const reason = r.errors?.[0]?.code === "file-too-large"
        ? t("upload.fileTooLarge")
        : t("upload.notPdf");
      newFiles.push({
        file: r.file,
        progress: 0,
        status: "error",
        error: reason,
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);
    // Upload accepted files sequentially
    accepted.forEach((_, i) => {
      const idx = files.length + i;
      uploadFile(idx + files.length, accepted[i]);
    });
  }, [files]); // eslint-disable-line

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_SIZE,
  });

  async function uploadFile(idx: number, file: File) {
    setFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, status: "uploading" } : f))
    );

    const formData = new FormData();
    formData.append("files", file);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    try {
      const { data } = await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / (e.total || 1));
          setFiles((prev) =>
            prev.map((f, i) => (i === idx ? { ...f, progress: pct } : f))
          );
        },
      });

      const docId: string = data[0]?.id;

      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx
            ? { ...f, status: "done", progress: 100, documentId: docId, ocrStatus: "pending" }
            : f
        )
      );

      // Poll OCR status
      if (docId) pollOcrStatus(idx, docId);
      onUploadComplete?.();
    } catch (err: any) {
      const msg = err.response?.data?.detail || t("errors.generic");
      setFiles((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, status: "error", error: msg } : f))
      );
    }
  }

  async function pollOcrStatus(idx: number, docId: string) {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    let attempts = 0;

    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 40) {
        clearInterval(poll);
        return;
      }

      try {
        const { data } = await axios.get(`${API_URL}/documents/${docId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        setFiles((prev) =>
          prev.map((f, i) =>
            i === idx ? { ...f, ocrStatus: data.ocr_status } : f
          )
        );

        if (data.ocr_status === "completed" || data.ocr_status === "failed") {
          clearInterval(poll);
        }
      } catch {
        clearInterval(poll);
      }
    }, 3000);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const ocrBadge = (status?: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700",
      processing: "bg-blue-100 text-blue-700",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    return map[status || "pending"] || map.pending;
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-primary-500 bg-primary-50"
            : "border-gray-300 hover:border-primary-400 hover:bg-gray-50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <p className="text-gray-600 font-medium">{t("upload.drag")}</p>
        <p className="text-sm text-gray-400 mt-1">
          {t("upload.or")}{" "}
          <span className="text-primary-600 font-medium">{t("upload.browse")}</span>
        </p>
        <p className="text-xs text-gray-400 mt-2">
          {t("upload.pdfOnly")} · {t("upload.maxSize")}
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.file.name}</p>

                {f.status === "uploading" && (
                  <div className="mt-1.5">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{f.progress}%</p>
                  </div>
                )}

                {f.status === "done" && f.ocrStatus && (
                  <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ocrBadge(f.ocrStatus)}`}>
                    {t(`ocr.${f.ocrStatus}`)}
                  </span>
                )}

                {f.status === "error" && (
                  <p className="text-xs text-red-600 mt-1">{f.error}</p>
                )}
              </div>

              <div className="flex-shrink-0">
                {f.status === "uploading" && (
                  <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                )}
                {f.status === "done" && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {f.status === "error" && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                {f.status !== "uploading" && (
                  <button
                    onClick={() => removeFile(i)}
                    className="ml-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
