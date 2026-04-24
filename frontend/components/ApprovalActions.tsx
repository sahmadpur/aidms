"use client";

import { useRef, useState } from "react";
import axios from "axios";
import { useTranslations } from "next-intl";
import { Check, X, RotateCcw, Send, MessageSquare, Upload } from "lucide-react";
import api, { API_URL } from "@/lib/api";
import type { Document } from "@/lib/types";
import type { Me } from "@/lib/useMe";

type Role = "approver" | "owner" | "viewer";

function roleFor(doc: Document, me: Me): Role {
  if (me.role === "admin") return "approver";
  if (doc.department_id && me.managed_department_ids?.includes(doc.department_id)) {
    return "approver";
  }
  if (doc.user_id === me.id) return "owner";
  return "viewer";
}

export function ApprovalActions({
  doc,
  me,
  onChange,
  size = "sm",
}: {
  doc: Document;
  me: Me;
  onChange?: () => void;
  size?: "sm" | "md";
}) {
  const t = useTranslations();
  const role = roleFor(doc, me);
  const [busy, setBusy] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<
    null | { kind: "reject" | "revision"; required: boolean }
  >(null);
  const [reason, setReason] = useState("");
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function act(endpoint: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      await api.post(`/documents/${doc.id}/${endpoint}`, body ?? {});
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  async function submitResubmit() {
    setBusy(true);
    try {
      const fd = new FormData();
      if (resubmitFile) fd.append("file", resubmitFile);
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token")
          : null;
      await axios.post(`${API_URL}/documents/${doc.id}/resubmit`, fd, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setResubmitOpen(false);
      setResubmitFile(null);
      onChange?.();
    } finally {
      setBusy(false);
    }
  }

  const canApprove =
    role === "approver" &&
    (doc.approval_status === "pending" || doc.approval_status === "revision_requested");
  const canReject =
    role === "approver" && doc.approval_status !== "rejected" && doc.approval_status !== "approved";
  const canRequestRevision =
    role === "approver" &&
    (doc.approval_status === "pending" || doc.approval_status === "approved");
  // Only the uploader (or an admin) can resubmit — they're the one who needs
  // to re-scan or replace the file. Managers see the status but don't
  // resubmit on the uploader's behalf.
  const canResubmit =
    (doc.user_id === me.id || me.role === "admin") &&
    doc.approval_status === "revision_requested";

  const btn =
    size === "sm"
      ? "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border transition-colors disabled:opacity-50"
      : "inline-flex items-center gap-1.5 px-3 py-1 text-[12px] rounded border transition-colors disabled:opacity-50";

  return (
    <>
      <div className="inline-flex items-center gap-1 flex-wrap">
        {canApprove && (
          <button
            disabled={busy}
            onClick={() => act("approve")}
            className={`${btn} border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100`}
            title={t("approval.approve")}
          >
            <Check className="w-3 h-3" /> {t("approval.approve")}
          </button>
        )}
        {canReject && (
          <button
            disabled={busy}
            onClick={() => {
              setReason("");
              setReasonDialog({ kind: "reject", required: false });
            }}
            className={`${btn} border-rose-200 text-rose-800 bg-rose-50 hover:bg-rose-100`}
            title={t("approval.reject")}
          >
            <X className="w-3 h-3" /> {t("approval.reject")}
          </button>
        )}
        {canRequestRevision && (
          <button
            disabled={busy}
            onClick={() => {
              setReason("");
              setReasonDialog({ kind: "revision", required: true });
            }}
            className={`${btn} border-sky-200 text-sky-800 bg-sky-50 hover:bg-sky-100`}
            title={t("approval.requestRevision")}
          >
            <RotateCcw className="w-3 h-3" /> {t("approval.requestRevision")}
          </button>
        )}
        {canResubmit && (
          <button
            disabled={busy}
            onClick={() => {
              setResubmitFile(null);
              setResubmitOpen(true);
            }}
            className={`${btn} border-brand-accent text-brand bg-brand-pale hover:bg-surface-chipActive`}
            title={t("approval.resubmit")}
          >
            <Send className="w-3 h-3" /> {t("approval.resubmit")}
          </button>
        )}
      </div>

      {resubmitOpen && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setResubmitOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-brand mb-1">
              {t("approval.resubmitTitle")}
            </h3>
            <p className="text-[12px] text-gray-600 mb-3">
              {t("approval.resubmitHelp")}
            </p>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setResubmitFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-edge-chip rounded-[6px] px-3 py-4 text-[12.5px] text-gray-600 hover:bg-surface-hover flex items-center justify-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                {resubmitFile
                  ? resubmitFile.name
                  : t("approval.resubmitPickFile")}
              </button>
              {resubmitFile && (
                <button
                  type="button"
                  onClick={() => setResubmitFile(null)}
                  className="text-[11px] text-gray-500 hover:text-rose-600"
                >
                  {t("approval.resubmitKeepExisting")}
                </button>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setResubmitOpen(false)}
                className="px-3 py-1.5 text-[12px] rounded border border-edge-chip text-gray-700 hover:bg-surface-hover"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={busy}
                onClick={submitResubmit}
                className="px-3 py-1.5 text-[12px] rounded bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-50"
              >
                {t("approval.resubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {reasonDialog && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setReasonDialog(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-brand mb-1">
              {reasonDialog.kind === "revision"
                ? t("approval.requestRevisionTitle")
                : t("approval.rejectTitle")}
            </h3>
            <p className="text-[12px] text-gray-600 mb-3">
              {reasonDialog.kind === "revision"
                ? t("approval.requestRevisionHelp")
                : t("approval.rejectHelp")}
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("approval.reasonPlaceholder")}
              rows={4}
              className="w-full border border-edge-chip rounded p-2 text-[12.5px] outline-none focus:border-edge-focus"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setReasonDialog(null)}
                className="px-3 py-1.5 text-[12px] rounded border border-edge-chip text-gray-700 hover:bg-surface-hover"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={
                  busy || (reasonDialog.required && !reason.trim())
                }
                onClick={async () => {
                  const endpoint =
                    reasonDialog.kind === "revision"
                      ? "request-revision"
                      : "reject";
                  await act(endpoint, { reason: reason.trim() || undefined });
                  setReasonDialog(null);
                }}
                className="px-3 py-1.5 text-[12px] rounded bg-brand text-brand-pale hover:bg-brand-hover disabled:opacity-50"
              >
                {reasonDialog.kind === "revision"
                  ? t("approval.requestRevision")
                  : t("approval.reject")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CommentButton({
  onClick,
  size = "sm",
}: {
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const t = useTranslations();
  const btn =
    size === "sm"
      ? "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-edge-chip text-[#3b6d11] hover:bg-surface-chipActive"
      : "inline-flex items-center gap-1.5 px-3 py-1 text-[12px] rounded border border-edge-chip text-[#3b6d11] hover:bg-surface-chipActive";
  return (
    <button className={btn} onClick={onClick} title={t("comments.add")}>
      <MessageSquare className="w-3 h-3" /> {t("comments.comment")}
    </button>
  );
}
