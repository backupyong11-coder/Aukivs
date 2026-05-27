import type { TableListPageId } from "@/lib/tableListView";

export const DEFAULT_COLUMN_WIDTH_PX = 104;
export const MIN_COLUMN_WIDTH_PX = 56;
export const MAX_COLUMN_WIDTH_PX = 560;
export const TABLE_ACTION_COLUMN_WIDTH_PX = 72;

function storageKey(pageId: TableListPageId) {
  return `table_list.${pageId}.columnWidths`;
}

export function defaultWidthForField(field: string): number {
  if (
    field.includes("비고") ||
    field.includes("메모") ||
    field.includes("링크") ||
    field.includes("상황") ||
    field === "업무명" ||
    field === "작품명" ||
    field === "플랫폼명"
  ) {
    return 140;
  }
  if (field.includes("일") || field === "마감일") return 96;
  return DEFAULT_COLUMN_WIDTH_PX;
}

export function clampColumnWidth(px: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH_PX, Math.max(MIN_COLUMN_WIDTH_PX, px)));
}

export function loadColumnWidths(pageId: TableListPageId): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(pageId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "number" && Number.isFinite(v)) {
        out[k] = clampColumnWidth(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveColumnWidths(pageId: TableListPageId, widths: Record<string, number>) {
  try {
    localStorage.setItem(storageKey(pageId), JSON.stringify(widths));
  } catch {
    /* ignore */
  }
}

export function sumTableWidthPx(
  dataKeys: string[],
  getWidth: (key: string) => number,
  leadingActionCols = 0,
  trailingActionCols = 0,
  actionWidth = TABLE_ACTION_COLUMN_WIDTH_PX,
): number {
  let sum = (leadingActionCols + trailingActionCols) * actionWidth;
  for (const k of dataKeys) sum += getWidth(k);
  return sum;
}
