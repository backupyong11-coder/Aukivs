"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type PlatformRow = Record<string, string> & { id: string; sheet_row: string | number };

/** 시트 열 문자 → 0-based 인덱스 (플랫폼정리: B=회사명, C=발표일, K=계약, R=플랫폼명, S=우선순위) */
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

/** 응답에 선호 키가 있으면 그걸 쓰고, 없으면 열 문자에 해당하는 1행 헤더 key */
function fieldKey(sample: PlatformRow, preferred: string, letter: string): string {
  if (preferred in sample) return preferred;
  return headerKeyAtLetter(sample, letter);
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

const CONTRACT_TABS = ["계약완료", "계약진행중", "계약미정", "계약불가", "추후접촉"] as const;
type ContractTab = (typeof CONTRACT_TABS)[number];

/** 표시 열 순서: 계약 → 발표일 → 회사명 → 플랫폼명 (헤더는 응답 key) */
const DISPLAY_LETTERS: ("K" | "C" | "B" | "R")[] = ["K", "C", "B", "R"];
type ContractSortCol = (typeof DISPLAY_LETTERS)[number];

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

export function ContractsClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<ContractTab>(CONTRACT_TABS[0]);
  const [sortKey, setSortKey] = useState<ContractSortCol>("K");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const keys = useMemo(() => {
    if (!sample) return { contract: "", date: "", company: "", platform: "" };
    return {
      contract: fieldKey(sample, "계약", "K"),
      date: fieldKey(sample, "발표일", "C"),
      company: fieldKey(sample, "회사명", "B"),
      platform: fieldKey(sample, "플랫폼명", "R"),
    };
  }, [sample]);

  const filtered = useMemo(() => {
    if (state.kind !== "ready" || !sample || !keys.contract) return [];
    const ck = keys.contract;
    return state.items.filter((row) => cell(row, ck) === activeTab);
  }, [state, sample, activeTab, keys]);

  const columnMeta = useMemo(() => {
    if (!sample) return [];
    return DISPLAY_LETTERS.map((letter) => {
      const key =
        letter === "K"
          ? keys.contract
          : letter === "C"
            ? keys.date
            : letter === "B"
              ? keys.company
              : keys.platform;
      const label = key || letter;
      return { letter, key, label };
    });
  }, [sample, keys]);

  const sortedFiltered = useMemo(() => {
    const meta = columnMeta.find((m) => m.letter === sortKey);
    const sk = meta?.key ?? "";
    return [...filtered].sort((a, b) =>
      cmpLocaleKoEmptyLast(sk ? cell(a, sk) : "", sk ? cell(b, sk) : "", sortDir),
    );
  }, [filtered, columnMeta, sortKey, sortDir]);

  const handleSort = (key: ContractSortCol) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: ContractSortCol }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";

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

      <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-px dark:border-zinc-700">
        {CONTRACT_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? "rounded-t-md border border-b-0 border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
                : "rounded-t-md border border-transparent px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }
          >
            {tab}
          </button>
        ))}
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
        <p className="text-sm text-zinc-500">표시할 플랫폼 행이 없습니다.</p>
      )}

      {state.kind === "ready" && sample && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                {columnMeta.map(({ letter, label }) => (
                  <th
                    key={letter}
                    className={thSort}
                    onClick={() => handleSort(letter)}
                  >
                    {label}
                    <SortIcon col={letter} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={columnMeta.length || 4} className="px-3 py-8 text-center text-zinc-500">
                    해당 상태의 항목이 없습니다
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    {columnMeta.map(({ letter, key }) => (
                      <td key={letter} className="max-w-[20rem] px-3 py-2 align-top text-zinc-800 dark:text-zinc-200">
                        <span className="line-clamp-3 break-words">{cell(item, key) || "—"}</span>
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
