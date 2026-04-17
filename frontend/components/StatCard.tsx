import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="bg-surface-card border border-edge-soft rounded-[10px] px-5 py-4 flex items-start gap-4">
      {icon && <div className="text-brand-accent flex-shrink-0 mt-1">{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
        <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
        {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
      </div>
    </div>
  );
}
