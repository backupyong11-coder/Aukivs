"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

export type PlatformRow = Record<string, string> & { id: string; sheet_row: string | number };

const MODAL_FIELDS: { key: string; label: string }[] = [
  { key: "분류", label: "분류 (B)" },
  { key: "현재단계", label: "현재단계 (L)" },
  { key: "마지막상황", label: "마지막 상황 (N)" },
  { key: "대기사유", label: "대기사유 (O)" },
  { key: "다음액션", label: "다음액션 (P)" },
  { key: "우선순위", label: "우선순위 (R)" },
  { key: "비고", label: "비고 (AO)" },
];

const STATUS_KEY_CANDIDATES = ["마지막상황", "마지막 상황", "최근상황", "최근 상황", "상황"];
function findStatusKey(item: PlatformRow): string {
  for (const k of STATUS_KEY_CANDIDATES) {
    if (k in item && item[k]) return k;
  }
  return "마지막상황";
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

type Props = {
  item: PlatformRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PlatformRowEditModal({ item, onClose, onSaved }: Props) {
  const [modalForm, setModalForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) {
      setModalForm({});
      setActionError(null);
      return;
    }
    const statusKey = findStatusKey(item);
    const f: Record<string, string> = {};
    MODAL_FIELDS.forEach(({ key }) => {
      f[key] = item[key === "마지막상황" ? statusKey : key] ?? "";
    });
    setModalForm(f);
    setActionError(null);
  }, [item]);

  if (!item) return null;

  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    try {
      const statusKey = findStatusKey(item);
      const payload: Record<string, string> = { id: item.id };
      MODAL_FIELDS.forEach(({ key }) => {
        payload[key === "마지막상황" ? statusKey : key] = modalForm[key] ?? "";
      });
      await apiFetch("/platform-rows/update", payload);
      onSaved();
      onClose();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {item["회사명"] ?? ""} · 핵심 필드 수정
        </h3>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          저장 시 마지막업데이트날짜(M열)가 자동으로 갱신됩니다.
        </p>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {MODAL_FIELDS.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
              <input
                type="text"
                value={modalForm[key] ?? ""}
                onChange={(e) => setModalForm({ ...modalForm, [key]: e.target.value })}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          ))}
        </div>
        {actionError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>}
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
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
