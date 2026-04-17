"use client";

import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const { data: users, isLoading, mutate } = useSWR("/admin/users", fetcher);

  async function updateRole(id: string, role: string) {
    await api.patch(`/admin/users/${id}`, { role });
    mutate();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.patch(`/admin/users/${id}`, { role: users.find((u: any) => u.id === id)?.role, is_active: !isActive });
    mutate();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">{t("users")}</h1>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t("role")}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t("active")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users?.map((user: any) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{user.full_name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(user.id, user.is_active)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
