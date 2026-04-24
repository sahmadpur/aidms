"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Bell, Check } from "lucide-react";
import api from "@/lib/api";
import type { Notification, NotificationList, NotificationType } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const MESSAGE_KEYS: Record<NotificationType, string> = {
  comment_added: "notifications.msg.comment_added",
  approval_requested: "notifications.msg.approval_requested",
  document_approved: "notifications.msg.document_approved",
  document_rejected: "notifications.msg.document_rejected",
  revision_requested: "notifications.msg.revision_requested",
  document_resubmitted: "notifications.msg.document_resubmitted",
  comment_mention: "notifications.msg.comment_mention",
};

export default function NotificationsBell() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR<NotificationList>(
    "/notifications?limit=15",
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true }
  );
  const unread = data?.unread_count ?? 0;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openNotification(n: Notification) {
    if (!n.is_read) {
      await api.post("/notifications/read", { ids: [n.id] });
      mutate();
    }
    setOpen(false);
    if (n.document_id) {
      const commentTab =
        n.type === "comment_added" || n.type === "comment_mention";
      const tab = commentTab ? "?tab=comments" : "";
      router.push(`/documents/${n.document_id}${tab}`);
    }
  }

  async function markAllRead() {
    await api.post("/notifications/read", { all: true });
    mutate();
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => {
          // Revalidate on open so the user sees the freshest state
          // regardless of where we are in the 10s poll cycle.
          if (!open) mutate();
          setOpen((v) => !v);
        }}
        className="relative p-1.5 rounded-md hover:bg-surface-hover text-gray-600"
        aria-label={t("notifications.title")}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-semibold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] bg-white border border-edge-soft rounded-lg shadow-lg z-40">
          <div className="flex items-center justify-between px-3 py-2 border-b border-edge-soft">
            <span className="text-[13px] font-semibold text-brand">
              {t("notifications.title")}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-[#3b6d11] hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {(!data || data.items.length === 0) && (
              <p className="p-4 text-[12px] text-gray-500 italic text-center">
                {t("notifications.empty")}
              </p>
            )}
            {data?.items.map((n) => {
              const payload = (n.payload ?? {}) as Record<string, unknown>;
              const title = (payload.title as string) || "";
              const actor = n.actor?.full_name || t("common.someone");
              const msg = t(MESSAGE_KEYS[n.type], { actor, title });
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`w-full text-left px-3 py-2 border-b border-edge-soft last:border-b-0 hover:bg-surface-hover ${
                    n.is_read ? "" : "bg-[#f7fbf0]"
                  }`}
                >
                  <p className="text-[12.5px] text-gray-800 leading-snug">
                    {!n.is_read && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-accent mr-1.5 align-middle" />
                    )}
                    {msg}
                  </p>
                  {typeof payload.reason === "string" && payload.reason && (
                    <p className="text-[11px] text-gray-500 mt-0.5 italic">
                      “{payload.reason as string}”
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(n.created_at).toLocaleString(locale)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
