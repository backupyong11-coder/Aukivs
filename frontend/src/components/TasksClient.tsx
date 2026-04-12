"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type TaskRow = {
  id: string;
  sheet_row: string;
  완료: string;
  마감일: string;
  관련플랫폼: string;
  분류: string;
  우선순위: string;
  업무명: string;
  난이도: string;
  피로도: string;
  상태: string;
  담당자: string;
  관련작품: string;
  메모: string;
};

type SortKey = "마감일" | "관련플랫폼" | "분류" | "우선순위" | "업무명" | "상태" | "피로도";
type SortDir = "asc" | "desc";
type TabType = "미완료" | "완료" | "전체";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: TaskRow[] };

const EMPTY_FORM: Omit<TaskRow, "id" | "sheet_row"> = {
  완료: "", 마감일: "", 관련플랫폼: "", 분류: "", 우선순위: "",
  업무명: "", 난이도: "", 피로도: "", 상태: "", 담당자: "", 관련작품: "", 메모: "",
};

const FIELD_LABELS: { key: keyof typeof EMPTY_FORM; label: string; required?: boolean }[] = [
  { key: "업무명", label: "업무명", required: true },
  { key: "마감일", label: "마감일" },
  { key: "관련플랫폼", label: "관련플랫폼" },
  { key: "분류", label: "분류" },
  { key: "우선순위", label: "우선순위" },
  { key: "난이도", label: "난이도" },
  { key: "피로도", label: "피로도" },
  { key: "상태", label: "상태" },
  { key: "담당자", label: "담당자/요청주체" },
  { key: "관련작품", label: "관련작품" },
  { key: "메모", label: "메모" },
];

function isDone(item: TaskRow) {
  return item.완료 === "TRUE" || item.완료 === "true" || item.완료 === "1";
}

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try { const j = JSON.parse(text); throw new Error((j as {detail?: string}).detail ?? text); }
    catch { throw new Error(text); }
  }
  return JSON.parse(text) as unknown;
}

export function TasksClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<TaskRow | null>(null);
  const [form, setForm] = useState<Omit<TaskRow, "id" | "sheet_row">>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState<Omit<TaskRow, "id" | "sheet_row">>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [tab, setTab] = useState<TabType>("미완료");
  const [sortKey, setSortKey] = useState<SortKey>("마감일");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = await apiFetch("/tasks");
      setState({ kind: "ready", items: items as TaskRow[] });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

  const counts = useMemo(() => {
    if (state.kind !== "ready") return { 미완료: 0, 완료: 0, 전체: 0 };
    const done = state.items.filter(isDone).length;
    return { 미완료: state.items.length - done, 완료: done, 전체: state.items.length };
  }, [state]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (tab === "미완료") items = items.filter(it => !isDone(it));
    else if (tab === "완료") items = items.filter(isDone);
    if (filterText) {
      items = items.filter(it =>
        it.업무명.includes(filterText) || it.관련플랫폼.includes(filterText) ||
        it.분류.includes(filterText) || it.메모.includes(filterText)
      );
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, tab, filterText, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const openEdit = (item: TaskRow) => {
    setActionError(null);
    setEditItem(item);
    setForm({ 완료: item.완료, 마감일: item.마감일, 관련플랫폼: item.관련플랫폼, 분류: item.분류,
              우선순위: item.우선순위, 업무명: item.업무명, 난이도: item.난이도, 피로도: item.피로도,
              상태: item.상태, 담당자: item.담당자, 관련작품: item.관련작품, 메모: item.메모 });
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/tasks/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/tasks/create", newForm);
      setCreateOpen(false);
      setNewForm(EMPTY_FORM);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "추가 실패");
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: TaskRow) => {
    if (!window.confirm(`"${item.업무명}" 을 삭제할까요?`)) return;
    try {
      await apiFetch("/tasks/delete", { id: item.id });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thCls = "whitespace-nowrap px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400";
  const thSort = thCls + " cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100";

  const Modal = ({ title, fields, setFields, onSave, onClose }: {
    title: string;
    fields: Omit<TaskRow, "id" | "sheet_row">;
    setFields: (f: Omit<TaskRow, "id" | "sheet_row">) => void;
    onSave: () => void;
    onClose: () => void;
  }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {FIELD_LABELS.map(({ key, label, required }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {label}{required ? " *" : ""}
              </span>
              <input type="text" value={fields[key]}
                onChange={e => setFields({ ...fields, [key]: e.target.value })}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
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
          placeholder="업무명·플랫폼·분류·메모 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
        <button onClick={() => { setActionError(null); setNewForm(EMPTY_FORM); setCreateOpen(true); }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          새 업무 추가
        </button>
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["미완료", "완료", "전체"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}>
            {t}
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {actionError && !editItem && !createOpen &&
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          불러오는 중…
        </div>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {state.message}
        </div>
      )}

      {state.kind === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[860px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thCls}>완료</th>
                <th className={thSort} onClick={() => handleSort("마감일")}>마감일<SortIcon col="마감일"/></th>
                <th className={thSort} onClick={() => handleSort("관련플랫폼")}>플랫폼<SortIcon col="관련플랫폼"/></th>
                <th className={thSort} onClick={() => handleSort("분류")}>분류<SortIcon col="분류"/></th>
                <th className={thSort} onClick={() => handleSort("우선순위")}>우선순위<SortIcon col="우선순위"/></th>
                <th className={thSort} onClick={() => handleSort("업무명")}>업무명<SortIcon col="업무명"/></th>
                <th className={thSort} onClick={() => handleSort("상태")}>상태<SortIcon col="상태"/></th>
                <th className={thSort} onClick={() => handleSort("피로도")}>피로도<SortIcon col="피로도"/></th>
                <th className={thCls}>메모</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                  {filterText ? "검색 결과가 없습니다" : `${tab} 업무가 없습니다`}
                </td></tr>
              ) : visible.map(item => (
                <tr key={item.id}
                  className={`border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50 ${isDone(item) ? "opacity-50" : ""}`}>
                  <td className="px-3 py-1.5 text-center text-emerald-600 dark:text-emerald-400">
                    {isDone(item) ? "✓" : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">{item.마감일}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{item.관련플랫폼}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{item.분류}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-center">{item.우선순위}</td>
                  <td className="px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-50">
                    <span className="block max-w-xs truncate">{item.업무명}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">{item.상태}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-center">{item.피로도}</td>
                  <td className="px-3 py-1.5">
                    <span className="block w-32 truncate text-zinc-400">{item.메모}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(item)}
                        className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                        수정
                      </button>
                      <button onClick={() => void handleDelete(item)}
                        className="whitespace-nowrap rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
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
        <Modal title="업무 수정" fields={form} setFields={setForm}
          onSave={() => void handleSaveEdit()} onClose={() => setEditItem(null)} />
      )}
      {createOpen && (
        <Modal title="새 업무 추가" fields={newForm} setFields={setNewForm}
          onSave={() => void handleCreate()} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}
