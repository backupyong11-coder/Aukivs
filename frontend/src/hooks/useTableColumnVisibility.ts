"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterVisibleColumnKeys,
  loadHiddenColumns,
  saveHiddenColumns,
} from "@/lib/tableColumnVisibility";
import type { TableListPageId } from "@/lib/tableListView";

export function useTableColumnVisibility(pageId: TableListPageId, orderedKeys: string[]) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
    loadHiddenColumns(pageId),
  );

  useEffect(() => {
    setHiddenColumns((prev) => {
      const next = new Set<string>();
      for (const k of prev) {
        if (orderedKeys.includes(k)) next.add(k);
      }
      return next;
    });
  }, [orderedKeys]);

  const visibleKeys = useMemo(
    () => filterVisibleColumnKeys(orderedKeys, hiddenColumns),
    [orderedKeys, hiddenColumns],
  );

  const hiddenKeys = useMemo(
    () => orderedKeys.filter((k) => hiddenColumns.has(k)),
    [orderedKeys, hiddenColumns],
  );

  const persist = useCallback(
    (next: Set<string>) => {
      setHiddenColumns(next);
      saveHiddenColumns(pageId, next);
    },
    [pageId],
  );

  const setColumnVisible = useCallback(
    (key: string, visible: boolean) => {
      if (!orderedKeys.includes(key)) return;
      persist(
        (() => {
          const next = new Set(hiddenColumns);
          if (visible) {
            next.delete(key);
          } else {
            const wouldHide = new Set(next);
            wouldHide.add(key);
            const remaining = orderedKeys.filter((k) => !wouldHide.has(k));
            if (remaining.length === 0) return hiddenColumns;
            next.add(key);
          }
          return next;
        })(),
      );
    },
    [hiddenColumns, orderedKeys, persist],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      setColumnVisible(key, hiddenColumns.has(key));
    },
    [hiddenColumns, setColumnVisible],
  );

  const showAllColumns = useCallback(() => {
    persist(new Set());
  }, [persist]);

  return {
    visibleKeys,
    hiddenColumns,
    hiddenKeys,
    hiddenCount: hiddenKeys.length,
    setColumnVisible,
    toggleColumn,
    showAllColumns,
  };
}
