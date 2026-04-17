"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import useSWR from "swr";
import { ChevronRight, Folder, FileText } from "lucide-react";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { DataTable, Column } from "@/components/DataTable";
import { OcrStatusDot, DocTypeBadge } from "@/components/Badge";
import { useFolders, pathFor, FolderNode } from "@/components/FolderPicker";
import api from "@/lib/api";
import type { Document, DocumentList } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function FoldersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const { data: folders = [] } = useFolders();

  // Build id → node map for quick parent lookups
  const byId = useMemo(() => {
    const m = new Map<string, FolderNode>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  // Children of the active folder (or root when null)
  const children = useMemo(() => {
    return folders.filter((f) => f.parent_id === activeFolderId);
  }, [folders, activeFolderId]);

  // Documents in the active folder (null ⇒ unfiled, but we only query when a folder is picked)
  const { data: docs } = useSWR<DocumentList>(
    activeFolderId ? `/documents?folder_id=${activeFolderId}&page_size=100` : null,
    fetcher
  );

  const activeNode = activeFolderId ? byId.get(activeFolderId) : null;
  const breadcrumb = activeNode
    ? activeNode.path_en.map((_, i) => {
        const prefix = activeNode.path_en.slice(0, i + 1).join(" / ");
        const node = folders.find((f) => f.path_en.join(" / ") === prefix);
        return node;
      })
    : [];

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
        <span className="text-[12px] text-gray-700">{new Date(d.created_at).toLocaleDateString(locale)}</span>
      ),
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
        <TopBarTitle>{t("folders.title")}</TopBarTitle>
      </TopBar>

      <div className="px-[22px] py-4 space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
          <button
            onClick={() => setActiveFolderId(null)}
            className={`hover:text-brand ${activeFolderId === null ? "text-brand font-medium" : ""}`}
          >
            {t("folders.root")}
          </button>
          {breadcrumb.map((node, i) => node && (
            <span key={node.id} className="inline-flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-gray-400" />
              <button
                onClick={() => setActiveFolderId(node.id)}
                className={`hover:text-brand ${
                  activeFolderId === node.id ? "text-brand font-medium" : ""
                }`}
              >
                {pathFor(node, locale)[pathFor(node, locale).length - 1]}
              </button>
            </span>
          ))}
        </div>

        {/* Subfolders grid */}
        {children.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {children.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFolderId(f.id)}
                className="bg-surface-card border border-edge-soft rounded-[10px] p-4 text-left hover:border-brand-accent hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-brand-accent flex-shrink-0" />
                  <span className="text-[13px] font-medium text-gray-900 truncate">
                    {pathFor(f, locale)[pathFor(f, locale).length - 1]}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {f.document_count}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Documents in this folder */}
        {activeFolderId && (
          <div>
            <h2 className="text-[13px] font-semibold text-gray-700 mb-2">
              {t("documents.title")}
            </h2>
            <DataTable
              columns={cols}
              rows={docs?.items ?? []}
              rowKey={(r) => r.id}
              empty={t("folders.empty")}
              minWidth={700}
            />
          </div>
        )}

        {children.length === 0 && !activeFolderId && (
          <p className="text-sm text-gray-500">{t("folders.empty")}</p>
        )}
      </div>
    </>
  );
}
