"use client";

import { ReactNode } from "react";
import { clsx } from "clsx";

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center px-2.5 py-[3px] rounded-[20px] text-[11px] border whitespace-nowrap transition-colors",
        active
          ? "bg-surface-chipActive text-[#3b6d11] border-[#b8d98a]"
          : "bg-surface text-gray-600 border-gray-300 hover:border-brand-accent"
      )}
    >
      {children}
    </button>
  );
}

export function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 border border-edge-chip rounded-[5px] text-[12px] bg-surface-hover text-gray-900 outline-none focus:border-edge-focus cursor-pointer"
    >
      {children}
    </select>
  );
}

export function FilterLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-gray-600 whitespace-nowrap">{children}</span>;
}

export function FilterDivider() {
  return <span className="w-px h-5 bg-edge-soft mx-[3px]" />;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-card border-b border-edge-soft px-[22px] py-2 flex items-center gap-[7px] flex-wrap">
      {children}
    </div>
  );
}
