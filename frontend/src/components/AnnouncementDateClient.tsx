"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";
import { PlatformRowEditModal, type PlatformRow } from "@/components/PlatformRowEditModal";

function colLettersToZeroBased(letters: string): number {
  const s = letters.toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 64;
    if (c < 1 || c > 26) return -1;
    n = n * 26 + c;
  }
  return n - 1;
}

function orderedHeaderKeys(row: PlatformRow): string[] {
  return Object.keys(row).filter((k) => k !== "id" && k !== "sheet_row");
}

function headerKeyAtLetter(sample: PlatformRow, letter: string): string {
  const hdrs = orderedHeaderKeys(sample);
  const idx = colLettersToZeroBased(letter);
  if (idx < 0 || idx >= hdrs.length) return "";
  return hdrs[idx] ?? "";
}

function cell(row: PlatformRow, key: string): string {
  return key ? String(row[key] ?? "").trim() : "";
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

/** 플랫폼정리 시트 열 문자 순서(원문): D → C → B → M → N → O */
const DISPLAY_LETTERS = ["D", "C", "B", "M", "N", "O"] as const;
type AnnounceSortCol = (typeof DISPLAY_LETTERS)[number];

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

export function AnnouncementDateClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortKey, setSortKey] = useState<AnnounceSortCol>("D");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editItem, setEditItem] = useState<PlatformRow | null>(null);
  const loggedRef = useRef(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = (await apiFetch("/platform-rows")) as PlatformRow[] | null;
      setState({ kind: "ready", items: Array.isArray(items) ? items : [] });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [refreshKey, load]);

  const sample = state.kind === "ready" && state.items.length > 0 ? state.items[0] : null;

  useEffect(() => {
    if (!sample || loggedRef.current) return;
    loggedRef.current = true;
    const map = Object.fromEntries(
      DISPLAY_LETTERS.map((L) => [L, headerKeyAtLetter(sample, L)]),
    );
    console.log("[announcement-page] 열 문자 → 필드 key (첫 행 기준)", map);
  }, [sample]);

  const columnMeta = useMemo(() => {
    if (!sample) return [];
    return DISPLAY_LETTERS.map((letter) => {
      const key = headerKeyAtLetter(sample, letter);
      return { letter, key, label: key || letter };
    });
  }, [sample]);

  const rows = useMemo(() => {
    if (state.kind !== "ready" || !sample || columnMeta.length === 0) return [];
    return state.items.filter((row) => columnMeta.some(({ key }) => cell(row, key)));
  }, [state, sample, columnMeta]);

  const sortedRows = useMemo(() => {
    const meta = columnMeta.find((m) => m.letter === sortKey);
    const sk = meta?.key ?? "";
    return [...rows].sort((a, b) =>
      cmpLocaleKoEmptyLast(sk ? cell(a, sk) : "", sk ? cell(b, sk) : "", sortDir),
    );
  }, [rows, columnMeta, sortKey, sortDir]);

  const handleSort = (key: AnnounceSortCol) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: AnnounceSortCol }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
  const thAction =
    "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400";

  const handleDelete = async (row: PlatformRow) => {
    const name = String(row["회사명"] ?? "").trim() || row.id;
    if (!window.confirm(`이 행을 삭제할까요? (${name})`)) return;
    try {
      await apiPost("/platform-rows/delete", { id: row.id });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

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

      {state.kind === "ready" && !sample && (
        <p className="text-sm text-zinc-500">표시할 행이 없습니다.</p>
      )}

      {state.kind === "ready" && sample && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[800px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
                {columnMeta.map(({ letter, label }) => (
                  <th key={letter} className={thSort} onClick={() => handleSort(letter)}>
                    {label}
                    <SortIcon col={letter} />
                  </th>
                ))}
                <th className={thAction}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={(columnMeta.length || 6) + 2} className="px-3 py-8 text-center text-zinc-500">
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
                        onClick={() => setEditItem(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        수정
                      </button>
                    </td>
                    {columnMeta.map(({ letter, key }) => (
                      <td key={letter} className="max-w-[14rem] px-2 py-1.5 align-top text-zinc-800 dark:text-zinc-200">
                        <span className="line-clamp-3 break-words">{cell(item, key) || "—"}</span>
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

      <PlatformRowEditModal
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
