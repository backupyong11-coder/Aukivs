"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_TABLE_PAGE_SIZE,
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
  options?: { dateFields?: string[] },
) {
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
    loadDateRangeFilter(pageId),
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
      saveDateRangeFilter(pageId, next);
      setShowAll(false);
    },
    [pageId],
  );

  const setDatePreset = useCallback(
    (preset: DateRangePreset) => {
      setDateFilterState((prev) => {
        const next = { ...prev, preset };
        saveDateRangeFilter(pageId, next);
        return next;
      });
      setShowAll(false);
    },
    [pageId],
  );

  const setCustomFrom = useCallback(
    (fromYmd: string) => {
      setDateFilterState((prev) => {
        const next = { ...prev, preset: "custom" as const, fromYmd };
        saveDateRangeFilter(pageId, next);
        return next;
      });
      setShowAll(false);
    },
    [pageId],
  );

  const setCustomTo = useCallback(
    (toYmd: string) => {
      setDateFilterState((prev) => {
        const next = { ...prev, preset: "custom" as const, toYmd };
        saveDateRangeFilter(pageId, next);
        return next;
      });
      setShowAll(false);
    },
    [pageId],
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
