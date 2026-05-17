"use client";

import type { MemoItem } from "@/lib/memos";
import type { WorksMasterItem } from "@/lib/worksMaster";
import { formatCalendarTaskTitle } from "@/lib/formatCalendarTaskTitle";
import { normalizeSheetDateYmd } from "@/lib/sheetDates";
import { safeInt } from "@/lib/safeInt";
import { worksFirstSupplyYmd, worksRowSubLines } from "@/lib/worksMasterDisplay";

type Props = {
  ymd: string;
  uploadRows: Record<string, string>[];
  allTasks: Record<string, string>[];
  memos: MemoItem[];
  worksMaster: WorksMasterItem[];
};

export function DayAgendaDetail({ ymd, uploadRows, allTasks, memos, worksMaster }: Props) {
  const [y, m, d] = ymd.split("-").map(Number);
  const uploadRowsOnDay = uploadRows.filter((it) => normalizeSheetDateYmd(it["업로드일"] ?? "") === ymd);
  const memosOnDay = memos.filter((memo) => normalizeSheetDateYmd(memo.memo_date ?? "") === ymd);
  const allTasksOnDay = allTasks.filter((it) => normalizeSheetDateYmd(it["마감일"] ?? "") === ymd);
  const launchesOnDay = uploadRows.filter((it) => normalizeSheetDateYmd(it["런칭일"] ?? "") === ymd);
  const worksFirstSupplyOnDay = worksMaster.filter((w) => worksFirstSupplyYmd(w) === ymd);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">업무 ({allTasksOnDay.length}건)</p>
        {allTasksOnDay.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">없음</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {allTasksOnDay.map((it, i) => (
              <li
                key={i}
                className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              >
                <span className="text-zinc-800 dark:text-zinc-100">{formatCalendarTaskTitle(it)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">업로드 ({uploadRowsOnDay.length}건)</p>
        {uploadRowsOnDay.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">없음</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {uploadRowsOnDay.map((it, i) => (
              <li
                key={it.id ? String(it.id) : `uo-day-${i}`}
                className="rounded border border-zinc-200 bg-zinc-50/90 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{it["작품명"] ?? ""}</span>
                {it["플랫폼명"] ? <span className="ml-1 text-zinc-500 dark:text-zinc-400">({it["플랫폼명"]})</span> : null}
                <span className="ml-2 tabular-nums text-zinc-700 dark:text-zinc-300">{safeInt(it["업로드화수"])}화</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {launchesOnDay.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-500">🚀 런칭일 ({launchesOnDay.length}건)</p>
          <ul className="mt-1 space-y-1">
            {launchesOnDay.map((it, i) => (
              <li key={i} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs dark:border-red-900/50 dark:bg-red-950/40">
                {(it["플랫폼명"] ?? "").trim() ? (
                  <span className="mr-1 font-medium text-red-700 dark:text-red-300">{(it["플랫폼명"] ?? "").trim()}</span>
                ) : null}
                <span className="text-red-900 dark:text-red-100">{(it["작품명"] ?? "").trim()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {worksFirstSupplyOnDay.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            작품정리 · 첫 공급 일정 ({worksFirstSupplyOnDay.length}건)
          </p>
          <ul className="mt-1 space-y-1">
            {worksFirstSupplyOnDay.map((w, i) => {
              const subs = worksRowSubLines(w).slice(0, 4);
              return (
                <li
                  key={`works-fs-${i}-${(w["작품명"] ?? "").slice(0, 20)}`}
                  className="rounded border border-emerald-200 bg-emerald-50/90 px-2 py-1 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/30"
                >
                  <span className="font-medium text-emerald-900 dark:text-emerald-100">{w["작품명"] ?? ""}</span>
                  {subs.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-emerald-800/90 dark:text-emerald-200/90">
                      {subs.map((s, j) => (
                        <li key={j}>
                          <span className="text-emerald-600 dark:text-emerald-400">{s.label}</span> {s.value}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">메모 ({memosOnDay.length}건)</p>
        {memosOnDay.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">없음</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {memosOnDay.map((memo) => (
              <li key={memo.sheet_row} className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700">
                {memo.content}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
        선택한 날짜: {y}년 {m}월 {d}일
      </p>
    </div>
  );
}
