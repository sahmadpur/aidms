import { ReactNode } from "react";
import { clsx } from "clsx";

export function TopBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-card border-b border-edge-soft px-[22px] py-2.5 flex items-center gap-2.5">
      {children}
    </div>
  );
}

export function TopBarTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-[15px] font-semibold text-gray-900 mr-1.5 whitespace-nowrap">
      {children}
    </span>
  );
}

export function TopBarButton({
  variant = "default",
  onClick,
  type = "button",
  disabled,
  children,
}: {
  variant?: "default" | "primary";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "px-3.5 py-1.5 rounded-[6px] text-[12px] flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-brand text-brand-pale border border-brand hover:bg-brand-hover"
          : "bg-white text-brand border border-edge-chip hover:bg-[#f0f7e6]"
      )}
    >
      {children}
    </button>
  );
}
