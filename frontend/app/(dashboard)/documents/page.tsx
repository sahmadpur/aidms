"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { Filter, Search, Plus } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { DocTypeBadge, OcrStatusDot, ValidationStatusDot } from "@/components/Badge";
import { ApprovalBadge } from "@/components/ApprovalBadge";
import { FilterBar, FilterChip, FilterDivider, FilterLabel, FilterSelect } from "@/components/FilterBar";
import { FolderBreadcrumb, useFolders } from "@/components/FolderPicker";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import UploadModal from "@/components/UploadModal";
import api from "@/lib/api";
import type {
  Document,
  DocumentList,
  Department,
  ApprovalStatus,
  ValidationStatus,
} from "@/lib/types";
import {
  APPROVAL_STATUSES,
  DOC_TYPES,
  VALIDATION_STATUSES,
  localizedName,
} from "@/lib/types";
import { pathFor } from "@/components/FolderPicker";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const OCR_STATUSES = ["completed", "processing", "pending", "failed"] as const;
const PAGE_SIZE = 20;

export default function DocumentsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const inboxMode = searchParams.get("inbox") === "1";

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>(""); // "" = all
  const [yearFilter, setYearFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [ocrFilter, setOcrFilter] = useState<string>("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "">("");
  const [validationFilter, setValidationFilter] = useState<ValidationStatus | "">("");
  const [uploadOpen, setUploadOpen] = useState(false);

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(v.trim());
      setPage(1);
    }, 400);
  }
  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("page_size", String(PAGE_SIZE));
    if (debouncedQuery) p.set("q", debouncedQuery);
    if (typeFilter) p.set("doc_type", typeFilter);
    if (yearFilter) p.set("year", yearFilter);
    if (departmentFilter) p.set("department_id", departmentFilter);
    if (ocrFilter) p.set("ocr_status", ocrFilter);
    if (validationFilter) p.set("validation_status", validationFilter);
    if (inboxMode) {
      p.set("inbox", "1");
    } else if (approvalFilter) {
      p.set("approval_status", approvalFilter);
    }
    return p.toString();
  }, [page, debouncedQuery, typeFilter, yearFilter, departmentFilter, ocrFilter, validationFilter, approvalFilter, inboxMode]);

  const { data, mutate } = useSWR<DocumentList>(
    `/documents?${queryString}`,
    fetcher,
    { refreshInterval: 5000 }
  );
  const { data: stats } = useSWR<{ total_docs: number; indexed: number; pending: number; processing: number }>(
    "/admin/reports/stats",
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const { data: folders } = useFolders();
  const { data: departments = [] } = useSWR<Department[]>("/admin/departments", fetcher, {
    revalidateOnFocus: false,
  });

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => now - i);
  }, []);

  const columns: Column<Document>[] = useMemo(
    () => [
      {
        key: "display_id",
        header: t("documents.docId"),
        width: "95px",
        render: (d) => <span className="font-mono text-[11px] text-gray-500">{d.display_id ?? "—"}</span>,
      },
      {
        key: "title",
        header: t("documents.title"),
        render: (d) => (
          <Link href={`/documents/${d.id}`} className="text-brand font-medium hover:underline block truncate">
            {d.title}
          </Link>
        ),
      },
      {
        key: "doc_type",
        header: t("documents.type"),
        width: "105px",
        render: (d) => <DocTypeBadge type={d.doc_type} label={d.doc_type ? t(`docType.${d.doc_type}`) : undefined} />,
      },
      {
        key: "created_at",
        header: t("documents.uploadDate"),
        width: "110px",
        render: (d) => (
          <span className="text-[12px] text-gray-700">
            {new Date(d.created_at).toLocaleDateString(locale)}
          </span>
        ),
      },
      {
        key: "physical",
        header: t("documents.physicalLocation"),
        width: "160px",
        render: (d) =>
          d.physical_location ? (
            <span className="text-[11.5px] text-gray-600">📦 {d.physical_location}</span>
          ) : (
            <span className="text-[11.5px] text-gray-400">—</span>
          ),
      },
      {
        key: "folder",
        header: t("documents.virtualPath"),
        width: "170px",
        render: (d) => <FolderBreadcrumb folderId={d.folder_id} folders={folders} locale={locale} />,
      },
      {
        key: "ocr",
        header: t("ocr.status"),
        width: "105px",
        render: (d) => <OcrStatusDot status={d.ocr_status} label={t(`ocr.${d.ocr_status}`)} />,
      },
      {
        key: "approval",
        header: t("approval.status"),
        width: "120px",
        render: (d) => (
          <ApprovalBadge
            status={d.approval_status}
            label={t(`approval.s_${d.approval_status}`)}
          />
        ),
      },
      {
        key: "validation",
        header: t("validation.column"),
        width: "110px",
        render: (d) => (
          <ValidationStatusDot
            status={d.validation_status}
            label={t(`validation.status.${d.validation_status}`)}
          />
        ),
      },
      {
        key: "action",
        header: "",
        width: "75px",
        align: "center",
        render: (d) => (
          <Link
            href={`/documents/${d.id}`}
            className="inline-block px-2 py-0.5 text-[11px] text-[#3b6d11] border border-edge-chip rounded hover:bg-surface-chipActive"
          >
            {t("common.open")}
          </Link>
        ),
      },
    ],
    [t, locale, folders]
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const shown = data?.items.length ?? 0;

  function exportCsv() {
    if (!data) return;
    const deptById = new Map(departments.map((d) => [d.id, d]));
    const folderById = new Map(folders?.map((f) => [f.id, f]) ?? []);
    const header = [
      "doc_id",
      "title",
      "type",
      "created_at",
      "physical_location",
      "folder_path",
      "department",
      "ocr_status",
    ];
    const rows = data.items.map((d) => [
      d.display_id ?? "",
      d.title,
      d.doc_type ?? "",
      d.created_at,
      d.physical_location ?? "",
      d.folder_id && folderById.has(d.folder_id)
        ? pathFor(folderById.get(d.folder_id)!, locale).join(" / ")
        : "",
      d.department_id && deptById.has(d.department_id)
        ? localizedName(deptById.get(d.department_id)!, locale)
        : "",
      d.ocr_status,
    ]);
    const escape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [header, ...rows].map((r) => r.map((c) => escape(String(c))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>
          {inboxMode ? t("inbox.title") : t("documents.title")}
        </TopBarTitle>
        <div className="flex-1 max-w-[340px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t("documents.searchPlaceholder")}
            className="w-full pl-8 pr-2.5 py-1.5 border border-edge-chip rounded-[6px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
          />
        </div>
        <TopBarButton>
          <Filter className="w-3 h-3" />
          {t("common.filter")}
        </TopBarButton>
        <TopBarButton onClick={exportCsv}>{t("common.export")}</TopBarButton>
        <TopBarButton variant="primary" onClick={() => setUploadOpen(true)}>
          <Plus className="w-3 h-3" strokeWidth={2} />
          {t("common.uploadDoc")}
        </TopBarButton>
      </TopBar>

      <FilterBar>
        <FilterLabel>{t("filters.type")}:</FilterLabel>
        <FilterChip active={!typeFilter} onClick={() => setTypeFilter("")}>
          {t("filters.all")}
        </FilterChip>
        {DOC_TYPES.map((tp) => (
          <FilterChip key={tp} active={typeFilter === tp} onClick={() => setTypeFilter(tp)}>
            {t(`docType.${tp}`)}
          </FilterChip>
        ))}
        <FilterDivider />
        <FilterLabel>{t("filters.year")}:</FilterLabel>
        <FilterSelect value={yearFilter} onChange={setYearFilter}>
          <option value="">{t("filters.allYears")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </FilterSelect>
        <FilterLabel>{t("filters.department")}:</FilterLabel>
        <FilterSelect value={departmentFilter} onChange={setDepartmentFilter}>
          <option value="">{t("filters.allDepartments")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {localizedName(d, locale)}
            </option>
          ))}
        </FilterSelect>
        <FilterLabel>{t("filters.ocrStatus")}:</FilterLabel>
        <FilterSelect value={ocrFilter} onChange={setOcrFilter}>
          <option value="">{t("filters.all")}</option>
          {OCR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`ocr.${s}`)}
            </option>
          ))}
        </FilterSelect>
        {!inboxMode && (
          <>
            <FilterLabel>{t("approval.status")}:</FilterLabel>
            <FilterSelect
              value={approvalFilter}
              onChange={(v) => setApprovalFilter((v as ApprovalStatus) || "")}
            >
              <option value="">{t("filters.all")}</option>
              {APPROVAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`approval.s_${s}`)}
                </option>
              ))}
            </FilterSelect>
          </>
        )}
        <FilterLabel>{t("validation.column")}:</FilterLabel>
        <FilterSelect
          value={validationFilter}
          onChange={(v) => setValidationFilter((v as ValidationStatus) || "")}
        >
          <option value="">{t("filters.all")}</option>
          {VALIDATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`validation.status.${s}`)}
            </option>
          ))}
        </FilterSelect>
        {inboxMode && (
          <>
            <FilterDivider />
            <span className="text-[11px] text-[#3b6d11] italic">
              {t("inbox.filterHint")}
            </span>
          </>
        )}
      </FilterBar>

      <div className="px-[22px] py-4">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          empty={t("documents.noDocuments")}
        />
      </div>

      <div className="bg-surface-card border-t border-edge-soft px-[22px] py-1.5 flex items-center justify-between">
        <span className="text-[11px] text-gray-600">
          {t("documents.showing", { shown, total: data?.total ?? 0 })}
          {stats && (
            <>
              {" "}· {t("documents.indexed", { count: stats.indexed })} ·{" "}
              {t("documents.pendingOcr", { count: stats.pending + stats.processing })}
            </>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ‹ {t("common.prev")}
          </PageBtn>
          {paginationWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={i} className="px-2 py-0.5 text-[11px] text-gray-500">
                …
              </span>
            ) : (
              <PageBtn key={i} onClick={() => setPage(p as number)} active={p === page}>
                {p}
              </PageBtn>
            )
          )}
          <PageBtn onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            {t("common.next")} ›
          </PageBtn>
        </div>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => mutate()} />
    </>
  );
}

function PageBtn({
  onClick,
  disabled,
  active,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-0.5 rounded border text-[11px] transition-colors disabled:opacity-40 ${
        active
          ? "bg-brand text-brand-pale border-brand"
          : "bg-transparent text-[#3b6d11] border-edge-chip hover:bg-surface-chipActive"
      }`}
    >
      {children}
    </button>
  );
}

function paginationWindow(current: number, total: number): (number | "…")[] {
  if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  if (current > 3) items.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) items.push(p);
  if (current < total - 2) items.push("…");
  items.push(total);
  return items;
}
