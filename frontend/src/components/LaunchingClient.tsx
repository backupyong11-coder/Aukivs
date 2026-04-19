"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type UploadRow = Record<string, string> & { id: string; sheet_row: string | number };

/** GET /upload-rows 가 내려주는 논리 필드명(백엔드 fetch_upload_rows 조립 순서와 무관하게 key로 직접 접근) */
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
  return String(row[key] ?? "").trim();
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

export function LaunchingClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: UploadRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortKey, setSortKey] = useState<LaunchSortField>("런칭일");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const SortIcon = ({ col }: { col: LaunchSortField }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
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
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                {DISPLAY_FIELDS.map((name) => (
                  <th key={name} className={thSort} onClick={() => handleSort(name)}>
                    {name}
                    <SortIcon col={name} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={DISPLAY_FIELDS.length} className="px-3 py-8 text-center text-zinc-500">
                    항목이 없습니다
                  </td>
                </tr>
              ) : (
                sortedRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    {DISPLAY_FIELDS.map((name) => (
                      <td key={name} className="max-w-[14rem] px-2 py-1.5 align-top text-zinc-800 dark:text-zinc-200">
                        <span className="line-clamp-3 break-words">{cell(item, name) || "—"}</span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
