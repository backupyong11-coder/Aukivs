"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type PlatformRow = Record<string, string> & { id: string; sheet_row: string };
type SortKey = "마지막업데이트날짜" | "현재단계" | "우선순위" | "회사명" | "마지막상황" | "대기사유" | "다음액션" | "비고";
type SortDir = "asc" | "desc";

const COLS: { key: SortKey; label: string }[] = [
  { key: "마지막업데이트날짜", label: "마지막업데이트" },
  { key: "현재단계", label: "현재단계" },
  { key: "우선순위", label: "우선순위" },
  { key: "회사명", label: "회사명" },
  { key: "마지막상황", label: "마지막상황" },
  { key: "대기사유", label: "대기사유" },
  { key: "다음액션", label: "다음액션" },
  { key: "비고", label: "비고" },
];

const EDIT_FIELDS: { key: string; label: string }[] = [
  { key: "현재단계", label: "현재단계" },
  { key: "마지막상황", label: "마지막상황" },
  { key: "대기사유", label: "대기사유" },
  { key: "다음액션", label: "다음액션" },
  { key: "우선순위", label: "우선순위" },
  { key: "비고", label: "비고" },
];

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try { const j = JSON.parse(text) as { detail?: string }; throw new Error(j.detail ?? text); }
    catch { throw new Error(text); }
  }
  return JSON.parse(text) as unknown;
}

export function PlatformRowsClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<PlatformRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("마지막업데이트날짜");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = await apiFetch("/platform-rows");
      setState({ kind: "ready", items: items as PlatformRow[] });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (filterText) {
      items = items.filter(it =>
        (it["회사명"] ?? "").includes(filterText) ||
        (it["현재단계"] ?? "").includes(filterText) ||
        (it["플랫폼명"] ?? "").includes(filterText) ||
        (it["다음액션"] ?? "").includes(filterText) ||
        (it["마지막상황"] ?? "").includes(filterText)
      );
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, filterText, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const openEdit = (item: PlatformRow) => {
    setActionError(null);
    setEditItem(item);
    const f: Record<string, string> = {};
    EDIT_FIELDS.forEach(({ key }) => { f[key] = item[key] ?? ""; });
    setForm(f);
  };

  const handleSave = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/platform-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort = "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
  const thCls = "whitespace-nowrap px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="회사명·단계·상황·다음액션 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
        </button>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">수정 시 마지막업데이트날짜 자동 기록</span>
      </div>

      {actionError && !editItem &&
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
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                {COLS.map(col => (
                  <th key={col.key} className={thSort} onClick={() => handleSort(col.key)}>
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                  {filterText ? "검색 결과가 없습니다" : "항목이 없습니다"}
                </td></tr>
              ) : visible.map(item => (
                <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50">
                  {/* 마지막업데이트날짜 */}
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">
                    {item["마지막업데이트날짜"] ?? ""}
                  </td>
                  {/* 현재단계 */}
                  <td className="px-3 py-1.5">
                    {item["현재단계"] ? (
                      <span className="whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                        {item["현재단계"]}
                      </span>
                    ) : null}
                  </td>
                  {/* 우선순위 */}
                  <td className="px-3 py-1.5">
                    {item["우선순위"] ? (
                      <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                        {item["우선순위"]}
                      </span>
                    ) : null}
                  </td>
                  {/* 회사명 */}
                  <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-zinc-900 dark:text-zinc-50">
                    {item["회사명"] ?? ""}
                  </td>
                  {/* 마지막상황 */}
                  <td className="px-3 py-1.5">
                    <span className="block max-w-[180px] truncate">{item["마지막상황"] ?? ""}</span>
                  </td>
                  {/* 대기사유 */}
                  <td className="px-3 py-1.5">
                    <span className="block max-w-[140px] truncate text-zinc-500">{item["대기사유"] ?? ""}</span>
                  </td>
                  {/* 다음액션 */}
                  <td className="px-3 py-1.5">
                    <span className="block max-w-[180px] truncate font-medium text-zinc-800 dark:text-zinc-200">{item["다음액션"] ?? ""}</span>
                  </td>
                  {/* 비고 */}
                  <td className="px-3 py-1.5">
                    <span className="block w-28 truncate text-zinc-400">{item["비고"] ?? ""}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => openEdit(item)}
                      className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {editItem["회사명"] ?? ""} 수정
            </h3>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              마지막업데이트날짜는 저장 시 자동으로 현재 시각으로 기록됩니다.
            </p>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {EDIT_FIELDS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
                  <input type="text" value={form[key] ?? ""}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
                </label>
              ))}
            </div>
            {actionError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditItem(null)} disabled={saving}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                취소
              </button>
              <button onClick={() => void handleSave()} disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
