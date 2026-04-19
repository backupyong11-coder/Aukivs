"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";
import {
  EDIT_FIELDS,
  UploadRowFormModal,
  type FormType,
  type UploadRow,
} from "@/components/UploadRowsClient";

/** 런칭정리 표시 열 */
const DISPLAY_FIELDS = [
  "런칭일",
  "플랫폼명",
  "작품명",
  "업로드화수",
  "남은업로드화수",
  "업로드완료여부",
] as const;
type LaunchSortField = (typeof DISPLAY_FIELDS)[number];

function cell(row: UploadRow, key: string): string {
  return String((row as Record<string, string>)[key] ?? "").trim();
}

function cmpLocaleKoEmptyLast(a: string, b: string, dir: "asc" | "desc"): number {
  const ea = !String(a ?? "").trim();
  const eb = !String(b ?? "").trim();
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  const c = String(a).trim().localeCompare(String(b).trim(), "ko");
  return dir === "asc" ? c : -c;
}

async function apiFetch(path: string) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
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

async function apiPost(path: string, body: object) {
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
}

export function LaunchingClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: UploadRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortKey, setSortKey] = useState<LaunchSortField>("런칭일");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editItem, setEditItem] = useState<UploadRow | null>(null);
  const [form, setForm] = useState<FormType>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = (await apiFetch("/upload-rows")) as UploadRow[] | null;
      setState({ kind: "ready", items: Array.isArray(items) ? items : [] });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [refreshKey, load]);

  const rows = useMemo(() => {
    if (state.kind !== "ready") return [];
    return state.items.filter((row) =>
      DISPLAY_FIELDS.some((k) => cell(row, k) !== ""),
    );
  }, [state]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        cmpLocaleKoEmptyLast(cell(a, sortKey), cell(b, sortKey), sortDir),
      ),
    [rows, sortKey, sortDir],
  );

  const handleSort = (key: LaunchSortField) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openEdit = (item: UploadRow) => {
    setActionError(null);
    setEditItem(item);
    const f: FormType = {};
    EDIT_FIELDS.forEach(({ key }) => {
      f[key] = item[key] ?? "";
    });
    setForm(f);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    setActionError(null);
    try {
      await apiPost("/upload-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: UploadRow) => {
    if (!window.confirm(`"${item.작품명}" (${item.플랫폼명}) 행을 삭제할까요?`)) return;
    try {
      await apiPost("/upload-rows/delete", { id: item.id });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const SortIcon = ({ col }: { col: LaunchSortField }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
  const thAction =
    "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400";
  const showTable = state.kind === "ready" && state.items.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300"
        >
          새로고침
        </button>
      </div>

      {actionError && !editItem && (
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

      {state.kind === "ready" && state.items.length === 0 && (
        <p className="text-sm text-zinc-500">표시할 행이 없습니다.</p>
      )}

      {showTable && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
                {DISPLAY_FIELDS.map((name) => (
                  <th key={name} className={thSort} onClick={() => handleSort(name)}>
                    {name}
                    <SortIcon col={name} />
                  </th>
                ))}
                <th className={thAction}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={DISPLAY_FIELDS.length + 2} className="px-3 py-8 text-center text-zinc-500">
                    항목이 없습니다
                  </td>
                </tr>
              ) : (
                sortedRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        수정
                      </button>
                    </td>
                    {DISPLAY_FIELDS.map((name) => (
                      <td key={name} className="max-w-[14rem] px-2 py-1.5 align-top text-zinc-800 dark:text-zinc-200">
                        <span className="line-clamp-3 break-words">{cell(item, name) || "—"}</span>
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <UploadRowFormModal
          title={`수정: ${editItem.작품명}`}
          fields={form}
          setFields={setForm}
          onSave={() => void handleSaveEdit()}
          onClose={() => setEditItem(null)}
          saving={saving}
          actionError={actionError}
        />
      )}
    </div>
  );
}
