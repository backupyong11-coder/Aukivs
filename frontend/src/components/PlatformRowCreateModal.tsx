"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

export const PLATFORM_ROW_CREATE_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "회사명", label: "회사명" },
  { key: "발표일", label: "발표일" },
  { key: "플랫폼명", label: "플랫폼명" },
  { key: "분류", label: "분류" },
  { key: "대분류", label: "대분류" },
  { key: "현재단계", label: "현재단계" },
  { key: "마지막상황", label: "마지막상황" },
  { key: "대기사유", label: "대기사유" },
  { key: "다음액션", label: "다음액션" },
  { key: "우선순위", label: "우선순위" },
  { key: "비고", label: "비고" },
];

function emptyCreateForm(): Record<string, string> {
  const form: Record<string, string> = {};
  PLATFORM_ROW_CREATE_FIELDS.forEach(({ key }) => {
    form[key] = "";
  });
  return form;
}

async function apiFetch(path: string, body: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { detail?: string };
      throw new Error(j.detail ?? text);
    } catch {
      throw new Error(text);
    }
  }
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

export function PlatformRowCreateModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  title?: string;
}) {
  const { open, onClose, onCreated, title = "플랫폼 행 새로 만들기" } = props;
  const [form, setForm] = useState<Record<string, string>>(emptyCreateForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyCreateForm());
    setActionError(null);
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const payload: Record<string, string> = {};
      PLATFORM_ROW_CREATE_FIELDS.forEach(({ key }) => {
        payload[key] = form[key] ?? "";
      });
      await apiFetch("/platform-rows/create", payload);
      onCreated();
      onClose();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          회사명 또는 플랫폼명 중 하나는 반드시 입력하세요.
        </p>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {PLATFORM_ROW_CREATE_FIELDS.map(({ key, label, required }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {label}
                {required ? " *" : ""}
              </span>
              <input
                type="text"
                value={form[key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          ))}
        </div>
        {actionError ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving ? "저장 중…" : "생성"}
          </button>
        </div>
      </div>
    </div>
  );
}
