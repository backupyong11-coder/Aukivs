"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type PlatformRow = Record<string, string> & { id: string; sheet_row: string };

type SortKey = "발표일" | "플랫폼명";
type SortDir = "asc" | "desc";

/** 시트 C열·Q열 (백엔드 google_platform_rows_sheets.py 주석과 동일) */
const TABLE_COLS: { key: string; label: string; sortKey: SortKey; width: string }[] = [
  { key: "발표일", label: "발표일 (C)", sortKey: "발표일", width: "w-40" },
  { key: "플랫폼명", label: "플랫폼명 (Q)", sortKey: "플랫폼명", width: "min-w-[14rem]" },
];

const STATUS_KEY_CANDIDATES = ["마지막상황", "마지막 상황", "최근상황", "최근 상황", "상황"];
function findStatusKey(item: PlatformRow): string {
  for (const k of STATUS_KEY_CANDIDATES) {
    if (k in item && item[k]) return k;
  }
  return "마지막상황";
}

const MODAL_FIELDS: { key: string; label: string }[] = [
  { key: "분류", label: "분류 (B)" },
  { key: "현재단계", label: "현재단계 (L)" },
  { key: "마지막상황", label: "마지막 상황 (N)" },
  { key: "대기사유", label: "대기사유 (O)" },
  { key: "다음액션", label: "다음액션 (P)" },
  { key: "우선순위", label: "우선순위 (R)" },
  { key: "비고", label: "비고 (AO)" },
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

export function PlatformRowsClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("발표일");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [inlineActive, setInlineActive] = useState<{ rowId: string; key: string } | null>(null);
  const [inlineEdits, setInlineEdits] = useState<Record<string, Record<string, string>>>({});
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

  useEffect(() => {
    void load();
  }, [refreshKey, load]);

  const sorted = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (filterText) {
      items = items.filter(
        it =>
          (it["발표일"] ?? "").includes(filterText) ||
          (it["플랫폼명"] ?? "").includes(filterText) ||
          (it["회사명"] ?? "").includes(filterText) ||
          (it["분류"] ?? "").includes(filterText),
      );
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, filterText, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
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
    } finally {
      setSavingInline(null);
    }
  };

  const openModal = (item: PlatformRow) => {
    setActionError(null);
    setModalItem(item);
    const statusKey = findStatusKey(item);
    const f: Record<string, string> = {};
    MODAL_FIELDS.forEach(({ key }) => {
      f[key] = item[key === "마지막상황" ? statusKey : key] ?? "";
    });
    setModalForm(f);
  };

  const handleModalSave = async () => {
    if (!modalItem) return;
    setSavingModal(true);
    setActionError(null);
    try {
      const statusKey = findStatusKey(modalItem);
      const payload: Record<string, string> = { id: modalItem.id };
      MODAL_FIELDS.forEach(({ key }) => {
        payload[key === "마지막상황" ? statusKey : key] = modalForm[key] ?? "";
      });
      await apiFetch("/platform-rows/update", payload);
      setModalItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSavingModal(false);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
  const thCls =
    "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="발표일·플랫폼명·회사명·분류 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300"
        >
          새로고침
        </button>
        <span className="text-xs text-zinc-400">C열·Q열 셀 클릭으로 바로 수정 · 수정 버튼으로 나머지 항목</span>
      </div>

      {actionError && !modalItem && (
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
      )}

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
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thCls}>수정</th>
                {TABLE_COLS.map(col => (
                  <th
                    key={col.key}
                    className={thSort}
                    onClick={() => handleSort(col.sortKey)}
                  >
                    {col.label}
                    <SortIcon col={col.sortKey} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS.length + 1} className="px-3 py-8 text-center text-zinc-500">
                    {filterText ? "조건에 맞는 항목이 없습니다" : "항목이 없습니다"}
                  </td>
                </tr>
              ) : (
                sorted.map(item => {
                  const isSaving = savingInline === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-zinc-100 dark:border-zinc-800 ${
                        isSaving ? "opacity-60" : "hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                      }`}
                    >
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => openModal(item)}
                          className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                        >
                          수정
                        </button>
                      </td>
                      {TABLE_COLS.map(col => {
                        const currentVal = item[col.key] ?? "";
                        const isEditing =
                          inlineActive?.rowId === item.id && inlineActive.key === col.key;
                        const editVal = inlineEdits[item.id]?.[col.key] ?? currentVal;
                        return (
                          <td key={col.key} className={`min-w-0 px-2 py-1.5 ${col.width}`}>
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editVal}
                                onChange={e => changeInline(item.id, col.key, e.target.value)}
                                onBlur={() => void saveInline(item.id, col.key)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") void saveInline(item.id, col.key);
                                  if (e.key === "Escape") setInlineActive(null);
                                }}
                                className="w-full rounded border border-zinc-400 bg-white px-2 py-1 text-xs outline-none ring-1 ring-zinc-400 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            ) : (
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => startInline(item.id, col.key, currentVal)}
                                className="block w-full max-w-full rounded px-1.5 py-0.5 text-left text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 disabled:cursor-not-allowed"
                                title={currentVal || undefined}
                              >
                                <span
                                  className={`block truncate ${!currentVal ? "text-zinc-300 dark:text-zinc-600" : ""}`}
                                >
                                  {currentVal || "—"}
                                </span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

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
                  <input
                    type="text"
                    value={modalForm[key] ?? ""}
                    onChange={e => setModalForm({ ...modalForm, [key]: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              ))}
            </div>
            {actionError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalItem(null)}
                disabled={savingModal}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleModalSave()}
                disabled={savingModal}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingModal ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
