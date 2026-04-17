"use client";

import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarTitle } from "@/components/TopBar";
import { DataTable, Column } from "@/components/DataTable";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  is_active: boolean;
  language_preference: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const t = useTranslations();
  const { data: users, isLoading, mutate } = useSWR<UserRow[]>("/admin/users", fetcher);

  async function updateRole(u: UserRow, role: string) {
    await api.patch(`/admin/users/${u.id}`, { role, is_active: u.is_active });
    mutate();
  }

  async function toggleActive(u: UserRow) {
    await api.patch(`/admin/users/${u.id}`, { role: u.role, is_active: !u.is_active });
    mutate();
  }

  const cols: Column<UserRow>[] = [
    {
      key: "user",
      header: t("auth.fullName"),
      render: (u) => (
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-gray-900 truncate">{u.full_name}</div>
          <div className="text-[11px] text-gray-500 truncate">{u.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: t("admin.role"),
      width: "130px",
      render: (u) => (
        <select
          value={u.role}
          onChange={(e) => updateRole(u, e.target.value)}
          className="text-[12px] border border-edge-chip rounded px-2 py-1 bg-surface-hover focus:outline-none focus:border-edge-focus"
        >
          <option value="user">{t("roles.user")}</option>
          <option value="admin">{t("roles.admin")}</option>
        </select>
      ),
    },
    {
      key: "active",
      header: t("admin.active"),
      width: "110px",
      render: (u) => (
        <button
          onClick={() => toggleActive(u)}
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            u.is_active
              ? "bg-surface-chipActive text-[#3b6d11] border border-[#b8d98a]"
              : "bg-gray-100 text-gray-500 border border-gray-300"
          }`}
        >
          {u.is_active ? t("common.yes") : t("common.no")}
        </button>
      ),
    },
    {
      key: "created",
      header: t("documents.uploadDate"),
      width: "120px",
      render: (u) => (
        <span className="text-[12px] text-gray-700">{new Date(u.created_at).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("nav.usersRoles")}</TopBarTitle>
      </TopBar>
      <div className="px-[22px] py-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <DataTable columns={cols} rows={users ?? []} rowKey={(r) => r.id} minWidth={700} />
        )}
      </div>
    </>
  );
}
