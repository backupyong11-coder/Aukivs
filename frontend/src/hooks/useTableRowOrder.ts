"use client";

import { useCallback, useMemo, useState } from "react";

type Listish<T> = ReadonlyArray<T>;

function loadOrder(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * 행(row) 수동 순서 관리 hook.
 *
 * - 그립 핸들에 `getSourceProps(id)` 를 spread
 * - 행(`<tr>`)에 `getDropTargetProps(id)` 를 spread
 * - 표시할 정렬·필터된 배열을 `sortByOrder(visible)` 로 감싸서 페이지네이션 hook에 전달
 *
 * 순서는 `localStorage`에만 저장됩니다(브라우저 단위 개인 설정).
 */
export function useTableRowOrder<T>(
  storageKey: string,
  items: Listish<T>,
  getId: (it: T) => string,
) {
  const [orderMap, setOrderMap] = useState<Record<string, number>>(() => loadOrder(storageKey));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const hasManualOrder = useMemo(() => Object.keys(orderMap).length > 0, [orderMap]);

  const sortByOrder = useCallback(
    <U extends T>(arr: ReadonlyArray<U>): U[] => {
      if (!hasManualOrder) return [...arr];
      const indexed = arr.map((item, i) => {
        const idx = orderMap[getId(item)];
        return { item, idx: idx === undefined ? Number.POSITIVE_INFINITY : idx, fallback: i };
      });
      indexed.sort((a, b) => {
        if (a.idx !== b.idx) return a.idx - b.idx;
        return a.fallback - b.fallback;
      });
      return indexed.map((x) => x.item);
    },
    [hasManualOrder, orderMap, getId],
  );

  const persistOrder = useCallback(
    (next: Record<string, number>) => {
      setOrderMap(next);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        }
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const move = useCallback(
    (sourceId: string, targetId: string) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const ordered = sortByOrder(items);
      const ids = ordered.map(getId);
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      const next: Record<string, number> = {};
      ids.forEach((id, idx) => {
        next[id] = idx;
      });
      persistOrder(next);
    },
    [items, getId, sortByOrder, persistOrder],
  );

  const reset = useCallback(() => {
    setOrderMap({});
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const getSourceProps = useCallback(
    (id: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", id);
        } catch {
          /* ignore */
        }
        setDraggingId(id);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverId(null);
      },
    }),
    [],
  );

  const getDropTargetProps = useCallback(
    (id: string) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overId !== id) setOverId(id);
      },
      onDragLeave: () => {
        setOverId((cur) => (cur === id ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const src = draggingId ?? (e.dataTransfer.getData("text/plain") || "");
        if (!src) return;
        move(src, id);
        setDraggingId(null);
        setOverId(null);
      },
    }),
    [draggingId, overId, move],
  );

  return {
    sortByOrder,
    hasManualOrder,
    draggingId,
    overId,
    reset,
    getSourceProps,
    getDropTargetProps,
  };
}
