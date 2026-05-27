"use client";

import {
  TABLE_PAGE_SIZE_OPTIONS,
  dateRangeLabel,
  type DateRangeFilter,
  type DateRangePreset,
  type TablePageSize,
} from "@/lib/tableListView";

const presetBtn = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
    active
      ? "border-zinc-500 bg-zinc-500 text-zinc-50 dark:border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900"
      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600"
  }`;

const sizeBtn = (active: boolean) =>
  `rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
    active
      ? "border-zinc-500 bg-zinc-500 text-zinc-50 dark:border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900"
      : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;

export function TableListControls(props: {
  pageSize: TablePageSize;
  onPageSizeChange: (size: TablePageSize) => void;
  showAll: boolean;
  onShowAll: () => void;
  totalFiltered: number;
  hiddenCount: number;
  displayedCount: number;
  dateFilter: DateRangeFilter;
  onDatePresetChange: (preset: DateRangePreset) => void;
  onCustomFromChange: (ymd: string) => void;
  onCustomToChange: (ymd: string) => void;
  dateExcludedCount?: number;
  dateFieldHint?: string;
}) {
  const {
    pageSize,
    onPageSizeChange,
    showAll,
    onShowAll,
    totalFiltered,
    hiddenCount,
    displayedCount,
    dateFilter,
    onDatePresetChange,
    onCustomFromChange,
    onCustomToChange,
    dateExcludedCount = 0,
    dateFieldHint,
  } = props;

  const showMore = hiddenCount > 0 && !showAll;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/60 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          기간
        </span>
        {(["all", "today", "week", "month", "custom"] as DateRangePreset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={presetBtn(dateFilter.preset === p)}
            onClick={() => onDatePresetChange(p)}
          >
            {p === "all"
              ? "전체"
              : p === "today"
                ? "오늘"
                : p === "week"
                  ? "이번 주"
                  : p === "month"
                    ? "이번 달"
                    : "직접"}
          </button>
        ))}
        {dateFilter.preset === "custom" ? (
          <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
            <input
              type="date"
              value={dateFilter.fromYmd}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
              aria-label="시작일"
            />
            <span>~</span>
            <input
              type="date"
              value={dateFilter.toYmd}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
              aria-label="종료일"
            />
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{dateRangeLabel(dateFilter)}</span>
        )}
        {dateFieldHint ? (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500" title={dateFieldHint}>
            · 캘린더 연동
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            표시
          </span>
          {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className={sizeBtn(pageSize === n)}
              onClick={() => onPageSizeChange(n)}
            >
              {n}개
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          {totalFiltered === 0 ? (
            "표시할 항목 없음"
          ) : (
            <>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{totalFiltered}건</span>
              {dateExcludedCount > 0 ? (
                <span className="text-zinc-400 dark:text-zinc-500">
                  {" "}
                  (기간 제외 {dateExcludedCount}건)
                </span>
              ) : null}
              {" · "}
              {displayedCount}건 표시
              {showMore ? (
                <>
                  {" "}
                  <span className="text-zinc-400">… 외 {hiddenCount}건</span>
                  <button
                    type="button"
                    onClick={onShowAll}
                    className="ml-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    더보기 ({totalFiltered}건 전체)
                  </button>
                </>
              ) : showAll && totalFiltered > pageSize ? (
                <span className="text-zinc-400"> (전체 펼침)</span>
              ) : null}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
