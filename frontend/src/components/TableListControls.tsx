"use client";

import { TableColumnProperties } from "@/components/TableColumnProperties";
import {
  TABLE_PAGE_SIZE_OPTIONS,
  type DateRangeFilter,
  type DateRangePreset,
  type TablePageSize,
} from "@/lib/tableListView";

const chipBtn = (active: boolean) =>
  `rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
    active
      ? "border-zinc-500 bg-zinc-500 text-zinc-50 dark:border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900"
      : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;

const PERIOD_PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "today", label: "오늘" },
  { id: "week", label: "이번 주" },
  { id: "month", label: "이번 달" },
  { id: "custom", label: "직접" },
];

const ROLLING_PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: "months1", label: "1개월" },
  { id: "months3", label: "3개월" },
  { id: "months6", label: "6개월" },
  { id: "months12", label: "12개월" },
];

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
  columnVisibility?: {
    allKeys: string[];
    hiddenColumns: Set<string>;
    onSetVisible: (key: string, visible: boolean) => void;
    onShowAllColumns: () => void;
    columnLabel?: (key: string) => string;
  };
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
    columnVisibility,
  } = props;

  const showMore = hiddenCount > 0 && !showAll;

  return (
    <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          기간
        </span>
        {PERIOD_PRESETS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={chipBtn(dateFilter.preset === id)}
            onClick={() => onDatePresetChange(id)}
          >
            {label}
          </button>
        ))}

        <span className="inline-flex shrink-0 items-center gap-0.5">
          <input
            type="date"
            value={dateFilter.fromYmd}
            onChange={(e) => onCustomFromChange(e.target.value)}
            disabled={dateFilter.preset !== "custom"}
            className="w-[6.75rem] rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-950"
            aria-label="시작일"
          />
          <span className="text-[10px] text-zinc-400">~</span>
          <input
            type="date"
            value={dateFilter.toYmd}
            onChange={(e) => onCustomToChange(e.target.value)}
            disabled={dateFilter.preset !== "custom"}
            className="w-[6.75rem] rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-950"
            aria-label="종료일"
          />
        </span>

        {ROLLING_PRESETS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={chipBtn(dateFilter.preset === id)}
            onClick={() => onDatePresetChange(id)}
          >
            {label}
          </button>
        ))}

        {dateFieldHint ? (
          <span
            className="hidden shrink-0 text-[10px] text-zinc-400 sm:inline dark:text-zinc-500"
            title={dateFieldHint}
          >
            · 캘린더
          </span>
        ) : null}

        <span className="mx-0.5 hidden h-3.5 w-px shrink-0 bg-zinc-300 sm:inline dark:bg-zinc-600" aria-hidden />

        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          표시
        </span>
        <button
          type="button"
          className={chipBtn(pageSize === "all")}
          onClick={() => onPageSizeChange("all")}
        >
          전체
        </button>
        {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            className={chipBtn(pageSize === n)}
            onClick={() => onPageSizeChange(n)}
          >
            {n}개
          </button>
        ))}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <p className="min-w-0 text-[10px] text-zinc-600 dark:text-zinc-400">
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
                  <span className="text-zinc-400"> … 외 {hiddenCount}건</span>
                ) : showAll &&
                    pageSize !== "all" &&
                    typeof pageSize === "number" &&
                    totalFiltered > pageSize ? (
                  <span className="text-zinc-400"> (전체)</span>
                ) : null}
              </>
            )}
          </p>
          {showMore ? (
            <button type="button" onClick={onShowAll} className={chipBtn(false)}>
              더보기
            </button>
          ) : null}
          {columnVisibility ? (
            <TableColumnProperties
              allKeys={columnVisibility.allKeys}
              hiddenColumns={columnVisibility.hiddenColumns}
              onSetVisible={columnVisibility.onSetVisible}
              onShowAll={columnVisibility.onShowAllColumns}
              labelForKey={columnVisibility.columnLabel}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
