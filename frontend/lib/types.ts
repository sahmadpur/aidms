export type DocType = "contract" | "invoice" | "report" | "letter" | "permit" | "other";
export type OcrStatus = "pending" | "processing" | "completed" | "failed";

export const DOC_TYPES: DocType[] = [
  "contract",
  "invoice",
  "report",
  "letter",
  "permit",
  "other",
];

export interface Document {
  id: string;
  display_id: string | null;
  user_id: string;
  title: string;
  category_id: string | null;
  folder_id: string | null;
  department_id: string | null;
  doc_type: DocType | null;
  physical_location: string | null;
  tags: string[];
  language: string | null;
  description: string | null;
  source: string | null;
  original_filename: string | null;
  file_size_bytes: number;
  ocr_status: OcrStatus;
  ocr_error: string | null;
  ocr_retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentList {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface Department {
  id: string;
  name_az: string;
  name_ru: string;
  name_en: string;
  created_at: string;
}

export function localizedName(
  obj: { name_az: string; name_ru: string; name_en: string },
  locale: string
): string {
  if (locale === "az") return obj.name_az;
  if (locale === "ru") return obj.name_ru;
  return obj.name_en;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
