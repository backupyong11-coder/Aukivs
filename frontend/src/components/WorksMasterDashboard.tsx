"use client";

import { useMemo, useState } from "react";
import {
  computeWorksDashboardStats,
  type CountSlice,
} from "@/lib/worksMasterDashboardStats";
import { seoulYmdPartsNow } from "@/lib/sheetDates";

const BAR_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#64748b",
];

function pct(count: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function HorizontalBars({
  slices,
  total,
  emptyLabel,
}: {
  slices: CountSlice[];
  total: number;
  emptyLabel: string;
}) {
  const max = slices[0]?.count ?? 0;
  if (slices.length === 0 || max === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3">
      {slices.map(({ label, count }, i) => (
        <li key={label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-200" title={label}>
              {label}
            </span>
            <span className="shrink-0 tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
              {count}
              <span className="ml-1 font-normal text-zinc-400">({pct(count, total)})</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(4, (count / max) * 100)}%`,
                backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function KpiCard(props: {
  label: string;
  value: number | string;
  sub?: string;
  accent: "blue" | "green" | "purple" | "amber" | "rose" | "slate";
}) {
  const styles = {
    blue: "border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:border-blue-900/40 dark:from-blue-950/30 dark:to-zinc-950",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-zinc-950",
    purple: "border-violet-200 bg-gradient-to-br from-violet-50 to-white dark:border-violet-900/40 dark:from-violet-950/30 dark:to-zinc-950",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/30 dark:to-zinc-950",
    rose: "border-rose-200 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/40 dark:from-rose-950/30 dark:to-zinc-950",
    slate: "border-zinc-200 bg-gradient-to-br from-zinc-50 to-white dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-950",
  } as const;
  const valueStyles = {
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-emerald-700 dark:text-emerald-300",
    purple: "text-violet-700 dark:text-violet-300",
    amber: "text-amber-700 dark:text-amber-300",
    rose: "text-rose-700 dark:text-rose-300",
    slate: "text-zinc-900 dark:text-zinc-50",
  } as const;

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${styles[props.accent]}`}>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{props.label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${valueStyles[props.accent]}`}>
        {props.value}
      </p>
      {props.sub ? (
        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{props.sub}</p>
      ) : null}
    </div>
  );
}

export function WorksMasterDashboard({ items }: { items: Record<string, string>[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const stats = useMemo(() => computeWorksDashboardStats(items), [items]);
  const year = seoulYmdPartsNow().year;
  const monthlyMax = Math.max(1, ...stats.monthlySupply.map((m) => m.count));

  if (collapsed) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-zinc-800 dark:text-zinc-100">작품 현황</span>
            <span className="text-zinc-500">전체 {stats.total}건</span>
            <span className="text-emerald-600 dark:text-emerald-400">제작완료 {stats.productionDone}</span>
            <span className="text-violet-600 dark:text-violet-400">진행 {stats.inProgress}</span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
          >
            대시보드 펼치기
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/30 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">작품 현황 대시보드</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            작품관리 DB 요약 · {year}년 기준
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
        >
          접기
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="전체 작품"
          value={stats.total}
          sub="등록된 작품 수"
          accent="slate"
        />
        <KpiCard
          label="제작완료"
          value={stats.productionDone}
          sub={`전체의 ${pct(stats.productionDone, stats.total)}`}
          accent="green"
        />
        <KpiCard
          label="진행 중"
          value={stats.inProgress}
          sub={`완결 ${stats.completedStatus}건`}
          accent="purple"
        />
        <KpiCard
          label="첫 공급 예정"
          value={stats.upcomingSupply}
          sub="오늘 이후 일정"
          accent="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">작품분류별</h3>
          <p className="mb-4 text-[11px] text-zinc-500">분류 기준 작품 수</p>
          <HorizontalBars
            slices={stats.genreSlices}
            total={stats.total}
            emptyLabel="분류 데이터가 없습니다"
          />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">연재상태별</h3>
          <p className="mb-4 text-[11px] text-zinc-500">현재상태 기준</p>
          <HorizontalBars
            slices={stats.statusSlices}
            total={stats.total}
            emptyLabel="상태 데이터가 없습니다"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {year}년 첫 공급 일정 (월별)
          </h3>
          <p className="mb-4 text-[11px] text-zinc-500">첫 공급 일정이 해당 월인 작품</p>
          <div className="flex h-36 items-end gap-1.5 sm:gap-2">
            {stats.monthlySupply.map((m) => (
              <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                  {m.count > 0 ? m.count : ""}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-indigo-500/90 transition-all dark:bg-indigo-400/80"
                    style={{
                      height: `${Math.max(m.count > 0 ? 8 : 2, (m.count / monthlyMax) * 100)}%`,
                      minHeight: m.count > 0 ? "0.5rem" : "2px",
                    }}
                    title={`${m.label}: ${m.count}건`}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">{m.label.replace("월", "")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">형식별</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {stats.formatSlices.slice(0, 4).map(({ label, count }, i) => (
                <div
                  key={label}
                  className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <p
                    className="truncate text-[11px] text-zinc-500"
                    title={label}
                  >
                    {label}
                  </p>
                  <p
                    className="text-lg font-bold tabular-nums"
                    style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}
                  >
                    {count}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">일반/성인</h3>
            <div className="mt-3 space-y-2">
              {[
                { label: "성인", count: stats.adultGeneral.adult, color: "#f43f5e" },
                { label: "일반", count: stats.adultGeneral.general, color: "#3b82f6" },
                { label: "미지정", count: stats.adultGeneral.other, color: "#94a3b8" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 text-zinc-600 dark:text-zinc-300">{label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(count > 0 ? 6 : 0, (count / stats.total) * 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right tabular-nums font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
