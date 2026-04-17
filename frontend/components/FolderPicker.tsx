"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { ChevronRight, Folder } from "lucide-react";
import { clsx } from "clsx";
import api from "@/lib/api";

export interface FolderNode {
  id: string;
  parent_id: string | null;
  name_az: string;
  name_ru: string;
  name_en: string;
  depth: number;
  path_az: string[];
  path_ru: string[];
  path_en: string[];
  document_count: number;
}

const fetcher = (url: string) => api.get<FolderNode[]>(url).then((r) => r.data);

export function useFolders() {
  return useSWR<FolderNode[]>("/folders", fetcher, { revalidateOnFocus: false });
}

export function pathFor(node: FolderNode, locale: string): string[] {
  if (locale === "az") return node.path_az;
  if (locale === "ru") return node.path_ru;
  return node.path_en;
}

export function FolderPicker({
  value,
  onChange,
  locale,
  allowRoot = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  locale: string;
  allowRoot?: boolean;
}) {
  const { data: folders = [], isLoading } = useFolders();

  const options = useMemo(
    () =>
      folders.map((f) => ({
        id: f.id,
        depth: f.depth,
        label: pathFor(f, locale).join(" / "),
      })),
    [folders, locale]
  );

  if (isLoading) {
    return <div className="text-[12px] text-gray-500">Loading folders…</div>;
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-2 py-1.5 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover outline-none focus:border-edge-focus"
    >
      {allowRoot && <option value="">— No folder —</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Breadcrumb rendering a folder path for a table cell. */
export function FolderBreadcrumb({
  folderId,
  folders,
  locale,
}: {
  folderId: string | null | undefined;
  folders: FolderNode[] | undefined;
  locale: string;
}) {
  if (!folderId || !folders) {
    return <span className="text-[11.5px] text-gray-400">—</span>;
  }
  const node = folders.find((f) => f.id === folderId);
  if (!node) return <span className="text-[11.5px] text-gray-400">—</span>;
  const parts = pathFor(node, locale);
  return (
    <span className="text-[11.5px] text-gray-600 inline-flex items-center gap-0.5">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5" />}
          <span className={clsx(i === parts.length - 1 && "text-gray-800 font-medium")}>{p}</span>
        </span>
      ))}
    </span>
  );
}

export { Folder as FolderIcon };
