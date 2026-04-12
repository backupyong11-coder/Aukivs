"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type PlatformRow = Record<string, string> & { id: string; sheet_row: string };
type SortKey = "마지막업데이트날짜" | "현재단계" | "우선순위" | "회사명" | "마지막상황" | "대기사유" | "다음액션" | "비고";
type SortDir = "asc" | "desc";

const INLINE_COLS: { key: string; label: string; sortKey?: SortKey; width: string; badge?: boolean }[] = [
  { key: "마지막업데이트날짜", label: "마지막업데이트", sortKey: "마지막업데이트날짜", width: "w-32" },
  { key: "현재단계",           label: "현재단계",       sortKey: "현재단계",           width: "w-36", badge: true },
  { key: "우선순위",           label: "우선순위",       sortKey: "우선순위",           width: "w-20", badge: true },
  { key: "회사명",             label: "회사명",         sortKey: "회사명",             width: "w-24" },
  { key: "마지막상황",         label: "마지막상황",     sortKey: "마지막상황",         width: "w-48" },
  { key: "대기사유",           label: "대기사유",       sortKey: "대기사유",           width: "w-36" },
  { key: "다음액션",           label: "다음액션",       sortKey: "다음액션",           width: "w-48" },
  { key: "비고",               label: "비고",           sortKey: "비고",               width: "w-32" },
];

const STATUS_KEY_CANDIDATES = ["마지막상황", "마지막 상황", "최근상황", "최근 상황", "상황"];

function findStatusKey(item: PlatformRow): string {
  for (const k of STATUS_KEY_CANDIDATES) {
    if (k in item && item[k]) return k;
  }
  return "마지막상황";
}

const MODAL_FIELDS: { key: string; label: string }[] = [
  { key: "현재단계",   label: "현재단계" },
  { key: "마지막상황", label: "마지막상황" },
  { key: "대기사유",   label: "대기사유" },
  { key: "다음액션",   label: "다음액션" },
  { key: "우선순위",   label: "우선순위" },
  { key: "비고",       label: "비고" },
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
  const [filterText, setFilterText] = useState("");
  // 회사명 필터: 체크 해제된 회사는 숨김
  const [hiddenCompanies, setHiddenCompanies] = useState<Set<string>>(new Set());
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("마지막업데이트날짜");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [inlineEdits, setInlineEdits] = useState<Record<string, Record<string, string>>>({});
  const [inlineActive, setInlineActive] = useState<{ rowId: string; key: string } | null>(null);
  const [savingInline, setSavingInline] = useState<string | null>(null);

  const [modalItem, setModalItem] = useState<PlatformRow | null>(null);
  const [modalForm, setModalForm] = useState<Record<string, string>>({});
  const [savingModal, setSavingModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // 전체 회사명 목록
  const allCompanies = useMemo(() => {
    if (state.kind !== "ready") return [];
    return [...new Set(state.items.map(it => it["회사명"] ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  }, [state]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    // 텍스트 검색
    if (filterText) {
      items = items.filter(it =>
        INLINE_COLS.some(col => (it[col.key] ?? "").includes(filterText))
      );
    }
    // 회사명 필터 (체크 해제된 업체 숨김)
    if (hiddenCompanies.size > 0) {
      items = items.filter(it => !hiddenCompanies.has(it["회사명"] ?? ""));
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, filterText, hiddenCompanies, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleCompany = (name: string) => {
    setHiddenCompanies(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const startInline = (rowId: string, key: string, currentVal: string) => {
    setInlineActive({ rowId, key });
    setInlineEdits(prev => ({ ...prev, [rowId]: { ...(prev[rowId] ?? {}), [key]: currentVal } }));
  };

  const changeInline = (rowId: string, key: string, val: string) => {
    setInlineEdits(prev => ({ ...prev, [rowId]: { ...(prev[rowId] ?? {}), [key]: val } }));
  };

  const saveInline = async (rowId: string, key: string) => {
    setInlineActive(null);
    const val = inlineEdits[rowId]?.[key];
    if (val === undefined) return;
    if (state.kind === "ready") {
      const orig = state.items.find(it => it.id === rowId);
      if (orig && orig[key] === val) return;
    }
    setSavingInline(rowId);
    try {
      await apiFetch("/platform-rows/update", { id: rowId, [key]: val });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "저장 실패");
    } finally { setSavingInline(null); }
  };

  const openModal = (item: PlatformRow) => {
    setActionError(null);
    setModalItem(item);
    const statusKey = findStatusKey(item);
    const f: Record<string, string> = {};
    MODAL_FIELDS.forEach(({ key }) => {
      const actualKey = key === "마지막상황" ? statusKey : key;
      f[key] = item[actualKey] ?? "";
    });
    setModalForm(f);
  };

  const handleModalSave = async () => {
    if (!modalItem) return;
    setSavingModal(true); setActionError(null);
    try {
      const statusKey = findStatusKey(modalItem);
      const payload: Record<string, string> = { id: modalItem.id };
      MODAL_FIELDS.forEach(({ key }) => {
        const actualKey = key === "마지막상황" ? statusKey : key;
        payload[actualKey] = modalForm[key] ?? "";
      });
      await apiFetch("/platform-rows/update", payload);
      setModalItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSavingModal(false); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort = "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
  const thCls  = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400";

  return (
    <div className="space-y-4">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="전체 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />

        {/* 회사명 필터 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => setCompanyFilterOpen(o => !o)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              hiddenCompanies.size > 0
                ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
                : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            }`}>
            업체 필터
            {hiddenCompanies.size > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {hiddenCompanies.size}개 숨김
              </span>
            )}
            <span className="text-xs">{companyFilterOpen ? "▲" : "▼"}</span>
          </button>

          {companyFilterOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">업체 표시/숨김</span>
                <div className="flex gap-2">
                  <button onClick={() => setHiddenCompanies(new Set())}
                    className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체 보기</button>
                  <button onClick={() => setHiddenCompanies(new Set(allCompanies))}
                    className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체 숨김</button>
                </div>
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {allCompanies.map(name => (
                  <li key={name}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input type="checkbox"
                        checked={!hiddenCompanies.has(name)}
                        onChange={() => toggleCompany(name)}
                        className="accent-zinc-700" />
                      <span className="text-xs text-zinc-800 dark:text-zinc-200">{name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <button onClick={() => setCompanyFilterOpen(false)}
                  className="w-full rounded-lg bg-zinc-900 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
        </button>
        <span className="text-xs text-zinc-400">셀 클릭 인라인 편집 · 수정 버튼 전체 편집</span>
      </div>

      {actionError && !modalItem &&
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
          <table className="w-full min-w-[1000px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                {/* 수정 버튼 앞에 */}
                <th className={thCls}>수정</th>
                {INLINE_COLS.map(col => (
                  <th key={col.key}
                    className={col.sortKey ? thSort : thCls}
                    onClick={() => col.sortKey && handleSort(col.sortKey)}>
                    {col.label}
                    {col.sortKey && <SortIcon col={col.sortKey} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={INLINE_COLS.length + 2} className="px-3 py-8 text-center text-zinc-500">
                  {filterText || hiddenCompanies.size > 0 ? "조건에 맞는 항목이 없습니다" : "항목이 없습니다"}
                </td></tr>
              ) : visible.map(item => {
                const isSaving = savingInline === item.id;
                const statusKey = findStatusKey(item);

                return (
                  <tr key={item.id}
                    className={`border-b border-zinc-100 dark:border-zinc-800 ${isSaving ? "opacity-60" : "hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"}`}>

                    {/* 수정 버튼 - 맨 앞 */}
                    <td className="px-2 py-1.5">
                      <button onClick={() => openModal(item)}
                        className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                        수정
                      </button>
                    </td>

                    {INLINE_COLS.map(col => {
                      const actualKey = col.key === "마지막상황" ? statusKey : col.key;
                      const currentVal = item[actualKey] ?? "";
                      const isEditing = inlineActive?.rowId === item.id && inlineActive.key === col.key;
                      const editVal = inlineEdits[item.id]?.[col.key] ?? currentVal;

                      // 마지막업데이트날짜 읽기 전용
                      if (col.key === "마지막업데이트날짜") {
                        return (
                          <td key={col.key} className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">
                            {currentVal}
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} className={`px-1.5 py-1 ${col.width}`}>
                          {isEditing ? (
                            <input autoFocus value={editVal}
                              onChange={e => changeInline(item.id, col.key, e.target.value)}
                              onBlur={() => void saveInline(item.id, col.key)}
                              onKeyDown={e => {
                                if (e.key === "Enter") void saveInline(item.id, col.key);
                                if (e.key === "Escape") setInlineActive(null);
                              }}
                              className="w-full rounded border border-zinc-400 bg-white px-2 py-0.5 text-xs outline-none ring-1 ring-zinc-400 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100" />
                          ) : (
                            <button type="button" disabled={isSaving}
                              onClick={() => startInline(item.id, col.key, currentVal)}
                              className="w-full rounded px-1.5 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:cursor-not-allowed"
                              title="클릭해서 편집">
                              {col.badge && currentVal ? (
                                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  col.key === "현재단계"
                                    ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                                }`}>{currentVal}</span>
                              ) : (
                                <span className={`block truncate ${
                                  col.key === "회사명" ? "font-semibold text-zinc-900 dark:text-zinc-50" :
                                  col.key === "다음액션" ? "font-medium text-zinc-800 dark:text-zinc-200" :
                                  "text-zinc-600 dark:text-zinc-400"
                                } ${!currentVal ? "text-zinc-300 dark:text-zinc-600" : ""}`}>
                                  {currentVal || "—"}
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 전체 수정 모달 */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {modalItem["회사명"] ?? ""} 전체 수정
            </h3>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              마지막업데이트날짜는 저장 시 자동으로 현재 시각으로 기록됩니다.
            </p>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {MODAL_FIELDS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
                  <input type="text" value={modalForm[key] ?? ""}
                    onChange={e => setModalForm({ ...modalForm, [key]: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
                </label>
              ))}
            </div>
            {actionError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModalItem(null)} disabled={savingModal}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                취소
              </button>
              <button onClick={() => void handleModalSave()} disabled={savingModal}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                {savingModal ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
