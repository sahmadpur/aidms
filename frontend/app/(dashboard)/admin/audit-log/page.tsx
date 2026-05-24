"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { TopBar, TopBarTitle, TopBarButton } from "@/components/TopBar";
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
  "dictionary.create", "dictionary.update", "dictionary.delete",
];

const ENTITIES = ["user", "document", "folder", "department", "category", "dictionary"];

const fetcher = (url: string) => api.get(url).then((r) => r.data);

function buildFilterParams(opts: {
  action: string;
  entityType: string;
  from: string;
  to: string;
}) {
  const p = new URLSearchParams();
  if (opts.action) p.set("action", opts.action);
  if (opts.entityType) p.set("entity_type", opts.entityType);
  if (opts.from) p.set("from", new Date(opts.from).toISOString());
  if (opts.to) {
    // include the full selected day
    const end = new Date(opts.to);
    end.setHours(23, 59, 59, 999);
    p.set("to", end.toISOString());
  }
  return p;
}

export default function AuditLogPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const limit = 50;

  const qs = useMemo(() => {
    const p = buildFilterParams({ action, entityType, from: fromDate, to: toDate });
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [action, entityType, fromDate, toDate, offset]);

  const { data } = useSWR<AuditList>(`/admin/audit-logs?${qs}`, fetcher, { refreshInterval: 15000 });

  async function downloadExport(format: "xlsx" | "csv") {
    setDownloading(true);
    try {
      const params = buildFilterParams({ action, entityType, from: fromDate, to: toDate });
      const mimeType = format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv";
      const resp = await api.get(`/admin/audit-logs/export.${format}?${params.toString()}`, {
        responseType: "blob",
      });
      const blob = new Blob([resp.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

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
        <span className="inline-block px-2 py-0.5 rounded bg-surface-chipActive text-brand-deep text-[11px] font-medium">
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
  ];

  const total = data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("auditLog.title")}</TopBarTitle>
        <div className="flex-1" />
        <TopBarButton onClick={() => downloadExport("csv")} disabled={downloading}>
          {downloading ? t("common.loading") : "CSV"}
        </TopBarButton>
        <TopBarButton onClick={() => downloadExport("xlsx")} disabled={downloading}>
          {downloading ? t("common.loading") : "XLSX"}
        </TopBarButton>
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
        <FilterLabel>{t("auditLog.from")}:</FilterLabel>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
          className="px-2 py-1 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover text-gray-900 outline-none focus:border-edge-focus"
        />
        <FilterLabel>{t("auditLog.to")}:</FilterLabel>
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
          className="px-2 py-1 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover text-gray-900 outline-none focus:border-edge-focus"
        />
      </FilterBar>
      <div className="px-[22px] py-4">
        <DataTable
          columns={cols}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          empty={t("auditLog.noLogs")}
          minWidth={760}
        />
        <div className="flex items-center justify-between mt-3 text-[11px] text-gray-600">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} / {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-2 py-0.5 rounded border border-edge-chip text-brand-deep disabled:opacity-40 hover:bg-surface-chipActive"
            >
              ‹ {t("common.prev")}
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setOffset(offset + limit)}
              className="px-2 py-0.5 rounded border border-edge-chip text-brand-deep disabled:opacity-40 hover:bg-surface-chipActive"
            >
              {t("common.next")} ›
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
