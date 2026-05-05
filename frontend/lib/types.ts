export type DocType = "contract" | "invoice" | "report" | "letter" | "permit" | "other";
export type OcrStatus = "pending" | "processing" | "completed" | "failed";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";
export const APPROVAL_STATUSES: ApprovalStatus[] = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
];

export type ValidationStatus =
  | "not_evaluated"
  | "pending"
  | "passed"
  | "failed"
  | "skipped";
export const VALIDATION_STATUSES: ValidationStatus[] = [
  "not_evaluated",
  "pending",
  "passed",
  "failed",
  "skipped",
];

export type ValidationTarget =
  | "ocr_text"
  | "title"
  | "tags"
  | "physical_location";
export const VALIDATION_TARGETS: ValidationTarget[] = [
  "ocr_text",
  "title",
  "tags",
  "physical_location",
];

export type ValidationOperator =
  | "contains"
  | "not_contains"
  | "regex"
  | "any_of"
  | "all_of"
  | "min_length"
  | "min_word_count"
  | "date_present"
  | "exists";
export const VALIDATION_OPERATORS: ValidationOperator[] = [
  "contains",
  "not_contains",
  "regex",
  "any_of",
  "all_of",
  "min_length",
  "min_word_count",
  "date_present",
  "exists",
];

export type ValidationSeverity = "error" | "warning";

export type NotificationType =
  | "comment_added"
  | "approval_requested"
  | "document_approved"
  | "document_rejected"
  | "revision_requested"
  | "document_resubmitted"
  | "comment_mention"
  | "validation_failed";

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
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  validation_status: ValidationStatus;
  validation_results: ValidationResultItem[] | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationResultItem {
  rule_id: string;
  rule_name: string;
  severity: ValidationSeverity;
  passed: boolean;
  message: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  doc_type: DocType | null;
  target: ValidationTarget;
  operator: ValidationOperator;
  value: unknown;
  severity: ValidationSeverity;
  is_active: boolean;
  created_by: string;
  created_by_role: "admin" | "manager";
  created_at: string;
  updated_at: string;
}

export interface DocumentList {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface DepartmentManager {
  id: string;
  full_name: string;
  email: string;
}

export interface Department {
  id: string;
  name_az: string;
  name_ru: string;
  name_en: string;
  created_at: string;
  managers: DepartmentManager[];
}

export interface CommentAuthor {
  id: string;
  full_name: string;
  email: string;
}

export interface Comment {
  id: string;
  document_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: CommentAuthor;
}

export interface NotificationActor {
  id: string;
  full_name: string;
}

export interface Notification {
  id: string;
  user_id: string;
  actor: NotificationActor | null;
  type: NotificationType;
  document_id: string | null;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  items: Notification[];
  unread_count: number;
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
