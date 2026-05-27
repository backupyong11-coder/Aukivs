"use client";

import { useState } from "react";
import { isCalendarRestDay } from "@/lib/calendarRestDay";
import {
  normalizeSheetDateYmd,
  seoulCalendarYearMonthNow,
  seoulYmdPartsNow,
  sundayWeekStart,
  ymdFromParts,
} from "@/lib/sheetDates";

function parseYmdParts(ymd: string | null): { year: number; month: number; day: number } {
  if (ymd) {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  return seoulYmdPartsNow();
}

type Props = {
  value: string;
  onSelect: (ymd: string) => void;
  onClear: () => void;
};

export function SheetMiniCalendar({ value, onSelect, onClear }: Props) {
  const selected = normalizeSheetDateYmd(value);
  const initial = parseYmdParts(selected);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const today = seoulYmdPartsNow();
  const todayYmd = ymdFromParts(today.year, today.month, today.day);

  const first = sundayWeekStart(viewYear, viewMonth, 1);
  const totalCells = 42;
  const cells: { y: number; m: number; d: number; inMonth: boolean }[] = [];
  let cy = first.y;
  let cm = first.m;
  let cd = first.d;
  for (let i = 0; i < totalCells; i++) {
    cells.push({ y: cy, m: cm, d: cd, inMonth: cm === viewMonth });
    const next = new Date(cy, cm - 1, cd + 1);
    cy = next.getFullYear();
    cm = next.getMonth() + 1;
    cd = next.getDate();
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  return (
    <div
      className="w-[15.5rem] rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
      role="dialog"
      aria-label="날짜 선택"
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          onClick={() => shiftMonth(-1)}
          aria-label="이전 달"
        >
          ‹
        </button>
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">
          {viewYear}년 {viewMonth}월
        </span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          onClick={() => shiftMonth(1)}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-zinc-500">
        {["일", "월", "화", "수", "목", "금", "토"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const ymd = ymdFromParts(c.y, c.m, c.d);
          const isSelected = selected === ymd;
          const isToday = todayYmd === ymd;
          const rest = isCalendarRestDay(c.y, c.m, c.d);
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              className={`h-7 rounded text-[11px] tabular-nums ${
                !c.inMonth
                  ? "text-zinc-300 dark:text-zinc-600"
                  : rest
                    ? "text-red-600 dark:text-red-400"
                    : "text-zinc-800 dark:text-zinc-200"
              } ${
                isSelected
                  ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : isToday
                    ? "ring-1 ring-inset ring-zinc-400 dark:ring-zinc-500"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {c.d}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
        <button
          type="button"
          className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={() => {
            const now = seoulCalendarYearMonthNow();
            onSelect(ymdFromParts(now.year, now.month, today.day));
          }}
        >
          오늘
        </button>
        <button
          type="button"
          className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={onClear}
        >
          지우기
        </button>
      </div>
    </div>
  );
}
