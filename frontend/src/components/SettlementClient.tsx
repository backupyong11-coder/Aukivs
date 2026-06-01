"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSettlementFromServer, saveSettlementToServer } from "@/lib/settlementApi";
import {
  collectCalendarTasks,
  createDefaultSettlementProfile,
  daysInMonth,
  loadSettlementProfile,
  saveSettlementProfile,
  SETTLEMENT_TASK_META,
  settlementNewId,
  type CalendarTaskEntry,
  type SettlementMonthlyTask,
  type SettlementProfile,
  type SettlementTaskType,
  type SettlementVendor,
} from "@/lib/settlementStorage";

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";

const inputCls =
  "w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-400/40 dark:focus:border-zinc-600 dark:focus:bg-zinc-900";

const textareaCls =
  "w-full min-w-0 rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 dark:border-zinc-700 dark:bg-zinc-900";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const TASK_TYPES: SettlementTaskType[] = ["receive", "invoice", "withdraw", "deposit", "verify"];

function syncBanner(status: SyncStatus, message: string | null) {
  if (status === "loading") return "불러오는 중…";
  if (status === "saving") return "서버에 저장 중…";
  if (status === "synced") return "서버에 저장됨";
  if (status === "local") return message ?? "로컬만 저장됨";
  return message ?? "서버 저장 실패";
}

function mondayOffset(year: number, month: number): number {
  const dow = new Date(year, month - 1, 1).getDay();
  return (dow + 6) % 7;
}

function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function TaskChip({ entry, compact }: { entry: CalendarTaskEntry; compact?: boolean }) {
  const meta = SETTLEMENT_TASK_META[entry.task.type];
  return (
    <span
      className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${meta.bg} ${meta.color} ${
        entry.task.done ? "opacity-50 line-through" : ""
      } ${compact ? "max-w-full" : ""}`}
      title={`${entry.vendorName}: ${entry.task.label}`}
    >
      {compact ? entry.vendorName : `${entry.vendorName} · ${entry.task.label}`}
    </span>
  );
}

function VendorCard(props: {
  vendor: SettlementVendor;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: SettlementVendor) => void;
  onRemove: () => void;
}) {
  const { vendor, expanded } = props;

  function patch(partial: Partial<SettlementVendor>) {
    props.onChange({ ...vendor, ...partial });
  }

  function patchTask(taskId: string, partial: Partial<SettlementMonthlyTask>) {
    patch({
      monthlyTasks: vendor.monthlyTasks.map((t) => (t.id === taskId ? { ...t, ...partial } : t)),
    });
  }

  function addTask() {
    patch({
      monthlyTasks: [
        ...vendor.monthlyTasks,
        {
          id: settlementNewId("stask"),
          dayStart: 1,
          label: "새 할 일",
          type: "verify",
          done: false,
        },
      ],
    });
  }

  function removeTask(taskId: string) {
    patch({ monthlyTasks: vendor.monthlyTasks.filter((t) => t.id !== taskId) });
  }

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      >
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{vendor.company || "업체"}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {vendor.settlementName}
            {vendor.settlementDateNote ? ` · ${vendor.settlementDateNote}` : ""}
          </p>
        </div>
        <span className="text-xs text-zinc-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">업체</span>
              <input className={textareaCls} value={vendor.company} onChange={(e) => patch({ company: e.target.value })} />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">정산명</span>
              <input
                className={textareaCls}
                value={vendor.settlementName}
                onChange={(e) => patch({ settlementName: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">런칭일</span>
              <input
                className={textareaCls}
                value={vendor.launchDate}
                onChange={(e) => patch({ launchDate: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">확인 주기</span>
              <input
                className={textareaCls}
                value={vendor.verifyFrequency}
                onChange={(e) => patch({ verifyFrequency: e.target.value })}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-0.5 block text-zinc-500">플로우 (한 줄 요약)</span>
              <textarea
                className={textareaCls}
                rows={2}
                value={vendor.flow}
                onChange={(e) => patch({ flow: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">사이트</span>
              <input className={textareaCls} value={vendor.site} onChange={(e) => patch({ site: e.target.value })} />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">아이디</span>
              <input
                className={textareaCls}
                value={vendor.loginId}
                onChange={(e) => patch({ loginId: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">비밀번호</span>
              <input
                className={textareaCls}
                value={vendor.loginPassword}
                onChange={(e) => patch({ loginPassword: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">정산날짜</span>
              <input
                className={textareaCls}
                value={vendor.settlementDateNote}
                onChange={(e) => patch({ settlementDateNote: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">계산서</span>
              <input
                className={textareaCls}
                value={vendor.invoiceNote}
                onChange={(e) => patch({ invoiceNote: e.target.value })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block text-zinc-500">입금</span>
              <input
                className={textareaCls}
                value={vendor.depositDateNote}
                onChange={(e) => patch({ depositDateNote: e.target.value })}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-0.5 block text-zinc-500">정산방법</span>
              <textarea
                className={textareaCls}
                rows={3}
                value={vendor.method}
                onChange={(e) => patch({ method: e.target.value })}
              />
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="mb-0.5 block text-zinc-500">확인방법</span>
              <textarea
                className={textareaCls}
                rows={2}
                value={vendor.verifyMethod}
                onChange={(e) => patch({ verifyMethod: e.target.value })}
              />
            </label>
            {vendor.notes !== undefined ? (
              <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block text-amber-600 dark:text-amber-400">참고</span>
                <textarea
                  className={textareaCls}
                  rows={2}
                  value={vendor.notes ?? ""}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </label>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">월별 할 일 (캘린더에 표시)</h4>
              <button
                type="button"
                onClick={addTask}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                + 할 일
              </button>
            </div>
            <ul className="space-y-2">
              {vendor.monthlyTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <input
                    type="checkbox"
                    checked={t.done === true}
                    onChange={(e) => patchTask(t.id, { done: e.target.checked })}
                    className="h-4 w-4 rounded"
                    title="완료"
                  />
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    일
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className="w-12 rounded border border-zinc-200 px-1 py-0.5 text-center dark:border-zinc-700 dark:bg-zinc-900"
                      value={t.dayStart}
                      onChange={(e) => patchTask(t.id, { dayStart: Number(e.target.value) || 1 })}
                    />
                    ~
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className="w-12 rounded border border-zinc-200 px-1 py-0.5 text-center dark:border-zinc-700 dark:bg-zinc-900"
                      value={t.dayEnd ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value;
                        patchTask(t.id, v === "" ? { dayEnd: undefined } : { dayEnd: Number(v) || t.dayStart });
                      }}
                    />
                  </label>
                  <select
                    className="rounded border border-zinc-200 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    value={t.type}
                    onChange={(e) => patchTask(t.id, { type: e.target.value as SettlementTaskType })}
                  >
                    {TASK_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {SETTLEMENT_TASK_META[ty].label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`min-w-[8rem] flex-1 ${inputCls}`}
                    value={t.label}
                    onChange={(e) => patchTask(t.id, { label: e.target.value })}
                    placeholder="할 일 설명"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                    매주
                    <select
                      className="rounded border border-zinc-200 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                      value={t.recurringWeekday ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchTask(t.id, v === "" ? { recurringWeekday: undefined } : { recurringWeekday: Number(v) });
                      }}
                    >
                      <option value="">없음</option>
                      {WEEKDAYS.map((w, i) => (
                        <option key={w} value={(i + 1) % 7}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeTask(t.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={props.onRemove}
            className="text-xs text-red-600 hover:underline dark:text-red-400"
          >
            업체 삭제
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function SettlementClient() {
  const now = new Date();
  const [profile, setProfile] = useState<SettlementProfile>(() => createDefaultSettlementProfile());
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const server = await fetchSettlementFromServer();
      if (cancelled) return;
      if (server.ok && server.profile) {
        setProfile(server.profile);
        saveSettlementProfile(server.profile);
        setSyncStatus("synced");
        setHydrated(true);
        return;
      }
      const local = loadSettlementProfile();
      setProfile(local);
      saveSettlementProfile(local);
      if (server.ok && server.profile == null) {
        const saved = await saveSettlementToServer(local);
        if (cancelled) return;
        setSyncStatus(saved.ok ? "synced" : "local");
        setSyncMessage(saved.ok ? "초기 데이터를 서버에 올렸습니다." : saved.message);
      } else {
        setSyncStatus(server.ok ? "local" : "error");
        setSyncMessage(server.ok ? "서버에 문서가 없어 로컬을 열었습니다." : server.message);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSettlementProfile(profile);
    const t = window.setTimeout(() => {
      void (async () => {
        setSyncStatus((prev) => (prev === "error" ? "error" : "saving"));
        const result = await saveSettlementToServer(profile);
        if (result.ok) {
          setSyncStatus("synced");
          setSyncMessage(null);
        } else {
          setSyncStatus("error");
          setSyncMessage(result.message);
        }
      })();
    }, 700);
    return () => window.clearTimeout(t);
  }, [profile, hydrated]);

  const calendarMap = useMemo(
    () => collectCalendarTasks(profile.vendors, year, month),
    [profile.vendors, year, month],
  );

  const dim = daysInMonth(year, month);
  const offset = mondayOffset(year, month);
  const today =
    year === now.getFullYear() && month === now.getMonth() + 1 ? now.getDate() : null;

  const selectedEntries = selectedDay != null ? (calendarMap.get(selectedDay) ?? []) : [];

  const monthAgenda = useMemo(() => {
    const rows: { day: number; entries: CalendarTaskEntry[] }[] = [];
    for (let d = 1; d <= dim; d++) {
      const entries = calendarMap.get(d);
      if (entries && entries.length > 0) rows.push({ day: d, entries });
    }
    return rows;
  }, [calendarMap, dim]);

  const shiftMonth = useCallback((delta: number) => {
    setYear((y) => {
      let m = month + delta;
      let ny = y;
      while (m < 1) {
        m += 12;
        ny -= 1;
      }
      while (m > 12) {
        m -= 12;
        ny += 1;
      }
      setMonth(m);
      setSelectedDay(null);
      return ny;
    });
  }, [month]);

  const updateVendor = useCallback((vendorId: string, next: SettlementVendor) => {
    setProfile((p) => ({
      ...p,
      vendors: p.vendors.map((v) => (v.id === vendorId ? next : v)),
    }));
  }, []);

  const addVendor = useCallback(() => {
    const id = settlementNewId("vendor");
    setProfile((p) => ({
      ...p,
      vendors: [
        ...p.vendors,
        {
          id,
          order: p.vendors.length + 1,
          company: "새 업체",
          settlementName: "",
          launchDate: "",
          flow: "",
          verifyFrequency: "",
          site: "",
          loginId: "",
          loginPassword: "",
          settlementDateNote: "",
          invoiceNote: "",
          depositDateNote: "",
          method: "",
          verifyMethod: "",
          monthlyTasks: [],
        },
      ],
    }));
    setExpandedVendorId(id);
  }, []);

  const removeVendor = useCallback((vendorId: string) => {
    setProfile((p) => ({
      ...p,
      vendors: p.vendors.filter((v) => v.id !== vendorId).map((v, i) => ({ ...v, order: i + 1 })),
    }));
  }, []);

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <input
            className="bg-transparent text-2xl font-bold tracking-tight text-zinc-900 outline-none dark:text-zinc-50"
            value={profile.title}
            onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
          />
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            전월 판매분 기준 익월(또는 익익월) 정산 — 월별로 무엇을 언제 취해야 하는지 캘린더로 확인
          </p>
        </div>
        <p
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            syncStatus === "error"
              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              : syncStatus === "synced"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {syncBanner(syncStatus, syncMessage)}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {TASK_TYPES.map((ty) => (
          <span
            key={ty}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${SETTLEMENT_TASK_META[ty].bg} ${SETTLEMENT_TASK_META[ty].color}`}
          >
            {SETTLEMENT_TASK_META[ty].label}
          </span>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              ◀
            </button>
            <h2 className="min-w-[8rem] text-center text-lg font-bold tabular-nums">{formatMonthLabel(year, month)}</h2>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => {
                setYear(now.getFullYear());
                setMonth(now.getMonth() + 1);
                setSelectedDay(now.getDate());
              }}
              className="rounded-lg border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              이번 달
            </button>
          </div>
          <p className="text-xs text-zinc-500">날짜를 클릭하면 해당일 할 일을 아래에 표시합니다</p>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-500">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day == null) {
              return <div key={`empty-${idx}`} className="min-h-[5.5rem] rounded-lg bg-zinc-50/50 dark:bg-zinc-900/20" />;
            }
            const entries = calendarMap.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`min-h-[5.5rem] rounded-lg border p-1 text-left transition-colors ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-400/30 dark:border-indigo-600 dark:bg-indigo-950/30"
                    : isToday
                      ? "border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20"
                      : entries.length > 0
                        ? "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
                        : "border-transparent bg-zinc-50/80 hover:bg-zinc-100 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/60"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                    isToday ? "bg-emerald-500 text-white" : "text-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {day}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {entries.slice(0, 3).map((e, i) => (
                    <TaskChip key={`${e.vendorId}-${e.task.id}-${i}`} entry={e} compact />
                  ))}
                  {entries.length > 3 ? (
                    <span className="text-[10px] text-zinc-400">+{entries.length - 3}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {selectedDay != null ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
            {month}월 {selectedDay}일 할 일
          </h3>
          {selectedEntries.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">이 날짜에 등록된 정산 할 일이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedEntries.map((e, i) => {
                const meta = SETTLEMENT_TASK_META[e.task.type];
                return (
                  <li
                    key={`${e.vendorId}-${e.task.id}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-white/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/80"
                  >
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{e.vendorName}</span>
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">{e.task.label}</span>
                    <label className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
                      <input
                        type="checkbox"
                        checked={e.task.done === true}
                        onChange={(ev) => {
                          const vendor = profile.vendors.find((v) => v.id === e.vendorId);
                          if (!vendor) return;
                          updateVendor(e.vendorId, {
                            ...vendor,
                            monthlyTasks: vendor.monthlyTasks.map((t) =>
                              t.id === e.task.id ? { ...t, done: ev.target.checked } : t,
                            ),
                          });
                        }}
                      />
                      완료
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-bold text-zinc-800 dark:text-zinc-100">이번 달 일정 한눈에</h3>
        {monthAgenda.length === 0 ? (
          <p className="text-sm text-zinc-500">등록된 월별 할 일이 없습니다. 아래 업체 카드에서 추가하세요.</p>
        ) : (
          <div className="space-y-2">
            {monthAgenda.map(({ day, entries }) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className="flex w-full flex-wrap items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
              >
                <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                  {day}일
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {entries.map((e, i) => (
                    <TaskChip key={`${e.vendorId}-${e.task.id}-${i}`} entry={e} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">업체별 정산 방법 (편집 가능)</h3>
          <button
            type="button"
            onClick={addVendor}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            + 업체 추가
          </button>
        </div>
        <div className="space-y-3">
          {[...profile.vendors]
            .sort((a, b) => a.order - b.order)
            .map((v) => (
              <VendorCard
                key={v.id}
                vendor={v}
                expanded={expandedVendorId === v.id}
                onToggle={() => setExpandedVendorId((id) => (id === v.id ? null : v.id))}
                onChange={(next) => updateVendor(v.id, next)}
                onRemove={() => removeVendor(v.id)}
              />
            ))}
        </div>
      </section>
    </div>
  );
}
