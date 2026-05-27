import type { TableListPageId } from "@/lib/tableListView";

function storageKey(pageId: TableListPageId) {
  return `table_list.${pageId}.hiddenColumns`;
}

export function loadHiddenColumns(pageId: TableListPageId): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(pageId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is string => typeof k === "string" && k !== ""));
  } catch {
    return new Set();
  }
}

export function saveHiddenColumns(pageId: TableListPageId, hidden: Set<string>) {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify([...hidden]));
  } catch {
    /* ignore */
  }
}

export function filterVisibleColumnKeys(orderedKeys: string[], hidden: Set<string>): string[] {
  const visible = orderedKeys.filter((k) => !hidden.has(k));
  return visible.length > 0 ? visible : orderedKeys.slice(0, 1);
}
