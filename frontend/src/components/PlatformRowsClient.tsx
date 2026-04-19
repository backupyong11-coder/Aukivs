"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type PlatformRow = Record<string, string> & { id: string; sheet_row: string };

/** 시트 열 문자(A, B, …, Z, AA, …) → 0-based 열 인덱스 (A=0) */
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

/** /platform-rows 한 행에서 id·sheet_row 제외, 시트 열 순서와 동일한 헤더 key 배열 */
function orderedHeaderKeys(row: PlatformRow): string[] {
  return Object.keys(row).filter((k) => k !== "id" && k !== "sheet_row");
}

function isTrueCell(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toUpperCase();
  return s === "TRUE" || s === "1" || s === "YES" || s === "Y" || s === "O" || s === "✓";
}

/**
 * 속성: 시트 F~I열(인덱스 5~8) 중 체크된 첫 열의 헤더명 표시
 * (일반적 헤더: 불가 / 예정 / 진행중 / 완료 — 실제 문자열은 1행 기준)
 */
function platformAttrLabel(row: PlatformRow, sample: PlatformRow): string {
  const hdrs = orderedHeaderKeys(sample);
  for (const idx of [5, 6, 7, 8]) {
    const k = hdrs[idx];
    if (k && isTrueCell(row[k])) return k;
  }
  return "";
}

function valueAtColumnLetter(row: PlatformRow, sample: PlatformRow, letter: string): string {
  const hdrs = orderedHeaderKeys(sample);
  const idx = colLettersToZeroBased(letter);
  if (idx < 0 || idx >= hdrs.length) return "";
  const k = hdrs[idx];
  return k ? String(row[k] ?? "").trim() : "";
}

/** 표시 열 순서: 시트 열 문자 기준 (속성은 계산 열) */
const PLATFORM_DISPLAY_LETTERS = [
  "C",
  "D",
  "B",
  "K",
  "L",
  "H",
  "U",
  "V",
  "W",
  "Y",
  "Z",
  "AA",
  "AH",
  "AI",
  "AL",
  "AP",
] as const;

type SortId = "attr" | (typeof PLATFORM_DISPLAY_LETTERS)[number];

async function apiFetch(path: string) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
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

export function PlatformRowsClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<SortId>("C");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const keysLoggedRef = useRef(false);

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
    if (!sample || keysLoggedRef.current) return;
    keysLoggedRef.current = true;
    const hdrs = orderedHeaderKeys(sample);
    const apIdx = colLettersToZeroBased("AP");
    const apKey = apIdx >= 0 && apIdx < hdrs.length ? hdrs[apIdx] : "(열 없음)";
    console.log("[platform-rows] header keys (sheet order) =", hdrs);
    console.log("[platform-rows] AP column index", apIdx, "→ key =", apKey);
  }, [sample]);

  const sorted = useMemo(() => {
    if (state.kind !== "ready" || !sample) return [];
    let items = state.items;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      items = items.filter((it) => {
        const parts: string[] = [];
        for (const L of PLATFORM_DISPLAY_LETTERS) {
          parts.push(valueAtColumnLetter(it, sample, L));
        }
        parts.push(platformAttrLabel(it, sample));
        return parts.some((p) => p.toLowerCase().includes(q));
      });
    }
    return [...items].sort((a, b) => {
      let va = "";
      let vb = "";
      if (sortKey === "attr") {
        va = platformAttrLabel(a, sample);
        vb = platformAttrLabel(b, sample);
      } else {
        va = valueAtColumnLetter(a, sample, sortKey);
        vb = valueAtColumnLetter(b, sample, sortKey);
      }
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, sample, filterText, sortKey, sortDir]);

  const handleSort = (key: SortId) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortId }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";

  const headerLabelForLetter = (letter: string): string => {
    if (!sample) return letter;
    const hdrs = orderedHeaderKeys(sample);
    const idx = colLettersToZeroBased(letter);
    const name = idx >= 0 && idx < hdrs.length ? hdrs[idx] : "";
    return name ? `${name} (${letter})` : `${letter}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="표시 열·속성 검색"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
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

      {state.kind === "ready" && sample && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[1200px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thSort} onClick={() => handleSort("C")}>
                  {headerLabelForLetter("C")}
                  <SortIcon col="C" />
                </th>
                <th className={thSort} onClick={() => handleSort("D")}>
                  {headerLabelForLetter("D")}
                  <SortIcon col="D" />
                </th>
                <th className={thSort} onClick={() => handleSort("attr")}>
                  속성
                  <SortIcon col="attr" />
                </th>
                <th className={thSort} onClick={() => handleSort("B")}>
                  {headerLabelForLetter("B")}
                  <SortIcon col="B" />
                </th>
                <th className={thSort} onClick={() => handleSort("K")}>
                  {headerLabelForLetter("K")}
                  <SortIcon col="K" />
                </th>
                <th className={thSort} onClick={() => handleSort("L")}>
                  {headerLabelForLetter("L")}
                  <SortIcon col="L" />
                </th>
                <th className={thSort} onClick={() => handleSort("H")}>
                  {headerLabelForLetter("H")}
                  <SortIcon col="H" />
                </th>
                <th className={thSort} onClick={() => handleSort("U")}>
                  {headerLabelForLetter("U")}
                  <SortIcon col="U" />
                </th>
                <th className={thSort} onClick={() => handleSort("V")}>
                  {headerLabelForLetter("V")}
                  <SortIcon col="V" />
                </th>
                <th className={thSort} onClick={() => handleSort("W")}>
                  {headerLabelForLetter("W")}
                  <SortIcon col="W" />
                </th>
                <th className={thSort} onClick={() => handleSort("Y")}>
                  {headerLabelForLetter("Y")}
                  <SortIcon col="Y" />
                </th>
                <th className={thSort} onClick={() => handleSort("Z")}>
                  {headerLabelForLetter("Z")}
                  <SortIcon col="Z" />
                </th>
                <th className={thSort} onClick={() => handleSort("AA")}>
                  {headerLabelForLetter("AA")}
                  <SortIcon col="AA" />
                </th>
                <th className={thSort} onClick={() => handleSort("AH")}>
                  {headerLabelForLetter("AH")}
                  <SortIcon col="AH" />
                </th>
                <th className={thSort} onClick={() => handleSort("AI")}>
                  {headerLabelForLetter("AI")}
                  <SortIcon col="AI" />
                </th>
                <th className={thSort} onClick={() => handleSort("AL")}>
                  {headerLabelForLetter("AL")}
                  <SortIcon col="AL" />
                </th>
                <th className={thSort} onClick={() => handleSort("AP")}>
                  {headerLabelForLetter("AP")}
                  <SortIcon col="AP" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-3 py-8 text-center text-zinc-500">
                    {filterText ? "조건에 맞는 항목이 없습니다" : "항목이 없습니다"}
                  </td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const attr = platformAttrLabel(item, sample);
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                    >
                      {PLATFORM_DISPLAY_LETTERS.slice(0, 2).map((letter) => (
                        <td key={letter} className="max-w-[14rem] px-2 py-1.5 align-top">
                          <span className="line-clamp-3 break-words text-zinc-800 dark:text-zinc-200">
                            {valueAtColumnLetter(item, sample, letter) || "—"}
                          </span>
                        </td>
                      ))}
                      <td className="max-w-[8rem] whitespace-nowrap px-2 py-1.5 align-top text-zinc-700 dark:text-zinc-300">
                        {attr || "—"}
                      </td>
                      {PLATFORM_DISPLAY_LETTERS.slice(2).map((letter) => (
                        <td key={letter} className="max-w-[12rem] px-2 py-1.5 align-top">
                          <span className="line-clamp-3 break-words text-zinc-800 dark:text-zinc-200">
                            {valueAtColumnLetter(item, sample, letter) || "—"}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {state.kind === "ready" && !sample && (
        <p className="text-sm text-zinc-500">표시할 플랫폼 행이 없습니다.</p>
      )}
    </div>
  );
}
