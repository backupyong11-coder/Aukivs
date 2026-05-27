import type { TableListPageId } from "@/lib/tableListView";

function storageKey(pageId: TableListPageId) {
  return `table_list.${pageId}.columnLabels`;
}

export function loadColumnLabels(pageId: TableListPageId): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(pageId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveColumnLabels(pageId: TableListPageId, labels: Record<string, string>) {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify(labels));
  } catch {
    /* ignore */
  }
}

export function columnDisplayLabel(
  field: string,
  labels: Record<string, string>,
  fallback?: string,
): string {
  return labels[field] ?? fallback ?? field;
}
