"use client";

import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { FileText, CheckCircle2, Clock, Loader2, AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { StatCard } from "@/components/StatCard";
import { DocTypeBadge } from "@/components/Badge";
import { localizedName } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface Stats {
  total_docs: number;
  indexed: number;
  pending: number;
  processing: number;
  failed: number;
  by_doc_type: { doc_type: string | null; count: number }[];
  by_department: {
    department_id: string | null;
    name_az: string | null;
    name_ru: string | null;
    name_en: string | null;
    count: number;
  }[];
  uploads_last_30d: { date: string; count: number }[];
  top_uploaders: { user_id: string; full_name: string; count: number }[];
}

export default function ReportsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data, isLoading } = useSWR<Stats>("/admin/reports/stats", fetcher);

  if (isLoading || !data) {
    return (
      <>
        <TopBar>
          <TopBarTitle>{t("reports.title")}</TopBarTitle>
        </TopBar>
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </>
    );
  }

  const maxTypeCount = Math.max(1, ...data.by_doc_type.map((x) => x.count));
  const maxDeptCount = Math.max(1, ...data.by_department.map((x) => x.count));
  const maxDayCount = Math.max(1, ...data.uploads_last_30d.map((x) => x.count));

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("reports.title")}</TopBarTitle>
      </TopBar>
      <div className="px-[22px] py-4 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label={t("reports.totalDocs")}
            value={data.total_docs.toLocaleString(locale)}
            icon={<FileText className="w-6 h-6" />}
          />
          <StatCard
            label={t("reports.indexed")}
            value={data.indexed.toLocaleString(locale)}
            icon={<CheckCircle2 className="w-6 h-6 text-[#639922]" />}
          />
          <StatCard
            label={`${t("reports.pending")} + ${t("reports.processing")}`}
            value={(data.pending + data.processing).toLocaleString(locale)}
            icon={<Clock className="w-6 h-6 text-[#ef9f27]" />}
          />
          <StatCard
            label={t("reports.failed")}
            value={data.failed.toLocaleString(locale)}
            icon={<AlertCircle className="w-6 h-6 text-red-500" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By doc type */}
          <Panel title={t("reports.byDocType")}>
            {data.by_doc_type.length === 0 && <EmptyHint />}
            {data.by_doc_type.map((row, i) => (
              <BarRow
                key={i}
                label={
                  <DocTypeBadge
                    type={row.doc_type}
                    label={row.doc_type ? t(`docType.${row.doc_type}`) : t("docType.other")}
                  />
                }
                value={row.count}
                max={maxTypeCount}
              />
            ))}
          </Panel>

          {/* By department */}
          <Panel title={t("reports.byDepartment")}>
            {data.by_department.length === 0 && <EmptyHint />}
            {data.by_department.map((row) => (
              <BarRow
                key={row.department_id ?? "_none"}
                label={
                  <span className="text-[12px] text-gray-800">
                    {row.name_en
                      ? localizedName({ name_az: row.name_az!, name_ru: row.name_ru!, name_en: row.name_en }, locale)
                      : "—"}
                  </span>
                }
                value={row.count}
                max={maxDeptCount}
              />
            ))}
          </Panel>
        </div>

        {/* Uploads 30d */}
        <Panel title={t("reports.uploadsLast30d")}>
          {data.uploads_last_30d.length === 0 ? (
            <EmptyHint />
          ) : (
            <div className="flex items-end gap-1 h-32 pt-2">
              {data.uploads_last_30d.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] text-gray-500 opacity-0 group-hover:opacity-100">
                    {d.count}
                  </span>
                  <div
                    className="w-full bg-brand-accent/70 rounded-sm hover:bg-brand-accent transition-colors"
                    style={{ height: `${(d.count / maxDayCount) * 100}%`, minHeight: 2 }}
                  />
                  <span className="text-[9px] text-gray-400 rotate-[-45deg] origin-top-left translate-x-2 mt-2 truncate">
                    {d.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Top uploaders */}
        <Panel title={t("reports.topUploaders")}>
          {data.top_uploaders.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="space-y-1.5">
              {data.top_uploaders.map((u) => (
                <li
                  key={u.user_id}
                  className="flex items-center justify-between text-[12.5px] text-gray-800 border-b border-[#eef3e8] last:border-b-0 py-1.5"
                >
                  <span>{u.full_name}</span>
                  <span className="text-brand font-medium">{u.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-edge-soft rounded-[10px] p-4">
      <h2 className="text-[13px] font-semibold text-gray-700 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BarRow({ label, value, max }: { label: React.ReactNode; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-shrink-0 truncate">{label}</div>
      <div className="flex-1 relative h-4 bg-[#eef3e8] rounded overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-brand-accent rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-[12px] text-gray-700 font-medium">{value}</span>
    </div>
  );
}

function EmptyHint() {
  return <p className="text-[11.5px] text-gray-400 italic">—</p>;
}
