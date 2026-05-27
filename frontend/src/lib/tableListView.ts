import {
  calendarRangeForDay,
  calendarRangeForMonth,
  calendarRangeForWeek,
} from "@/lib/calendarWindow";
import { normalizeSheetDateYmd, seoulYmdPartsNow, ymdFromParts } from "@/lib/sheetDates";

export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 300, 500] as const;
export type TablePageSizeNumber = (typeof TABLE_PAGE_SIZE_OPTIONS)[number];
export type TablePageSize = TablePageSizeNumber | "all";
export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 10;

export type TableListPageId =
  | "announcement-date"
  | "progress"
  | "launching"
  | "contracts"
  | "tasks"
  | "upload-rows"
  | "platforms";

/** 캘린더 창과 동일한 날짜 열 (OR 매칭) */
export const TABLE_LIST_DATE_FIELDS: Record<TableListPageId, string[]> = {
  "announcement-date": ["발표일"],
  progress: ["발표일", "마지막업데이트날짜"],
  launching: ["런칭일", "업로드일"],
  contracts: ["발표일", "마지막업데이트날짜"],
  tasks: ["마감일"],
  "upload-rows": ["업로드일", "런칭일", "다음업로드일"],
  platforms: ["발표일", "마지막업데이트날짜"],
};

export type DateRangePreset =
  | "all"
  | "today"
  | "week"
  | "month"
  | "months1"
  | "months3"
  | "months6"
  | "months12"
  | "custom";

const DATE_PRESET_VALUES: DateRangePreset[] = [
  "all",
  "today",
  "week",
  "month",
  "months1",
  "months3",
  "months6",
  "months12",
  "custom",
];

function subtractCalendarMonths(y: number, m: number, d: number, months: number) {
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() - months);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

function rollingMonthsRange(months: number): { from: string; to: string } {
  const { year, month, day } = seoulYmdPartsNow();
  const to = ymdFromParts(year, month, day);
  const start = subtractCalendarMonths(year, month, day, months);
  const from = ymdFromParts(start.y, start.m, start.d);
  return { from, to };
}

export type DateRangeFilter = {
  preset: DateRangePreset;
  fromYmd: string;
  toYmd: string;
};

export function ymdInRange(ymd: string | null, from: string, to: string): boolean {
  if (!ymd) return false;
  return from <= ymd && ymd <= to;
}

export function rowMatchesDateRange(
  row: Record<string, unknown>,
  dateFieldNames: string[],
  from: string,
  to: string,
): boolean {
  if (!from || !to) return true;
  for (const name of dateFieldNames) {
    const raw = row[name];
    if (raw == null || String(raw).trim() === "") continue;
    const ymd = normalizeSheetDateYmd(String(raw));
    if (ymdInRange(ymd, from, to)) return true;
  }
  return false;
}

export function filterRowsByDateRange<T extends Record<string, unknown>>(
  items: T[],
  dateFieldNames: string[],
  range: DateRangeFilter,
): T[] {
  if (range.preset === "all") return items;
  const { from, to } = resolveDateRangeYmd(range);
  if (!from || !to) return items;
  return items.filter((row) => rowMatchesDateRange(row, dateFieldNames, from, to));
}

export function resolveDateRangeYmd(filter: DateRangeFilter): { from: string; to: string } {
  const { year, month, day } = seoulYmdPartsNow();
  const today = ymdFromParts(year, month, day);

  if (filter.preset === "all") {
    return { from: "", to: "" };
  }
  if (filter.preset === "today") {
    return calendarRangeForDay(today);
  }
  if (filter.preset === "week") {
    return calendarRangeForWeek(year, month, day);
  }
  if (filter.preset === "month") {
    return calendarRangeForMonth(year, month);
  }
  if (filter.preset === "months1") return rollingMonthsRange(1);
  if (filter.preset === "months3") return rollingMonthsRange(3);
  if (filter.preset === "months6") return rollingMonthsRange(6);
  if (filter.preset === "months12") return rollingMonthsRange(12);
  const from = normalizeSheetDateYmd(filter.fromYmd) ?? "";
  const to = normalizeSheetDateYmd(filter.toYmd) ?? "";
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

export function dateRangeLabel(filter: DateRangeFilter): string {
  if (filter.preset === "all") return "전체 기간";
  const { from, to } = resolveDateRangeYmd(filter);
  if (!from && !to) return "전체 기간";
  if (filter.preset === "today") return `오늘 (${from})`;
  if (filter.preset === "week") return `이번 주 (${from} ~ ${to})`;
  if (filter.preset === "month") return `이번 달 (${from} ~ ${to})`;
  if (filter.preset === "months1") return `최근 1개월 (${from} ~ ${to})`;
  if (filter.preset === "months3") return `최근 3개월 (${from} ~ ${to})`;
  if (filter.preset === "months6") return `최근 6개월 (${from} ~ ${to})`;
  if (filter.preset === "months12") return `최근 12개월 (${from} ~ ${to})`;
  return `${from || "…"} ~ ${to || "…"}`;
}

function storageKey(pageId: TableListPageId, suffix: string) {
  return `table_list.${pageId}.${suffix}`;
}

export function loadTablePageSize(pageId: TableListPageId): TablePageSize {
  if (typeof window === "undefined") return DEFAULT_TABLE_PAGE_SIZE;
  try {
    const raw = localStorage.getItem(storageKey(pageId, "pageSize"));
    if (raw === "all") return "all";
    const n = Number(raw);
    if (TABLE_PAGE_SIZE_OPTIONS.includes(n as TablePageSizeNumber)) return n as TablePageSizeNumber;
  } catch {
    /* ignore */
  }
  return DEFAULT_TABLE_PAGE_SIZE;
}

export function saveTablePageSize(pageId: TableListPageId, size: TablePageSize) {
  try {
    localStorage.setItem(storageKey(pageId, "pageSize"), String(size));
  } catch {
    /* ignore */
  }
}

export function loadDateRangeFilter(pageId: TableListPageId): DateRangeFilter {
  const fallback: DateRangeFilter = { preset: "all", fromYmd: "", toYmd: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey(pageId, "dateRange"));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DateRangeFilter>;
    const preset = parsed.preset;
    if (preset && DATE_PRESET_VALUES.includes(preset)) {
      return {
        preset,
        fromYmd: typeof parsed.fromYmd === "string" ? parsed.fromYmd : "",
        toYmd: typeof parsed.toYmd === "string" ? parsed.toYmd : "",
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveDateRangeFilter(pageId: TableListPageId, filter: DateRangeFilter) {
  try {
    localStorage.setItem(storageKey(pageId, "dateRange"), JSON.stringify(filter));
  } catch {
    /* ignore */
  }
}

export function sliceTableRows<T>(items: T[], pageSize: TablePageSize, showAll: boolean): {
  displayed: T[];
  hiddenCount: number;
  total: number;
} {
  const total = items.length;
  const limit = pageSize === "all" || showAll ? total : pageSize;
  const displayed = items.slice(0, limit);
  const hiddenCount = Math.max(0, total - displayed.length);
  return { displayed, hiddenCount, total };
}
