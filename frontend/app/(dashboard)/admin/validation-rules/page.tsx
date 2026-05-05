"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import useSWR from "swr";
import {
  Plus,
  Trash2,
  Loader2,
  Pencil,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import api from "@/lib/api";
import { TopBar, TopBarButton, TopBarTitle } from "@/components/TopBar";
import { useMe } from "@/lib/useMe";
import {
  DOC_TYPES,
  VALIDATION_OPERATORS,
  VALIDATION_TARGETS,
  localizedName,
  type Department,
  type DocType,
  type ValidationOperator,
  type ValidationRule,
  type ValidationSeverity,
  type ValidationTarget,
} from "@/lib/types";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const NULLARY_OPS: ValidationOperator[] = ["date_present", "exists"];
const ARRAY_OPS: ValidationOperator[] = ["any_of", "all_of"];
const INT_OPS: ValidationOperator[] = ["min_length", "min_word_count"];

interface RuleForm {
  name: string;
  description: string;
  department_id: string; // "" means global (admin only)
  doc_type: string; // "" means any
  target: ValidationTarget;
  operator: ValidationOperator;
  value_text: string; // free-form for contains/not_contains/regex
  value_list: string; // comma-separated for any_of/all_of
  value_int: string; // for min_length/min_word_count
  severity: ValidationSeverity;
  is_active: boolean;
}

const EMPTY: RuleForm = {
  name: "",
  description: "",
  department_id: "",
  doc_type: "",
  target: "ocr_text",
  operator: "contains",
  value_text: "",
  value_list: "",
  value_int: "1",
  severity: "error",
  is_active: true,
};

function buildValue(form: RuleForm): unknown {
  if (NULLARY_OPS.includes(form.operator)) return null;
  if (ARRAY_OPS.includes(form.operator)) {
    return form.value_list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (INT_OPS.includes(form.operator)) {
    const n = parseInt(form.value_int, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return form.value_text;
}

function readValueFor(rule: ValidationRule): {
  value_text: string;
  value_list: string;
  value_int: string;
} {
  const v = rule.value;
  if (Array.isArray(v))
    return { value_text: "", value_list: v.join(", "), value_int: "1" };
  if (typeof v === "number")
    return { value_text: "", value_list: "", value_int: String(v) };
  if (typeof v === "string")
    return { value_text: v, value_list: "", value_int: "1" };
  return { value_text: "", value_list: "", value_int: "1" };
}

export default function AdminValidationRulesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const managedDeptIds = useMemo(
    () => new Set(me?.managed_department_ids ?? []),
    [me?.managed_department_ids]
  );

  const { data: rules, isLoading, mutate } =
    useSWR<ValidationRule[]>("/admin/validation-rules", fetcher);
  const { data: departments = [] } = useSWR<Department[]>(
    "/admin/departments",
    fetcher
  );

  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedDepartments = useMemo(
    () =>
      isAdmin
        ? departments
        : departments.filter((d) => managedDeptIds.has(d.id)),
    [departments, isAdmin, managedDeptIds]
  );

  function canWrite(rule: ValidationRule): boolean {
    if (isAdmin) return true;
    if (rule.created_by_role === "admin") return false;
    if (!rule.department_id) return false;
    return managedDeptIds.has(rule.department_id);
  }

  function openCreate() {
    setForm({
      ...EMPTY,
      department_id: isAdmin
        ? ""
        : allowedDepartments[0]?.id ?? "",
    });
    setEditingId(null);
    setError(null);
    setShowModal(true);
  }

  function openEdit(rule: ValidationRule) {
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      department_id: rule.department_id ?? "",
      doc_type: rule.doc_type ?? "",
      target: rule.target,
      operator: rule.operator,
      severity: rule.severity,
      is_active: rule.is_active,
      ...readValueFor(rule),
    });
    setEditingId(rule.id);
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      name: form.name,
      description: form.description || null,
      department_id: form.department_id || null,
      doc_type: form.doc_type || null,
      target: form.target,
      operator: form.operator,
      value: buildValue(form),
      severity: form.severity,
      is_active: form.is_active,
    };
    try {
      if (editingId) {
        await api.patch(`/admin/validation-rules/${editingId}`, payload);
      } else {
        await api.post("/admin/validation-rules", payload);
      }
      setShowModal(false);
      mutate();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail ?? t("errors.generic");
      setError(detail);
    }
  }

  async function handleDelete(rule: ValidationRule) {
    if (!confirm(t("validation.deleteConfirm"))) return;
    await api.delete(`/admin/validation-rules/${rule.id}`);
    mutate();
  }

  async function handleRevalidate(rule: ValidationRule) {
    if (!confirm(t("validation.revalidateConfirm"))) return;
    await api.post(`/admin/validation-rules/${rule.id}/revalidate`);
    alert(t("validation.revalidateQueued"));
  }

  function deptName(id: string | null): string {
    if (!id) return t("validation.scope.global");
    const d = departments.find((x) => x.id === id);
    return d ? localizedName(d, locale) : id;
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("validation.title")}</TopBarTitle>
        <div className="flex-1" />
        <TopBarButton variant="primary" onClick={openCreate}>
          <Plus className="w-3 h-3" />
          {t("validation.newRule")}
        </TopBarButton>
      </TopBar>

      <div className="px-[22px] py-4 space-y-3 max-w-4xl">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : !rules || rules.length === 0 ? (
          <div className="text-center py-12 text-[12px] text-gray-500">
            {t("validation.empty")}
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => {
              const writable = canWrite(rule);
              return (
                <li
                  key={rule.id}
                  className="bg-surface-card border border-edge-soft rounded-[10px] px-4 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-medium text-gray-900">
                        {rule.name}
                      </p>
                      {!rule.is_active && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {t("validation.disabled")}
                        </span>
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          rule.severity === "error"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t(`validation.severity.${rule.severity}`)}
                      </span>
                      {rule.created_by_role === "admin" && !isAdmin && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-brand-pale text-brand rounded">
                          {t("validation.adminAuthored")}
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {rule.description}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-600 mt-1.5">
                      <span className="text-gray-400">
                        {t("validation.scope.label")}:
                      </span>{" "}
                      <span className="text-gray-800">
                        {deptName(rule.department_id)}
                      </span>
                      {" · "}
                      <span className="text-gray-400">
                        {t("validation.docTypeLabel")}:
                      </span>{" "}
                      <span className="text-gray-800">
                        {rule.doc_type
                          ? t(`docType.${rule.doc_type}`)
                          : t("validation.scope.anyType")}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5 font-mono">
                      {t(`validation.target.${rule.target}`)}{" "}
                      <span className="text-gray-400">·</span>{" "}
                      {t(`validation.operator.${rule.operator}`)}
                      {!NULLARY_OPS.includes(rule.operator) && (
                        <>
                          {" "}
                          <span className="text-gray-400">·</span>{" "}
                          <span className="text-gray-800">
                            {Array.isArray(rule.value)
                              ? (rule.value as unknown[]).join(", ")
                              : String(rule.value ?? "")}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isAdmin && (
                      <button
                        onClick={() => handleRevalidate(rule)}
                        className="p-1.5 text-gray-500 hover:text-brand rounded hover:bg-surface-hover"
                        title={t("validation.revalidate")}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      disabled={!writable}
                      onClick={() => openEdit(rule)}
                      className={`p-1.5 rounded ${
                        writable
                          ? "text-gray-500 hover:text-brand hover:bg-surface-hover"
                          : "text-gray-300 cursor-not-allowed"
                      }`}
                      title={t("common.edit")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      disabled={!writable}
                      onClick={() => handleDelete(rule)}
                      className={`p-1.5 rounded ${
                        writable
                          ? "text-gray-400 hover:text-red-500 hover:bg-red-50"
                          : "text-gray-300 cursor-not-allowed"
                      }`}
                      title={t("common.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-surface-card rounded-xl shadow-xl w-full max-w-lg border border-edge-soft"
          >
            <div className="px-5 py-4 border-b border-edge-soft">
              <h2 className="text-[15px] font-semibold text-gray-900">
                {editingId ? t("common.edit") : t("validation.newRule")}
              </h2>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {error && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-700">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Field label={t("validation.fields.name")}>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                />
              </Field>

              <Field label={t("validation.fields.description")}>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("validation.fields.department")}>
                  <select
                    value={form.department_id}
                    onChange={(e) =>
                      setForm({ ...form, department_id: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  >
                    {isAdmin && (
                      <option value="">{t("validation.scope.global")}</option>
                    )}
                    {allowedDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {localizedName(d, locale)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("validation.fields.docType")}>
                  <select
                    value={form.doc_type}
                    onChange={(e) =>
                      setForm({ ...form, doc_type: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  >
                    <option value="">{t("validation.scope.anyType")}</option>
                    {DOC_TYPES.map((dt: DocType) => (
                      <option key={dt} value={dt}>
                        {t(`docType.${dt}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("validation.fields.target")}>
                  <select
                    value={form.target}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        target: e.target.value as ValidationTarget,
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  >
                    {VALIDATION_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {t(`validation.target.${target}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("validation.fields.operator")}>
                  <select
                    value={form.operator}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        operator: e.target.value as ValidationOperator,
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
                  >
                    {VALIDATION_OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {t(`validation.operator.${op}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <ValueField form={form} setForm={setForm} />

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("validation.fields.severity")}>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        severity: e.target.value as ValidationSeverity,
                      })
                    }
                    disabled={!!editingId && !isAdmin}
                    className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="error">
                      {t("validation.severity.error")}
                    </option>
                    <option value="warning">
                      {t("validation.severity.warning")}
                    </option>
                  </select>
                </Field>

                <Field label={t("validation.fields.active")}>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) =>
                        setForm({ ...form, is_active: e.target.checked })
                      }
                    />
                    <span>{t("validation.fields.activeLabel")}</span>
                  </label>
                </Field>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3.5 py-1.5 text-[12px] bg-white border border-edge-chip text-gray-700 rounded-[6px] hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale border border-brand rounded-[6px] hover:bg-brand-hover"
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

function ValueField({
  form,
  setForm,
}: {
  form: RuleForm;
  setForm: (f: RuleForm) => void;
}) {
  const t = useTranslations();
  if (NULLARY_OPS.includes(form.operator)) {
    return (
      <p className="text-[11px] text-gray-500 italic">
        {t("validation.valueHint.nullary")}
      </p>
    );
  }
  if (ARRAY_OPS.includes(form.operator)) {
    return (
      <Field label={t("validation.fields.valueList")}>
        <input
          required
          value={form.value_list}
          onChange={(e) => setForm({ ...form, value_list: e.target.value })}
          placeholder={t("validation.placeholder.list")}
          className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
        />
        <p className="text-[10px] text-gray-500 mt-1">
          {t("validation.valueHint.list")}
        </p>
      </Field>
    );
  }
  if (INT_OPS.includes(form.operator)) {
    return (
      <Field label={t("validation.fields.valueInt")}>
        <input
          required
          type="number"
          min={1}
          value={form.value_int}
          onChange={(e) => setForm({ ...form, value_int: e.target.value })}
          className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white"
        />
      </Field>
    );
  }
  return (
    <Field
      label={
        form.operator === "regex"
          ? t("validation.fields.valueRegex")
          : t("validation.fields.valueText")
      }
    >
      <input
        required
        value={form.value_text}
        onChange={(e) => setForm({ ...form, value_text: e.target.value })}
        placeholder={
          form.operator === "regex"
            ? t("validation.placeholder.regex")
            : t("validation.placeholder.text")
        }
        className="w-full px-2.5 py-1.5 border border-edge-chip rounded-[5px] text-[13px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white font-mono"
      />
      {form.operator === "regex" && (
        <p className="text-[10px] text-gray-500 mt-1">
          {t("validation.valueHint.regex")}
        </p>
      )}
    </Field>
  );
}
