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
import {
  fetchColumnWidthsFromServer,
  saveColumnWidthsToServer,
} from "@/lib/tableListPreferencesApi";
import type { TableListPageId } from "@/lib/tableListView";

function mergeWidths(
  server: Record<string, number>,
  local: Record<string, number>,
  dataKeys: string[],
): Record<string, number> {
  const out: Record<string, number> = { ...local };
  for (const [k, v] of Object.entries(server)) {
    out[k] = v;
  }
  for (const key of dataKeys) {
    if (out[key] === undefined) {
      out[key] = defaultWidthForField(key);
    }
  }
  return out;
}

export function useTableColumnWidths(pageId: TableListPageId, dataKeys: string[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    loadColumnWidths(pageId),
  );
  const [syncedFromServer, setSyncedFromServer] = useState(false);
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchColumnWidthsFromServer(pageId);
      if (cancelled) return;
      if (res.ok) {
        const local = loadColumnWidths(pageId);
        if (Object.keys(res.columnWidths).length > 0) {
          const merged = mergeWidths(res.columnWidths, local, dataKeys);
          setWidths(merged);
          saveColumnWidths(pageId, merged);
        } else if (Object.keys(local).length > 0) {
          const merged = mergeWidths({}, local, dataKeys);
          void saveColumnWidthsToServer(pageId, merged);
        }
      }
      setSyncedFromServer(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

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
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;
      void saveColumnWidthsToServer(pageId, next).finally(() => {
        saveInFlightRef.current = false;
      });
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

  return {
    getWidth,
    startResize,
    tableMinWidth,
    tableStyle,
    actionWidth: TABLE_ACTION_COLUMN_WIDTH_PX,
    syncedFromServer,
  };
}
