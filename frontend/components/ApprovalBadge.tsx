import { clsx } from "clsx";
import type { ApprovalStatus } from "@/lib/types";

const styles: Record<ApprovalStatus, string> = {
  pending: "bg-approval-pending-bg text-approval-pending-fg border-approval-pending-edge",
  approved: "bg-approval-approved-bg text-approval-approved-fg border-approval-approved-edge",
  rejected: "bg-approval-rejected-bg text-approval-rejected-fg border-approval-rejected-edge",
  revision_requested: "bg-approval-revision-bg text-approval-revision-fg border-approval-revision-edge",
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
