"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText, Search, MessageSquare, Settings, LogOut } from "lucide-react";
import { clearTokens } from "@/lib/auth";
import { clsx } from "clsx";

const navItems = [
  { href: "/documents", icon: FileText, key: "documents" as const },
  { href: "/search", icon: Search, key: "search" as const },
  { href: "/chat", icon: MessageSquare, key: "chat" as const },
];

export default function Sidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearTokens();
    router.push("/login");
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">AI DMS</h1>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, icon: Icon, key }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <Icon className="w-4 h-4" />
            {t(key)}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-200 space-y-1">
        <Link
          href="/admin/categories"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <Settings className="w-4 h-4" />
          {t("admin")}
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <LogOut className="w-4 h-4" />
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
