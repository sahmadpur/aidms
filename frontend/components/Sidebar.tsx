"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FileText,
  Folder,
  Search,
  Clock,
  MessageSquare,
  Users,
  Building2,
  Tag,
  BarChart3,
  ClipboardList,
  Inbox,
  Settings,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { clsx } from "clsx";
import { clearTokens } from "@/lib/auth";
import { useMe, initials } from "@/lib/useMe";

type NavItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  match?: (pathname: string) => boolean;
};

const libraryNav: NavItem[] = [
  {
    href: "/documents",
    icon: FileText,
    labelKey: "allDocuments",
    match: (p) => (p === "/documents" || p.startsWith("/documents/")) && !isInboxRoute(p),
  },
  {
    href: "/documents?inbox=1",
    icon: Inbox,
    labelKey: "inbox",
    match: isInboxRoute,
  },
  { href: "/folders", icon: Folder, labelKey: "folders" },
  { href: "/search", icon: Search, labelKey: "fullTextSearch" },
  { href: "/recent-uploads", icon: Clock, labelKey: "recentUploads" },
  { href: "/chat", icon: MessageSquare, labelKey: "aiChat" },
];

function isInboxRoute(pathname: string) {
  if (typeof window === "undefined") return false;
  if (pathname !== "/documents" && !pathname.startsWith("/documents?")) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("inbox") === "1";
}

const adminManageNav: NavItem[] = [
  { href: "/admin/users", icon: Users, labelKey: "usersRoles" },
  { href: "/admin/folders", icon: Folder, labelKey: "folders" },
  { href: "/admin/departments", icon: Building2, labelKey: "departments" },
  { href: "/admin/categories", icon: Tag, labelKey: "categories" },
  {
    href: "/admin/validation-rules",
    icon: ShieldCheck,
    labelKey: "validationRules",
  },
  { href: "/admin/reports", icon: BarChart3, labelKey: "reports" },
  { href: "/admin/audit-log", icon: ClipboardList, labelKey: "auditLog" },
];

// Managers (non-admin users assigned to one or more departments) get a smaller
// Manage menu — just validation rules. They cannot see users/categories etc.
const managerManageNav: NavItem[] = [
  {
    href: "/admin/validation-rules",
    icon: ShieldCheck,
    labelKey: "validationRules",
  },
];

const accountNav: NavItem[] = [
  { href: "/settings", icon: Settings, labelKey: "settings" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex items-center gap-2.5 py-2.5 px-[18px] text-[13px] border-l-[3px] transition-colors select-none",
        active
          ? "bg-white/[0.13] text-brand-pale border-brand-accent"
          : "text-brand-light border-transparent hover:bg-white/[0.07]"
      )}
    >
      <Icon className="w-[15px] h-[15px] opacity-85 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-[18px] pt-3.5 pb-1 text-[10px] text-brand-accent uppercase tracking-[0.9px]">
      {children}
    </div>
  );
}

export default function Sidebar() {
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();

  function handleLogout() {
    clearTokens();
    router.push("/login");
  }

  const isAdmin = me?.role === "admin";
  const isManager = (me?.managed_department_ids ?? []).length > 0;
  const manageItems = isAdmin
    ? adminManageNav
    : isManager
      ? managerManageNav
      : null;

  return (
    <aside className="w-[210px] min-w-[210px] flex-shrink-0 bg-brand flex flex-col h-screen sticky top-0">
      <div className="px-[18px] py-5 border-b border-white/10">
        <span className="text-base font-semibold text-brand-pale tracking-[0.3px]">
          DocArchive
        </span>
        <sup className="text-[10px] text-brand-accent ml-[3px]">AI</sup>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SectionHeader>{t("library")}</SectionHeader>
        {libraryNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item)} label={t(item.labelKey)} />
        ))}

        {manageItems && (
          <>
            <SectionHeader>{t("manage")}</SectionHeader>
            {manageItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item)} label={t(item.labelKey)} />
            ))}
          </>
        )}

        <SectionHeader>{t("account")}</SectionHeader>
        {accountNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item)} label={t(item.labelKey)} />
        ))}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 py-2.5 px-[18px] text-[13px] border-l-[3px] border-transparent text-brand-light hover:bg-white/[0.07] transition-colors text-left"
        >
          <LogOut className="w-[15px] h-[15px] opacity-85 flex-shrink-0" />
          <span className="truncate">{t("logout")}</span>
        </button>
      </nav>

      <div className="px-[18px] py-3.5 border-t border-white/10">
        {me ? (
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-full bg-brand-chip flex items-center justify-center text-[11px] font-semibold text-brand-pale flex-shrink-0">
              {initials(me.full_name)}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] text-brand-light font-medium truncate">{me.full_name}</div>
              <div className="text-[10px] text-brand-accent mt-[1px] truncate">
                {tRoles(me.role)}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[30px]" />
        )}
      </div>
    </aside>
  );
}
