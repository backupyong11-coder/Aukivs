"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DayAgendaDetail } from "@/components/DayAgendaDetail";
import { useControlRoomHub } from "@/hooks/useControlRoomHub";
import type { HubLoadState } from "@/lib/controlRoomHub";
import { formatCalendarTaskTitle } from "@/lib/formatCalendarTaskTitle";
import { isCalendarRestDay } from "@/lib/calendarRestDay";
import {
  addCalendarDays,
  normalizeSheetDateYmd,
  seoulYmdPartsNow,
  sundayWeekStart,
  ymdFromParts,
} from "@/lib/sheetDates";
import { safeInt } from "@/lib/safeInt";
import { worksFirstSupplyYmd } from "@/lib/worksMasterDisplay";

type CalendarView = "month" | "week" | "day";

type YmdParts = { y: number; m: number; d: number };

function activityDotsMap(hub: HubLoadState): Map<string, { uploads: number; tasks: number; launches: number }> {
  if (hub.kind !== "ready") return new Map();
  const map = new Map<string, { uploads: number; tasks: number; launches: number }>();
  const def = () => ({ uploads: 0, tasks: 0, launches: 0 });
  for (const it of hub.uploadRows) {
    const ymd = normalizeSheetDateYmd(it["업로드일"] ?? "");
    if (!ymd) continue;
    const cur = map.get(ymd) ?? def();
    map.set(ymd, { ...cur, uploads: cur.uploads + 1 });
  }
  for (const it of hub.allTasks) {
    const ymd = normalizeSheetDateYmd(it["마감일"] ?? "");
    if (!ymd) continue;
    const cur = map.get(ymd) ?? def();
    map.set(ymd, { ...cur, tasks: cur.tasks + 1 });
  }
  for (const it of hub.uploadRows) {
    const ymd = normalizeSheetDateYmd(it["런칭일"] ?? "");
    if (!ymd) continue;
    const cur = map.get(ymd) ?? def();
    map.set(ymd, { ...cur, launches: cur.launches + 1 });
  }
  return map;
}

function addMonths(y: number, m: number, delta: number): YmdParts {
  const dt = new Date(y, m - 1 + delta, 1);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: 1 };
}

function weekdayShortKo(y: number, m: number, d: number): string {
  const w = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return w ?? "";
}

export function FullCalendarClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  const hub = useControlRoomHub(refreshKey);
  const todayParts = seoulYmdPartsNow();
  const todayYmd = ymdFromParts(todayParts.year, todayParts.month, todayParts.day);

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<YmdParts>(() => ({
    y: todayParts.year,
    m: todayParts.month,
    d: todayParts.day,
  }));
  const [selectedYmd, setSelectedYmd] = useState<string>(todayYmd);

  const activityMap = useMemo(() => activityDotsMap(hub), [hub]);
  const ready = hub.kind === "ready";

  const weekStart = sundayWeekStart(cursor.y, cursor.m, cursor.d);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCalendarDays(weekStart.y, weekStart.m, weekStart.d, i)),
    [weekStart.y, weekStart.m, weekStart.d],
  );

  const weekLabelLast = weekDays[6];
  const weekRangeLabel =
    weekLabelLast &&
    `${weekStart.y}.${String(weekStart.m).padStart(2, "0")}.${String(weekStart.d).padStart(2, "0")} — ${weekLabelLast.y}.${String(weekLabelLast.m).padStart(2, "0")}.${String(weekLabelLast.d).padStart(2, "0")}`;

  const viewTabs: { id: CalendarView; label: string }[] = [
    { id: "month", label: "월간" },
    { id: "week", label: "주간" },
    { id: "day", label: "일간" },
  ];

  const tabBtn = "rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const tabOn = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  const tabOff =
    "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

  function goToday() {
    setCursor({ y: todayParts.year, m: todayParts.month, d: todayParts.day });
    setSelectedYmd(todayYmd);
  }

  function changeView(next: CalendarView) {
    setView(next);
    const parts = selectedYmd.split("-").map(Number);
    const [yy, mm, dd] = parts;
    if (parts.length !== 3 || !yy || !mm || !dd) return;
    if (next === "day") {
      setCursor({ y: yy, m: mm, d: dd });
    } else if (next === "week") {
      setCursor({ y: yy, m: mm, d: dd });
    } else if (next === "month") {
      setCursor({ y: yy, m: mm, d: 1 });
    }
  }

  function navPrev() {
    if (view === "month") {
      const n = addMonths(cursor.y, cursor.m, -1);
      setCursor({ y: n.y, m: n.m, d: 1 });
      setSelectedYmd(ymdFromParts(n.y, n.m, 1));
    } else if (view === "week") {
      const n = addCalendarDays(cursor.y, cursor.m, cursor.d, -7);
      setCursor(n);
      setSelectedYmd(ymdFromParts(n.y, n.m, n.d));
    } else {
      const n = addCalendarDays(cursor.y, cursor.m, cursor.d, -1);
      setCursor(n);
      setSelectedYmd(ymdFromParts(n.y, n.m, n.d));
    }
  }

  function navNext() {
    if (view === "month") {
      const n = addMonths(cursor.y, cursor.m, 1);
      setCursor({ y: n.y, m: n.m, d: 1 });
      setSelectedYmd(ymdFromParts(n.y, n.m, 1));
    } else if (view === "week") {
      const n = addCalendarDays(cursor.y, cursor.m, cursor.d, 7);
      setCursor(n);
      setSelectedYmd(ymdFromParts(n.y, n.m, n.d));
    } else {
      const n = addCalendarDays(cursor.y, cursor.m, cursor.d, 1);
      setCursor(n);
      setSelectedYmd(ymdFromParts(n.y, n.m, n.d));
    }
  }

  const monthGrid = useMemo(() => {
    const vy = cursor.y;
    const vm = cursor.m;
    const first = new Date(vy, vm - 1, 1).getDay();
    const daysInMonth = new Date(vy, vm, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return { vy, vm, cells };
  }, [cursor.y, cursor.m]);

  const headerTitle =
    view === "month"
      ? `${cursor.y}년 ${cursor.m}월`
      : view === "week"
        ? `주간 · ${weekRangeLabel ?? ""}`
        : `${cursor.y}년 ${cursor.m}월 ${cursor.d}일 (${weekdayShortKo(cursor.y, cursor.m, cursor.d)})`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {viewTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${tabBtn} ${view === t.id ? tabOn : tabOff}`}
              onClick={() => changeView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={navPrev}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
            aria-label="이전"
          >
            ←
          </button>
          <p className="min-w-[12rem] text-center text-base font-semibold text-zinc-900 dark:text-zinc-50">{headerTitle}</p>
          <button
            type="button"
            onClick={navNext}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
            aria-label="다음"
          >
            →
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={hub.kind === "loading"}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {hub.kind === "loading" ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        관제실 미니 달력과 동일한 데이터(업무 마감일, 업로드·런칭일, 메모, 작품 첫 공급 일정)를 사용합니다. 표시 타임존은 서울 기준이며,{" "}
        <span className="font-medium text-zinc-600 dark:text-zinc-300">회색 칸은 토·일·공휴일·대체공휴일</span>입니다.
      </p>

      {hub.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {hub.message}
        </div>
      )}

      {ready && hub.briefingLoadError ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">관제실 브리핑만 실패했습니다</p>
          <p className="mt-1 text-xs opacity-90">{hub.briefingLoadError}</p>
          <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-200/85">캘린더 일정(업무·업로드·메모 등)은 그대로 불러옵니다.</p>
        </div>
      ) : null}

      {hub.kind === "loading" && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          데이터 불러오는 중…
        </div>
      )}

      {ready && view === "month" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="min-w-[720px] p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                <div
                  key={d}
                  className={`rounded py-2 ${i === 0 || i === 6 ? "bg-zinc-100 dark:bg-zinc-800/60" : ""}`}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthGrid.cells.map((d, i) => {
                if (!d) return <div key={`e-${i}`} className="min-h-[5rem]" />;
                const ymd = ymdFromParts(monthGrid.vy, monthGrid.vm, d);
                const act = activityMap.get(ymd);
                const hasUpload = (act?.uploads ?? 0) > 0;
                const hasTask = (act?.tasks ?? 0) > 0;
                const hasLaunch = (act?.launches ?? 0) > 0;
                const isToday = ymd === todayYmd;
                const sel = ymd === selectedYmd;
                const rest = isCalendarRestDay(monthGrid.vy, monthGrid.vm, d);
                const restBg = rest
                  ? isToday
                    ? "bg-zinc-200/90 dark:bg-zinc-700/45"
                    : "bg-zinc-100 dark:bg-zinc-800/70"
                  : isToday
                    ? "bg-zinc-900/5 dark:bg-zinc-100/5"
                    : "";
                const restHover =
                  sel || !rest
                    ? ""
                    : "hover:bg-zinc-200/95 dark:hover:bg-zinc-700/85";
                const workHover =
                  sel || rest
                    ? ""
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900";
                return (
                  <button
                    key={`${ymd}-${i}`}
                    type="button"
                    onClick={() => setSelectedYmd(ymd)}
                    className={`flex min-h-[5rem] flex-col rounded-lg border p-2 text-left text-sm transition-colors ${restBg} ${
                      sel
                        ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                        : `border-zinc-200 dark:border-zinc-700 ${restHover} ${workHover}`
                    }`}
                  >
                    <span
                      className={`text-base font-semibold tabular-nums ${isToday ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-800 dark:text-zinc-200"}`}
                    >
                      {d}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-1 pt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {hasTask ? <span className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-700">업무 {act?.tasks}</span> : null}
                      {hasUpload ? (
                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                          업로드 {act?.uploads}
                        </span>
                      ) : null}
                      {hasLaunch ? (
                        <span className="rounded bg-red-100 px-1 py-0.5 text-red-800 dark:bg-red-950 dark:text-red-200">
                          런칭 {act?.launches}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {ready && view === "week" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid min-w-[900px] grid-cols-7 divide-x divide-zinc-200 dark:divide-zinc-800">
            {weekDays.map(({ y, m, d }) => {
              const ymd = ymdFromParts(y, m, d);
              const isToday = ymd === todayYmd;
              const sel = ymd === selectedYmd;
              const rest = isCalendarRestDay(y, m, d);
              const uploads = hub.uploadRows.filter((it) => normalizeSheetDateYmd(it["업로드일"] ?? "") === ymd);
              const tasks = hub.allTasks.filter((it) => normalizeSheetDateYmd(it["마감일"] ?? "") === ymd);
              const launches = hub.uploadRows.filter((it) => normalizeSheetDateYmd(it["런칭일"] ?? "") === ymd);
              const memos = hub.memos.filter((mo) => normalizeSheetDateYmd(mo.memo_date ?? "") === ymd);
              const works = hub.worksMaster.filter((w) => worksFirstSupplyYmd(w) === ymd);
              return (
                <div
                  key={ymd}
                  className={`flex min-h-[22rem] flex-col ${
                    sel
                      ? "bg-zinc-50 dark:bg-zinc-900/50"
                      : rest
                        ? "bg-zinc-100/90 dark:bg-zinc-800/55"
                        : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedYmd(ymd)}
                    className={`border-b border-zinc-200 px-2 py-3 text-left dark:border-zinc-800 ${
                      isToday
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : rest
                          ? "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-700/80 dark:text-zinc-50"
                          : ""
                    }`}
                  >
                    <p className="text-lg font-bold tabular-nums">{d}</p>
                    <p
                      className={`text-xs ${
                        isToday
                          ? "text-zinc-200 dark:text-zinc-700"
                          : rest
                            ? "text-zinc-600 dark:text-zinc-300"
                            : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {weekdayShortKo(y, m, d)}요일
                    </p>                  </button>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 text-[11px]">
                    {tasks.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold text-zinc-600 dark:text-zinc-400">업무</p>
                        <ul className="space-y-1">
                          {tasks.slice(0, 12).map((t, i) => (
                            <li key={i} className="rounded border-l-2 border-zinc-400 bg-zinc-50 px-1 py-0.5 dark:border-zinc-500 dark:bg-zinc-900">
                              {formatCalendarTaskTitle(t) || "(제목 없음)"}
                            </li>
                          ))}
                        </ul>
                        {tasks.length > 12 ? <p className="mt-1 text-zinc-400">+{tasks.length - 12}건</p> : null}
                      </div>
                    )}
                    {uploads.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">업로드</p>
                        <ul className="space-y-1">
                          {uploads.slice(0, 10).map((it, i) => (
                            <li key={i} className="rounded border-l-2 border-emerald-500 bg-emerald-50/80 px-1 py-0.5 dark:bg-emerald-950/30">
                              {it["작품명"]} · {safeInt(it["업로드화수"])}화
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {launches.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold text-red-600">런칭</p>
                        <ul className="space-y-1">
                          {launches.map((it, i) => (
                            <li key={i} className="rounded border-l-2 border-red-500 bg-red-50 px-1 py-0.5 dark:bg-red-950/30">
                              {(it["플랫폼명"] ?? "").trim() ? `${it["플랫폼명"]} · ` : ""}
                              {it["작품명"]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {works.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold text-emerald-700 dark:text-emerald-400">첫 공급</p>
                        <ul className="space-y-1">
                          {works.map((w, i) => (
                            <li key={i} className="rounded border-l-2 border-emerald-600 bg-emerald-50/60 px-1 py-0.5 dark:bg-emerald-950/20">
                              {w["작품명"]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {memos.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold text-zinc-600 dark:text-zinc-400">메모</p>
                        <ul className="space-y-1">
                          {memos.slice(0, 6).map((mo) => (
                            <li
                              key={mo.sheet_row}
                              className="line-clamp-4 rounded border-l-2 border-amber-400 bg-amber-50/80 px-1 py-0.5 dark:bg-amber-950/20"
                            >
                              {mo.content}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {tasks.length === 0 &&
                    uploads.length === 0 &&
                    launches.length === 0 &&
                    works.length === 0 &&
                    memos.length === 0 ? (
                      <p className="text-zinc-400">일정 없음</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ready && view === "day" && (
        <div className="grid gap-4 lg:grid-cols-12">
          <section
            className={`rounded-xl border border-zinc-200 bg-gradient-to-b p-6 dark:border-zinc-800 lg:col-span-4 ${
              isCalendarRestDay(cursor.y, cursor.m, cursor.d)
                ? "from-zinc-200/70 to-zinc-100 dark:from-zinc-800/90 dark:to-zinc-950"
                : "from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">일간</p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{cursor.d}</p>
            <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-400">
              {cursor.y}년 {cursor.m}월 · {weekdayShortKo(cursor.y, cursor.m, cursor.d)}요일
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const n = addCalendarDays(cursor.y, cursor.m, cursor.d, -1);
                  setCursor(n);
                  setSelectedYmd(ymdFromParts(n.y, n.m, n.d));
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                하루 전
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = addCalendarDays(cursor.y, cursor.m, cursor.d, 1);
                  setCursor(n);
                  setSelectedYmd(ymdFromParts(n.y, n.m, n.d));
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                하루 후
              </button>
            </div>
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              세부 시간이 시트에 없으면 하루 단위로만 표시됩니다.
            </p>
          </section>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-8">
            <div className="mb-3 flex justify-end">
              <Link href="/tasks" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
                업무정리 시트 →
              </Link>
            </div>
            <DayAgendaDetail
              ymd={ymdFromParts(cursor.y, cursor.m, cursor.d)}
              uploadRows={hub.uploadRows}
              allTasks={hub.allTasks}
              memos={hub.memos}
              worksMaster={hub.worksMaster}
            />
          </section>
        </div>
      )}

      {ready && view !== "day" && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">선택한 날짜 상세</h2>
            <Link href="/tasks" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
              업무정리 시트 →
            </Link>
          </div>
          <div className="mt-4">
            <DayAgendaDetail
              ymd={selectedYmd}
              uploadRows={hub.uploadRows}
              allTasks={hub.allTasks}
              memos={hub.memos}
              worksMaster={hub.worksMaster}
            />
          </div>
        </section>
      )}
    </div>
  );
}
