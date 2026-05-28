"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchTasks, type TaskSheetRow } from "@/lib/tasks";
import {
  addRangeTab,
  loadWeeklyAgendaRangesWorkbook,
  patchActiveRange,
  saveWeeklyAgendaRangesWorkbook,
  type WeeklyAgendaRangeWorkbook,
} from "@/lib/weeklyAgendaRangeStorage";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: TaskSheetRow[] };

function ymdInRange(ymd: string, from: string, to: string): boolean {
  const a = (from || "").trim();
  const b = (to || "").trim();
  const x = (ymd || "").trim();
  if (!x) return false;
  if (a && x < a) return false;
  if (b && x > b) return false;
  return true;
}

function groupByCategory(items: TaskSheetRow[]): Map<string, TaskSheetRow[]> {
  const m = new Map<string, TaskSheetRow[]>();
  for (const it of items) {
    const cat = (it["분류"] ?? "").trim() || "미분류";
    const list = m.get(cat) ?? [];
    list.push(it);
    m.set(cat, list);
  }
  for (const [, list] of m) {
    list.sort((a, b) => (a["실행일"] ?? "").localeCompare(b["실행일"] ?? "") || (a["업무명"] ?? "").localeCompare(b["업무명"] ?? "", "ko"));
  }
  return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b, "ko")));
}

export function WeeklyAgendaTasksClient() {
  const [wb, setWb] = useState<WeeklyAgendaRangeWorkbook>(() => loadWeeklyAgendaRangesWorkbook());
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    saveWeeklyAgendaRangesWorkbook(wb);
  }, [wb]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoad({ kind: "loading" });
      const r = await fetchTasks();
      if (cancelled) return;
      if (!r.ok) {
        setLoad({ kind: "error", message: r.message });
        return;
      }
      setLoad({ kind: "ready", items: r.items });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs = useMemo(() => [...wb.tabs].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ko")), [wb.tabs]);
  const active = useMemo(() => wb.tabs.find((t) => t.id === wb.activeId) ?? tabs[0] ?? null, [tabs, wb.activeId, wb.tabs]);

  const filtered = useMemo(() => {
    if (load.kind !== "ready" || !active) return [];
    return load.items.filter((t) => ymdInRange((t["실행일"] ?? "").trim(), active.from, active.to));
  }, [load, active]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  const thCls =
    "border border-zinc-400 bg-zinc-200 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50";
  const tdCls =
    "align-top border border-zinc-400 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">주간 아젠다</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            업무정리 DB의 <strong className="font-medium text-zinc-700 dark:text-zinc-300">실행일</strong>이 선택한 기간에 포함되는 업무만 표시합니다.
          </p>
        </div>
        <Link href="/tasks" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
          업무정리 DB →
        </Link>
      </div>

      {active ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              시작
              <input
                type="date"
                value={active.from}
                onChange={(e) => setWb((prev) => patchActiveRange(prev, { from: e.target.value }))}
                className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              종료
              <input
                type="date"
                value={active.to}
                onChange={(e) => setWb((prev) => patchActiveRange(prev, { to: e.target.value }))}
                className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const n = window.prompt("기간 탭 이름", active.label);
                if (n == null || !n.trim()) return;
                setWb((prev) => patchActiveRange(prev, { label: n.trim() }));
              }}
              className="mt-5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              탭 이름
            </button>
          </div>
        </div>
      ) : null}

      {load.kind === "loading" ? <p className="text-sm text-zinc-500">불러오는 중…</p> : null}
      {load.kind === "error" ? <p className="text-sm text-red-600 dark:text-red-400">{load.message}</p> : null}

      {load.kind === "ready" ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-300 dark:border-zinc-600">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <colgroup>
              <col className="w-[10rem]" />
              <col className="w-[9rem]" />
              <col />
              <col />
              <col className="w-[8rem]" />
            </colgroup>
            <thead>
              <tr>
                <th className={thCls}>대분류</th>
                <th className={thCls}>소분류</th>
                <th className={thCls}>세부 내용</th>
                <th className={thCls}>체크 사항</th>
                <th className={thCls}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-zinc-400 px-3 py-8 text-center text-zinc-500 dark:border-zinc-600">
                    선택한 기간({active?.from} ~ {active?.to})에 해당하는 실행일 업무가 없습니다.
                  </td>
                </tr>
              ) : (
                Array.from(grouped.entries()).flatMap(([cat, list]) =>
                  list.map((t, idx) => (
                    <tr key={`${cat}-${idx}-${t.id ?? ""}`}>
                      <td className={`${tdCls} bg-zinc-50 dark:bg-zinc-900/50`}>{cat}</td>
                      <td className={tdCls}>
                        <div className="space-y-0.5">
                          <p className="font-medium">{(t["업무명"] ?? "").trim() || "(제목 없음)"}</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            실행일 {(t["실행일"] ?? "").trim() || "—"} · 마감일 {(t["마감일"] ?? "").trim() || "—"}
                          </p>
                        </div>
                      </td>
                      <td className={tdCls}>{(t["메모"] ?? "").trim() || "—"}</td>
                      <td className={tdCls}>—</td>
                      <td className={tdCls}>
                        <Link href="/tasks" className="text-xs text-zinc-700 underline dark:text-zinc-200">
                          열기
                        </Link>
                      </td>
                    </tr>
                  )),
                )
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* 하단 고정 기간 탭 */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-11 shrink-0 items-end gap-0.5 overflow-x-auto border-t border-zinc-300 bg-zinc-200/95 px-1 pt-0.5 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/95 dark:shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.35)] md:left-52"
        role="tablist"
        aria-label="기간 탭"
      >
        {tabs.map((t) => {
          const isActive = t.id === wb.activeId;
          return (
            <div
              key={t.id}
              className={`group flex max-w-[11rem] shrink-0 items-stretch rounded-t-md border border-b-0 text-left text-xs font-medium transition-colors ${
                isActive
                  ? "border-zinc-400 bg-white text-zinc-900 dark:border-zinc-500 dark:bg-zinc-950 dark:text-zinc-50"
                  : "border-transparent bg-zinc-300/70 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700/80 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
              title="클릭: 기간 선택 · 더블 클릭: 실행일 범위 설정"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setWb((prev) => ({ ...prev, activeId: t.id }))}
                onDoubleClick={() => {
                  const from = window.prompt("시작일 (YYYY-MM-DD)", t.from);
                  if (from == null) return;
                  const to = window.prompt("종료일 (YYYY-MM-DD)", t.to);
                  if (to == null) return;
                  setWb((prev) => {
                    const next = {
                      ...prev,
                      tabs: prev.tabs.map((x) => (x.id === t.id ? { ...x, from: from.trim(), to: to.trim() } : x)),
                    };
                    saveWeeklyAgendaRangesWorkbook(next);
                    return next;
                  });
                }}
                className="min-w-0 flex-1 truncate px-2.5 py-2 text-left"
              >
                {t.label}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const label = window.prompt("새 기간 탭 이름", "새 기간");
            if (label == null) return;
            setWb((prev) => addRangeTab(prev, label));
          }}
          className="mb-px shrink-0 rounded-t-md border border-transparent bg-zinc-300/50 px-2.5 py-1.5 text-base font-light leading-none text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700/50 dark:text-zinc-300 dark:hover:bg-zinc-600"
          title="새 기간 탭"
        >
          +
        </button>
      </div>
    </div>
  );
}

