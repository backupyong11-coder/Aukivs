"use client";

import { useCallback, useMemo, useState } from "react";
import {
  TABLE_LIST_DATE_FIELDS,
  type DateRangeFilter,
  type DateRangePreset,
  type TableListPageId,
  type TablePageSize,
  filterRowsByDateRange,
  loadDateRangeFilter,
  loadTablePageSize,
  saveDateRangeFilter,
  saveTablePageSize,
  sliceTableRows,
} from "@/lib/tableListView";

export function useTableListDisplay<T extends Record<string, unknown>>(
  pageId: TableListPageId,
  items: T[],
  options?: {
    dateFields?: string[];
    defaultDateFilter?: DateRangeFilter;
    /** false면 기간 필터를 localStorage에 저장하지 않고, 진입 시 defaultDateFilter로 시작 */
    persistDateFilter?: boolean;
  },
) {
  const persistDateFilter = options?.persistDateFilter !== false;
  const dateFieldNames = useMemo(
    () =>
      (options?.dateFields?.length ? options.dateFields : TABLE_LIST_DATE_FIELDS[pageId]).filter(
        Boolean,
      ),
    [pageId, options?.dateFields],
  );

  const [pageSize, setPageSizeState] = useState<TablePageSize>(() => loadTablePageSize(pageId));
  const [showAll, setShowAll] = useState(false);
  const [dateFilter, setDateFilterState] = useState<DateRangeFilter>(() =>
    persistDateFilter
      ? loadDateRangeFilter(pageId, options?.defaultDateFilter)
      : (options?.defaultDateFilter ?? { preset: "all", fromYmd: "", toYmd: "" }),
  );

  const setPageSize = useCallback(
    (size: TablePageSize) => {
      setPageSizeState(size);
      saveTablePageSize(pageId, size);
      setShowAll(false);
    },
    [pageId],
  );

  const setDateFilter = useCallback(
    (next: DateRangeFilter) => {
      setDateFilterState(next);
      if (persistDateFilter) saveDateRangeFilter(pageId, next);
      setShowAll(false);
    },
    [pageId, persistDateFilter],
  );

  const setDatePreset = useCallback(
    (preset: DateRangePreset) => {
      setDateFilterState((prev) => {
        const next = { ...prev, preset };
        if (persistDateFilter) saveDateRangeFilter(pageId, next);
        return next;
      });
      setShowAll(false);
    },
    [pageId, persistDateFilter],
  );

  const setCustomFrom = useCallback(
    (fromYmd: string) => {
      setDateFilterState((prev) => {
        const next = { ...prev, preset: "custom" as const, fromYmd };
        if (persistDateFilter) saveDateRangeFilter(pageId, next);
        return next;
      });
      setShowAll(false);
    },
    [pageId, persistDateFilter],
  );

  const setCustomTo = useCallback(
    (toYmd: string) => {
      setDateFilterState((prev) => {
        const next = { ...prev, preset: "custom" as const, toYmd };
        if (persistDateFilter) saveDateRangeFilter(pageId, next);
        return next;
      });
      setShowAll(false);
    },
    [pageId, persistDateFilter],
  );

  const dateFiltered = useMemo(
    () => filterRowsByDateRange(items, dateFieldNames, dateFilter),
    [items, dateFieldNames, dateFilter],
  );

  const { displayed, hiddenCount, total } = useMemo(
    () => sliceTableRows(dateFiltered, pageSize, showAll),
    [dateFiltered, pageSize, showAll],
  );

  return {
    pageSize,
    setPageSize,
    showAll,
    setShowAll,
    dateFilter,
    setDateFilter,
    setDatePreset,
    setCustomFrom,
    setCustomTo,
    dateFieldNames,
    dateFiltered,
    displayed,
    hiddenCount,
    totalFiltered: total,
    dateExcludedCount: Math.max(0, items.length - dateFiltered.length),
  };
}
