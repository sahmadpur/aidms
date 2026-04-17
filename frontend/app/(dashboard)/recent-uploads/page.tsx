"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { DataTable, Column } from "@/components/DataTable";
import { DocTypeBadge, OcrStatusDot } from "@/components/Badge";
import { FolderBreadcrumb, useFolders } from "@/components/FolderPicker";
import api from "@/lib/api";
import type { Document, DocumentList } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function RecentUploadsPage() {
  const t = useTranslations();
  const locale = useLocale();

  const { data } = useSWR<DocumentList>(
    "/documents?sort=created_at:desc&page_size=50",
    fetcher,
    { refreshInterval: 10000 }
  );
  const { data: folders } = useFolders();

  const cols: Column<Document>[] = [
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
      key: "type",
      header: t("documents.type"),
      width: "105px",
      render: (d) => <DocTypeBadge type={d.doc_type} label={d.doc_type ? t(`docType.${d.doc_type}`) : undefined} />,
    },
    {
      key: "created_at",
      header: t("documents.uploadDate"),
      width: "140px",
      render: (d) => (
        <span className="text-[12px] text-gray-700">
          {new Date(d.created_at).toLocaleString(locale)}
        </span>
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
  ];

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("nav.recentUploads")}</TopBarTitle>
      </TopBar>
      <div className="px-[22px] py-4">
        <DataTable
          columns={cols}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          empty={t("documents.noDocuments")}
        />
      </div>
    </>
  );
}
