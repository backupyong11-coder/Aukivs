"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toDateInputValue } from "@/lib/sheetDates";
import { WeeklyAgendaPersonGrid } from "@/components/WeeklyAgendaPersonGrid";
import { fetchTasks, updateTaskFields, type TaskSheetRow } from "@/lib/tasks";
import {
  addRangeTab,
  loadWeeklyAgendaRangesWorkbook,
  patchActiveRange,
  saveWeeklyAgendaRangesWorkbook,
  type WeeklyAgendaRangeWorkbook,
} from "@/lib/weeklyAgendaRangeStorage";
import {
  buildAutoPersonGridFromTasks,
  buildWeekColumnDefs,
  collectWeeklyAgendaPersonNames,
  filterTasksByExecuteRange,
  taskAgendaDetails,
  taskAgendaMajor,
  taskAgendaMinor,
} from "@/lib/weeklyAgendaTasksPersonGrid";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: TaskSheetRow[] };

const agendaCellInputCls =
  "w-full min-w-0 border-0 bg-transparent px-0 py-0 text-sm text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/60 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-500";

export function WeeklyAgendaTasksClient() {
  const [wb, setWb] = useState<WeeklyAgendaRangeWorkbook>(() => loadWeeklyAgendaRangesWorkbook());
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [patchError, setPatchError] = useState<string | null>(null);

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
  }, [refreshKey]);

  const tabs = useMemo(
    () => [...wb.tabs].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ko")),
    [wb.tabs],
  );
  const active = useMemo(
    () => wb.tabs.find((t) => t.id === wb.activeId) ?? tabs[0] ?? null,
    [tabs, wb.activeId, wb.tabs],
  );

  const autoGrid = useMemo(() => {
    if (load.kind !== "ready" || !active) {
      return {
        grid: { title: "인물별 주간", rows: [] },
        weekColumns: buildWeekColumnDefs(active?.from ?? "", active?.to ?? ""),
        matchedCount: 0,
      };
    }
    const personNames = collectWeeklyAgendaPersonNames(load.items, "manager");
    return buildAutoPersonGridFromTasks(load.items, active.from, active.to, personNames, "manager");
  }, [load, active]);

  const filtered = useMemo(() => {
    if (load.kind !== "ready" || !active) return [];
    return filterTasksByExecuteRange(load.items, active.from, active.to).sort(
      (a, b) =>
        (a["실행일"] ?? "").localeCompare(b["실행일"] ?? "") ||
        taskAgendaMajor(a).localeCompare(taskAgendaMajor(b), "ko") ||
        taskAgendaDetails(a).localeCompare(taskAgendaDetails(b), "ko"),
    );
  }, [load, active]);

  const periodLabel = useMemo(() => {
    const cols = autoGrid.weekColumns.filter((c) => c.inRange);
    if (cols.length === 0) return "";
    const first = cols[0]?.label ?? "";
    const last = cols[cols.length - 1]?.label ?? "";
    return `${first} ~ ${last}`;
  }, [autoGrid.weekColumns]);

  const thCls =
    "border border-zinc-400 bg-zinc-200 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50";
  const tdCls =
    "align-top border border-zinc-400 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  const patchTaskField = useCallback(
    async (taskId: string, field: "마감일" | "실행일", nextValue: string) => {
      if (load.kind !== "ready") return;
      const item = load.items.find((it) => it.id === taskId);
      if (!item) return;
      const prev = item[field] ?? "";
      if (prev === nextValue) return;
      setPatchError(null);
      setLoad((s) => {
        if (s.kind !== "ready") return s;
        return {
          kind: "ready",
          items: s.items.map((it) => (it.id === taskId ? { ...it, [field]: nextValue } : it)),
        };
      });
      const r = await updateTaskFields(taskId, { [field]: nextValue });
      if (!r.ok) {
        setLoad((s) => {
          if (s.kind !== "ready") return s;
          return {
            kind: "ready",
            items: s.items.map((it) => (it.id === taskId ? { ...it, [field]: prev } : it)),
          };
        });
        setPatchError(r.message);
      }
    },
    [load],
  );

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">주간 아젠다</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            업무정리 DB의 <strong className="font-medium text-zinc-700 dark:text-zinc-300">실행일</strong>이 선택한
            기간에 포함되는 업무를 표시합니다. 소분류=정량화 분, 세부 내용=업무명 · 인물별 주간 표에는 업무명만 표시됩니다.
            자동 배치됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/tasks" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            업무정리 DB →
          </Link>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
          >
            새로고침
          </button>
        </div>
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
            {periodLabel ? (
              <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400">
                요일 열: <span className="font-medium text-zinc-700 dark:text-zinc-300">{periodLabel}</span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {load.kind === "loading" ? <p className="text-sm text-zinc-500">불러오는 중…</p> : null}
      {load.kind === "error" ? <p className="text-sm text-red-600 dark:text-red-400">{load.message}</p> : null}
      {patchError ? <p className="text-sm text-red-600 dark:text-red-400">{patchError}</p> : null}

      {load.kind === "ready" ? (
        <div className="space-y-8">
          <section className="space-y-2">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">일반 업무표</p>
            <div className="overflow-x-auto rounded-lg border border-zinc-300 dark:border-zinc-600">
              <table className="w-full min-w-[1020px] border-collapse text-sm">
                <colgroup>
                  <col className="w-[10rem]" />
                  <col className="w-[9rem]" />
                  <col />
                  <col className="w-[8rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[5rem]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className={thCls}>대분류</th>
                    <th className={thCls}>소분류</th>
                    <th className={thCls}>세부 내용</th>
                    <th className={thCls}>마감일</th>
                    <th className={thCls}>실행일</th>
                    <th className={thCls}>체크 사항</th>
                    <th className={thCls}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="border border-zinc-400 px-3 py-8 text-center text-zinc-500 dark:border-zinc-600"
                      >
                        선택한 기간({active?.from} ~ {active?.to})에 해당하는 실행일 업무가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t, idx) => (
                      <tr key={`${t.id ?? idx}-${idx}`}>
                        <td className={`${tdCls} bg-zinc-50 dark:bg-zinc-900/50`}>{taskAgendaMajor(t)}</td>
                        <td className={tdCls}>{taskAgendaMinor(t) || "—"}</td>
                        <td className={tdCls}>{taskAgendaDetails(t) || "—"}</td>
                        <td className={tdCls}>
                          <input
                            type="date"
                            spellCheck={false}
                            defaultValue={toDateInputValue((t["마감일"] ?? "").trim())}
                            key={`${t.id}-due-${t["마감일"]}`}
                            onBlur={(e) => void patchTaskField(t.id, "마감일", e.target.value.trim())}
                            className={agendaCellInputCls}
                          />
                        </td>
                        <td className={tdCls}>
                          <input
                            type="date"
                            spellCheck={false}
                            defaultValue={toDateInputValue((t["실행일"] ?? "").trim())}
                            key={`${t.id}-exec-${t["실행일"]}`}
                            onBlur={(e) => void patchTaskField(t.id, "실행일", e.target.value.trim())}
                            className={agendaCellInputCls}
                          />
                        </td>
                        <td className={tdCls}>—</td>
                        <td className={tdCls}>
                          <Link href="/tasks" className="text-xs text-zinc-700 underline dark:text-zinc-200">
                            열기
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">인물별 주간 표</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {autoGrid.matchedCount > 0
                ? `기간 내 실행일 업무 ${autoGrid.matchedCount}건을 담당자·요일에 배치했습니다.`
                : `선택한 기간(${active?.from} ~ ${active?.to})에 해당하는 실행일 업무가 없습니다.`}
            </p>
            <WeeklyAgendaPersonGrid
              grid={autoGrid.grid}
              readOnly
              weekColumns={autoGrid.weekColumns}
            />
          </section>
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
                      tabs: prev.tabs.map((x) =>
                        x.id === t.id ? { ...x, from: from.trim(), to: to.trim() } : x,
                      ),
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
