"use client";

import { useCallback, useState } from "react";
import {
  columnDisplayLabel,
  loadColumnLabels,
  saveColumnLabels,
} from "@/lib/tableColumnLabels";
import type { TableListPageId } from "@/lib/tableListView";

export function useColumnLabels(pageId: TableListPageId) {
  const [labels, setLabels] = useState<Record<string, string>>(() => loadColumnLabels(pageId));

  const getLabel = useCallback(
    (field: string, fallback?: string) => columnDisplayLabel(field, labels, fallback),
    [labels],
  );

  const editLabel = useCallback(
    (field: string, fallback?: string) => {
      const current = columnDisplayLabel(field, labels, fallback);
      const next = window.prompt("열 표시 이름", current);
      if (next === null) return;
      const trimmed = next.trim();
      setLabels((prev) => {
        const updated = { ...prev };
        if (!trimmed || trimmed === (fallback ?? field)) {
          delete updated[field];
        } else {
          updated[field] = trimmed;
        }
        saveColumnLabels(pageId, updated);
        return updated;
      });
    },
    [labels, pageId],
  );

  return { getLabel, editLabel };
}
