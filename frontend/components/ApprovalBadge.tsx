import { clsx } from "clsx";
import type { ApprovalStatus } from "@/lib/types";

const styles: Record<ApprovalStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  revision_requested: "bg-sky-50 text-sky-700 border-sky-200",
};

export function ApprovalBadge({
  status,
  label,
}: {
  status: ApprovalStatus;
  label?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-block px-2 py-0.5 rounded-[10px] text-[10px] font-semibold border",
        styles[status]
      )}
    >
      {label ?? status}
    </span>
  );
}
