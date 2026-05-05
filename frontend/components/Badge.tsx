import { clsx } from "clsx";

type DocType = "contract" | "invoice" | "report" | "letter" | "permit" | "other";
type OcrStatus = "pending" | "processing" | "completed" | "failed";

const docTypeClass: Record<DocType, string> = {
  contract: "bg-badge-contract-bg text-badge-contract-fg",
  invoice: "bg-badge-invoice-bg text-badge-invoice-fg",
  report: "bg-badge-report-bg text-badge-report-fg",
  letter: "bg-badge-letter-bg text-badge-letter-fg",
  permit: "bg-badge-permit-bg text-badge-permit-fg",
  other: "bg-badge-other-bg text-badge-other-fg",
};

export function DocTypeBadge({ type, label }: { type: string | null | undefined; label?: string }) {
  if (!type) return <span className="text-[11.5px] text-gray-400">—</span>;
  const variant = (docTypeClass[type as DocType] ?? docTypeClass.other);
  return (
    <span className={clsx("inline-block px-2.5 py-0.5 rounded-[10px] text-[10px] font-semibold", variant)}>
      {label ?? type}
    </span>
  );
}

const dotClass: Record<OcrStatus, string> = {
  completed: "bg-dot-done",
  processing: "bg-dot-progress",
  pending: "bg-dot-pending",
  failed: "bg-dot-failed",
};

export function OcrStatusDot({ status, label }: { status: string; label?: string }) {
  const variant = dotClass[status as OcrStatus] ?? dotClass.pending;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-700">
      <span className={clsx("w-[7px] h-[7px] rounded-full flex-shrink-0", variant)} />
      {label ?? status}
    </span>
  );
}

type ValidationStatus =
  | "not_evaluated"
  | "pending"
  | "passed"
  | "failed"
  | "skipped";

const validationDotClass: Record<ValidationStatus, string> = {
  passed: "bg-dot-done",
  pending: "bg-dot-progress",
  not_evaluated: "bg-gray-300",
  skipped: "bg-gray-300",
  failed: "bg-dot-failed",
};

export function ValidationStatusDot({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const variant =
    validationDotClass[status as ValidationStatus] ??
    validationDotClass.not_evaluated;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-700">
      <span
        className={clsx("w-[7px] h-[7px] rounded-full flex-shrink-0", variant)}
      />
      {label ?? status}
    </span>
  );
}
