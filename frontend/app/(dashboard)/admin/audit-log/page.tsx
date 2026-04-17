"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { FilterBar, FilterLabel, FilterSelect } from "@/components/FilterBar";
import { DataTable, Column } from "@/components/DataTable";
import api from "@/lib/api";

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditList {
  items: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

const ACTIONS = [
  "user.login", "user.register", "user.admin_update", "user.self_update", "user.password_change",
  "document.upload", "document.update", "document.delete", "document.reprocess",
  "folder.create", "folder.update", "folder.delete",
  "department.create", "department.update", "department.delete",
  "category.create", "category.delete",
];

const ENTITIES = ["user", "document", "folder", "department", "category"];

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AuditLogPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    if (entityType) p.set("entity_type", entityType);
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [action, entityType, offset]);

  const { data } = useSWR<AuditList>(`/admin/audit-logs?${qs}`, fetcher, { refreshInterval: 15000 });

  const cols: Column<AuditRow>[] = [
    {
      key: "when",
      header: t("auditLog.when"),
      width: "160px",
      render: (r) => (
        <span className="text-[12px] text-gray-700">{new Date(r.created_at).toLocaleString(locale)}</span>
      ),
    },
    {
      key: "user",
      header: t("auditLog.user"),
      width: "200px",
      render: (r) =>
        r.user_name ? (
          <div className="min-w-0">
            <div className="text-[12.5px] text-gray-900 truncate">{r.user_name}</div>
            <div className="text-[11px] text-gray-500 truncate">{r.user_email}</div>
          </div>
        ) : (
          <span className="text-[11.5px] text-gray-400">—</span>
        ),
    },
    {
      key: "action",
      header: t("auditLog.action"),
      width: "180px",
      render: (r) => (
        <span className="inline-block px-2 py-0.5 rounded bg-surface-chipActive text-[#3b6d11] text-[11px] font-medium">
          {r.action}
        </span>
      ),
    },
    {
      key: "entity",
      header: t("auditLog.entity"),
      width: "220px",
      render: (r) => (
        <span className="text-[12px] text-gray-700">
          {r.entity_type}
          {r.entity_id && <span className="text-gray-400"> ·  <span className="font-mono">{r.entity_id.slice(0, 8)}</span></span>}
        </span>
      ),
    },
    {
      key: "ip",
      header: t("auditLog.ip"),
      width: "130px",
      render: (r) => <span className="text-[11.5px] text-gray-600 font-mono">{r.ip_address ?? "—"}</span>,
    },
  ];

  const total = data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("auditLog.title")}</TopBarTitle>
      </TopBar>
      <FilterBar>
        <FilterLabel>{t("auditLog.action")}:</FilterLabel>
        <FilterSelect value={action} onChange={(v) => { setAction(v); setOffset(0); }}>
          <option value="">{t("filters.all")}</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </FilterSelect>
        <FilterLabel>{t("auditLog.entity")}:</FilterLabel>
        <FilterSelect value={entityType} onChange={(v) => { setEntityType(v); setOffset(0); }}>
          <option value="">{t("filters.all")}</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <div className="px-[22px] py-4">
        <DataTable
          columns={cols}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          empty={t("auditLog.noLogs")}
          minWidth={900}
        />
        <div className="flex items-center justify-between mt-3 text-[11px] text-gray-600">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} / {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-2 py-0.5 rounded border border-edge-chip text-[#3b6d11] disabled:opacity-40 hover:bg-surface-chipActive"
            >
              ‹ {t("common.prev")}
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setOffset(offset + limit)}
              className="px-2 py-0.5 rounded border border-edge-chip text-[#3b6d11] disabled:opacity-40 hover:bg-surface-chipActive"
            >
              {t("common.next")} ›
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
