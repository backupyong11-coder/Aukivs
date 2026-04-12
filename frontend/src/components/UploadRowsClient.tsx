"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type UploadRow = {
  id: string;
  sheet_row: number;
  완료: string;
  업로드일: string;
  플랫폼명: string;
  작품명: string;
  업로드완료여부: string;
  업로드주기: string;
  업로드요일: string;
  업로드방식: string;
  런칭일: string;
  마지막업로드일: string;
  다음업로드일: string;
  다음업로드회수: string;
  원고준비: string;
  업로드링크: string;
  마지막업로드회수: string;
  비고: string;
};

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: UploadRow[] };

// 수정 폼에 포함할 필드
const EDIT_FIELDS: { key: keyof UploadRow; label: string; required?: boolean }[] = [
  { key: "작품명", label: "작품명", required: true },
  { key: "업로드일", label: "업로드일" },
  { key: "플랫폼명", label: "플랫폼명" },
  { key: "업로드완료여부", label: "업로드완료여부" },
  { key: "업로드방식", label: "업로드방식" },
  { key: "업로드주기", label: "업로드주기" },
  { key: "업로드요일", label: "업로드요일" },
  { key: "런칭일", label: "런칭일" },
  { key: "마지막업로드일", label: "마지막업로드일" },
  { key: "다음업로드일", label: "다음업로드일" },
  { key: "다음업로드회수", label: "다음업로드회수" },
  { key: "원고준비", label: "원고준비" },
  { key: "업로드링크", label: "업로드링크/제출처" },
  { key: "마지막업로드회수", label: "마지막업로드회수" },
  { key: "비고", label: "비고" },
];

const EMPTY_FORM: Partial<Record<keyof UploadRow, string>> = {};

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try { const j = JSON.parse(text); throw new Error(j.detail ?? text); }
    catch { throw new Error(text); }
  }
  return JSON.parse(text);
}

export function UploadRowsClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<UploadRow | null>(null);
  const [form, setForm] = useState<Partial<Record<keyof UploadRow, string>>>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Record<keyof UploadRow, string>>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = await apiFetch("/upload-rows");
      setState({ kind: "ready", items });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

  const visible = state.kind === "ready"
    ? state.items.filter(it =>
        !filterText || it.작품명.includes(filterText) || it.플랫폼명.includes(filterText)
      )
    : [];

  const openEdit = (item: UploadRow) => {
    setActionError(null);
    setEditItem(item);
    const f: Partial<Record<keyof UploadRow, string>> = {};
    EDIT_FIELDS.forEach(({ key }) => { f[key] = item[key] ?? ""; });
    setForm(f);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/upload-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/upload-rows/create", newForm);
      setCreateOpen(false);
      setNewForm(EMPTY_FORM);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "추가 실패");
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: UploadRow) => {
    if (!window.confirm(`"${item.작품명}" (${item.플랫폼명}) 행을 삭제할까요?`)) return;
    try {
      await apiFetch("/upload-rows/delete", { id: item.id });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const Modal = ({ title, fields, setFields, onSave, onClose }: {
    title: string;
    fields: Partial<Record<keyof UploadRow, string>>;
    setFields: (f: Partial<Record<keyof UploadRow, string>>) => void;
    onSave: () => void;
    onClose: () => void;
  }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {EDIT_FIELDS.map(({ key, label, required }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {label}{required ? " *" : ""}
              </span>
              <input type="text" value={fields[key] ?? ""}
                onChange={e => setFields({ ...fields, [key]: e.target.value })}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          ))}
        </div>
        {actionError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
            취소
          </button>
          <button onClick={onSave} disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="작품명·플랫폼명 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
        <button onClick={() => { setActionError(null); setNewForm(EMPTY_FORM); setCreateOpen(true); }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          새 업로드 추가
        </button>
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
        </button>
      </div>

      {actionError && !editItem && !createOpen &&
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />불러오는 중…
        </div>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {state.message}
        </div>
      )}

      {state.kind === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[800px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                {["완료","업로드일","플랫폼명","작품명","업로드완료여부","업로드방식","다음업로드일","비고",""].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">항목이 없습니다</td></tr>
              ) : visible.map(item => (
                <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-2">{item.완료 === "TRUE" ? "✓" : ""}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{item.업로드일}</td>
                  <td className="px-3 py-2 font-medium">{item.플랫폼명}</td>
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">{item.작품명}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      item.업로드완료여부 === "업로드 완료"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                    }`}>{item.업로드완료여부 || "업로드 예정"}</span>
                  </td>
                  <td className="px-3 py-2">{item.업로드방식}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{item.다음업로드일}</td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-zinc-500">{item.비고}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                        수정
                      </button>
                      <button onClick={() => void handleDelete(item)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <Modal title={`수정: ${editItem.작품명}`} fields={form} setFields={setForm}
          onSave={() => void handleSaveEdit()} onClose={() => setEditItem(null)} />
      )}
      {createOpen && (
        <Modal title="새 업로드 추가" fields={newForm} setFields={setNewForm}
          onSave={() => void handleCreate()} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}
