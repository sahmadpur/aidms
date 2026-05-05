"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import {
  Plus,
  Loader2,
  Pencil,
  KeyRound,
  Power,
  Search,
} from "lucide-react";
import api from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import { DataTable, Column } from "@/components/DataTable";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import type { Department } from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface UserDept {
  id: string;
  name_az: string;
  name_ru: string;
  name_en: string;
  is_manager: boolean;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  is_active: boolean;
  is_verified: boolean;
  language_preference: "az" | "ru" | "en";
  created_at: string;
  departments: UserDept[];
}

type Mode = "create" | "edit" | "password" | null;

interface DeptRow {
  department_id: string;
  is_manager: boolean;
}

interface UserForm {
  email: string;
  full_name: string;
  role: "admin" | "user";
  language_preference: "az" | "ru" | "en";
  password: string;
  confirm_password: string;
  departments: DeptRow[];
}

const EMPTY_FORM: UserForm = {
  email: "",
  full_name: "",
  role: "user",
  language_preference: "en",
  password: "",
  confirm_password: "",
  departments: [],
};

export default function AdminUsersPage() {
  const t = useTranslations();
  const { data: me } = useMe();
  const { data: users, isLoading, mutate } = useSWR<UserRow[]>(
    "/admin/users",
    fetcher,
  );
  const { data: departments = [] } = useSWR<Department[]>(
    "/admin/departments",
    fetcher,
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [target, setTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [pwForm, setPwForm] = useState({ new_password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deptsTouched, setDeptsTouched] = useState(false);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, searchTerm]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setDeptsTouched(false);
    setTarget(null);
    setMode("create");
  }

  function openEdit(u: UserRow) {
    setForm({
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      language_preference: u.language_preference,
      password: "",
      confirm_password: "",
      departments: u.departments.map((d) => ({
        department_id: d.id,
        is_manager: d.is_manager,
      })),
    });
    setError(null);
    setDeptsTouched(false);
    setTarget(u);
    setMode("edit");
  }

  function openPassword(u: UserRow) {
    setPwForm({ new_password: "", confirm: "" });
    setError(null);
    setTarget(u);
    setMode("password");
  }

  function close() {
    setMode(null);
    setTarget(null);
    setError(null);
  }

  function setDept(department_id: string, patch: Partial<DeptRow> | null) {
    setDeptsTouched(true);
    setForm((f) => {
      if (patch === null) {
        return {
          ...f,
          departments: f.departments.filter(
            (d) => d.department_id !== department_id,
          ),
        };
      }
      const existing = f.departments.find(
        (d) => d.department_id === department_id,
      );
      if (existing) {
        return {
          ...f,
          departments: f.departments.map((d) =>
            d.department_id === department_id ? { ...d, ...patch } : d,
          ),
        };
      }
      return {
        ...f,
        departments: [
          ...f.departments,
          { department_id, is_manager: false, ...patch },
        ],
      };
    });
  }

  function getDept(department_id: string): DeptRow | undefined {
    return form.departments.find((d) => d.department_id === department_id);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm_password) {
      setError(t("admin.passwordsDoNotMatch"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/admin/users", {
        email: form.email,
        full_name: form.full_name,
        password: form.password,
        role: form.role,
        language_preference: form.language_preference,
        departments: form.departments,
      });
      close();
      mutate();
    } catch (err: any) {
      setError(extractError(err) ?? t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    setSubmitting(true);

    const patch: Record<string, unknown> = {};
    if (form.full_name !== target.full_name) patch.full_name = form.full_name;
    if (form.email !== target.email) patch.email = form.email;
    if (form.role !== target.role) patch.role = form.role;
    if (form.language_preference !== target.language_preference)
      patch.language_preference = form.language_preference;
    if (deptsTouched) patch.departments = form.departments;

    try {
      await api.patch(`/admin/users/${target.id}`, patch);
      close();
      mutate();
    } catch (err: any) {
      setError(extractError(err) ?? t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    if (pwForm.new_password !== pwForm.confirm) {
      setError(t("admin.passwordsDoNotMatch"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/admin/users/${target.id}/password`, {
        new_password: pwForm.new_password,
      });
      close();
    } catch (err: any) {
      setError(extractError(err) ?? t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: UserRow) {
    if (u.is_active) {
      if (!confirm(t("admin.confirmDeactivate"))) return;
    }
    try {
      await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active });
      mutate();
    } catch (err: any) {
      alert(extractError(err) ?? t("errors.generic"));
    }
  }

  const cols: Column<UserRow>[] = [
    {
      key: "user",
      header: t("auth.fullName"),
      render: (u) => (
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-gray-900 truncate">
            {u.full_name}
            {!u.is_active && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">
                · {t("admin.inactive")}
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 truncate">{u.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: t("admin.role"),
      width: "100px",
      render: (u) => (
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
            u.role === "admin"
              ? "bg-brand-pale text-brand border-brand/30"
              : "bg-gray-100 text-gray-600 border-gray-200"
          }`}
        >
          {t(`roles.${u.role}`)}
        </span>
      ),
    },
    {
      key: "lang",
      header: t("settings.language"),
      width: "70px",
      render: (u) => (
        <span className="text-[11px] uppercase font-mono text-gray-500">
          {u.language_preference}
        </span>
      ),
    },
    {
      key: "departments",
      header: t("admin.assignedDepartments"),
      render: (u) => {
        if (u.departments.length === 0) {
          return <span className="text-[11px] text-gray-400">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {u.departments.map((d) => (
              <span
                key={d.id}
                className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                  d.is_manager
                    ? "bg-brand-pale text-brand border-brand/30"
                    : "bg-gray-50 text-gray-600 border-gray-200"
                }`}
                title={d.is_manager ? t("admin.manager") : t("admin.member")}
              >
                {d.name_en}
                {d.is_manager && (
                  <span className="ml-1 font-bold">M</span>
                )}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "created",
      header: t("documents.uploadDate"),
      width: "100px",
      render: (u) => (
        <span className="text-[12px] text-gray-700">
          {new Date(u.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "130px",
      render: (u) => {
        const isSelf = me?.id === u.id;
        return (
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => openEdit(u)}
              className="p-1.5 text-gray-500 hover:text-brand rounded hover:bg-surface-hover"
              title={t("admin.editUser")}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => openPassword(u)}
              className="p-1.5 text-gray-500 hover:text-brand rounded hover:bg-surface-hover"
              title={t("admin.resetPassword")}
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            {!isSelf && (
              <button
                onClick={() => toggleActive(u)}
                className={`p-1.5 rounded hover:bg-surface-hover ${
                  u.is_active
                    ? "text-gray-500 hover:text-red-500"
                    : "text-gray-400 hover:text-brand"
                }`}
                title={
                  u.is_active ? t("admin.deactivate") : t("admin.activate")
                }
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("nav.usersRoles")}</TopBarTitle>
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("admin.searchPlaceholder")}
            className="pl-7 pr-2.5 py-1 text-[12px] border border-edge-chip rounded-[5px] bg-surface-hover focus:outline-none focus:border-edge-focus focus:bg-white w-[220px]"
          />
        </div>
        <TopBarButton variant="primary" onClick={openCreate}>
          <Plus className="w-3 h-3" />
          {t("admin.newUser")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <DataTable
            columns={cols}
            rows={filtered}
            rowKey={(r) => r.id}
            minWidth={900}
          />
        )}
      </div>

      {(mode === "create" || mode === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={mode === "create" ? submitCreate : submitEdit}
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-lg border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {mode === "create"
                  ? t("admin.newUser")
                  : t("admin.editUser")}
              </h2>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <Field label={t("auth.email")}>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label={t("auth.fullName")}>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("admin.role")}>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        role: e.target.value as "admin" | "user",
                      })
                    }
                    className={inputCls}
                  >
                    <option value="user">{t("roles.user")}</option>
                    <option value="admin">{t("roles.admin")}</option>
                  </select>
                </Field>
                <Field label={t("settings.language")}>
                  <select
                    value={form.language_preference}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        language_preference: e.target.value as
                          | "az"
                          | "ru"
                          | "en",
                      })
                    }
                    className={inputCls}
                  >
                    <option value="en">English</option>
                    <option value="az">Azərbaycan</option>
                    <option value="ru">Русский</option>
                  </select>
                </Field>
              </div>

              {mode === "create" && (
                <>
                  <Field label={t("admin.password")}>
                    <input
                      required
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      className={inputCls}
                    />
                    <PasswordStrengthMeter value={form.password} />
                  </Field>
                  <Field label={t("admin.confirmPassword")}>
                    <input
                      required
                      type="password"
                      value={form.confirm_password}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          confirm_password: e.target.value,
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                </>
              )}

              <div>
                <span className="block text-[11px] font-medium text-gray-600 mb-1">
                  {t("admin.assignedDepartments")}
                </span>
                <div className="border border-edge-chip rounded-[5px] max-h-[220px] overflow-y-auto bg-white divide-y divide-edge-soft">
                  {departments.length === 0 && (
                    <div className="px-2.5 py-2 text-[11px] text-gray-400 italic">
                      {t("departments.empty") || "—"}
                    </div>
                  )}
                  {departments.map((d) => {
                    const row = getDept(d.id);
                    const assigned = !!row;
                    return (
                      <div
                        key={d.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-[12px]"
                      >
                        <input
                          type="checkbox"
                          checked={assigned}
                          onChange={(e) =>
                            setDept(
                              d.id,
                              e.target.checked
                                ? { is_manager: false }
                                : null,
                            )
                          }
                        />
                        <span className="flex-1 truncate">{d.name_en}</span>
                        {assigned && (
                          <label className="flex items-center gap-1 text-[11px] text-gray-600">
                            <input
                              type="checkbox"
                              checked={row?.is_manager ?? false}
                              onChange={(e) =>
                                setDept(d.id, {
                                  is_manager: e.target.checked,
                                })
                              }
                            />
                            {t("admin.manager")}
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                  {error}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="px-3.5 py-1.5 text-[12px] bg-white border border-edge-chip text-gray-700 rounded-[6px] hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {mode === "password" && target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={submitPassword}
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-md border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {t("admin.resetPassword")}
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">{target.email}</p>
            </div>
            <div className="p-5 space-y-3">
              <Field label={t("admin.password")}>
                <input
                  required
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) =>
                    setPwForm({ ...pwForm, new_password: e.target.value })
                  }
                  className={inputCls}
                />
                <PasswordStrengthMeter value={pwForm.new_password} />
              </Field>
              <Field label={t("admin.confirmPassword")}>
                <input
                  required
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) =>
                    setPwForm({ ...pwForm, confirm: e.target.value })
                  }
                  className={inputCls}
                />
              </Field>
              {error && (
                <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                  {error}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="px-3.5 py-1.5 text-[12px] bg-white border border-edge-chip text-gray-700 rounded-[6px] hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function extractError(err: any): string | null {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d: any) => d.msg ?? String(d)).join("; ");
  }
  return null;
}
