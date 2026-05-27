"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampColumnWidth,
  defaultWidthForField,
  loadColumnWidths,
  saveColumnWidths,
  sumTableWidthPx,
  TABLE_ACTION_COLUMN_WIDTH_PX,
} from "@/lib/tableColumnWidths";
import type { TableListPageId } from "@/lib/tableListView";

export function useTableColumnWidths(pageId: TableListPageId, dataKeys: string[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() => loadColumnWidths(pageId));
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    setWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of dataKeys) {
        if (next[key] === undefined) {
          next[key] = defaultWidthForField(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dataKeys]);

  const getWidth = useCallback(
    (key: string) => widths[key] ?? defaultWidthForField(key),
    [widths],
  );

  const persist = useCallback(
    (next: Record<string, number>) => {
      saveColumnWidths(pageId, next);
    },
    [pageId],
  );

  const startResize = useCallback(
    (key: string, clientX: number) => {
      const startW = getWidth(key);
      resizeRef.current = { key, startX: clientX, startW };

      const onMove = (e: MouseEvent) => {
        if (!resizeRef.current) return;
        const delta = e.clientX - resizeRef.current.startX;
        const w = clampColumnWidth(resizeRef.current.startW + delta);
        setWidths((prev) => ({ ...prev, [resizeRef.current!.key]: w }));
      };

      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setWidths((prev) => {
          persist(prev);
          return prev;
        });
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [getWidth, persist],
  );

  const tableMinWidth = useCallback(
    (leadingActionCols: number, trailingActionCols: number) =>
      sumTableWidthPx(
        dataKeys,
        getWidth,
        leadingActionCols,
        trailingActionCols,
        TABLE_ACTION_COLUMN_WIDTH_PX,
      ),
    [dataKeys, getWidth],
  );

  const tableStyle = useMemo(
    () => ({ tableLayout: "fixed" as const, width: "100%" as const }),
    [],
  );

  return { getWidth, startResize, tableMinWidth, tableStyle, actionWidth: TABLE_ACTION_COLUMN_WIDTH_PX };
}
