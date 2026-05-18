import { getApiBaseUrl } from "@/lib/apiBase";
import type { MemoItem } from "@/lib/memos";
import type { WorksMasterItem } from "@/lib/worksMaster";

export type CalendarWindowPayload = {
  uploadRows: Record<string, string>[];
  allTasks: Record<string, string>[];
  memos: MemoItem[];
  worksMaster: WorksMasterItem[];
};

export type CalendarWindowResult =
  | { ok: true; data: CalendarWindowPayload }
  | { ok: false; message: string };

export function calendarRangeForMonth(year: number, month: number): { from: string; to: string } {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const pad = (d: Date, days: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x.toISOString().slice(0, 10);
  };
  return { from: pad(first, -7), to: pad(last, 7) };
}

export function calendarRangeForWeek(y: number, m: number, d: number): { from: string; to: string } {
  const start = new Date(y, m - 1, d);
  const pad = (dt: Date, days: number) => {
    const x = new Date(dt);
    x.setDate(x.getDate() + days);
    return x.toISOString().slice(0, 10);
  };
  return { from: pad(start, -1), to: pad(start, 8) };
}

export function calendarRangeForDay(ymd: string): { from: string; to: string } {
  return { from: ymd, to: ymd };
}

const CACHE_PREFIX = "calendar_window_v1:";
const CACHE_TTL_MS = 90_000;

function cacheKey(from: string, to: string) {
  return `${CACHE_PREFIX}${from}_${to}`;
}

function readCache(from: string, to: string): CalendarWindowPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(from, to));
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: CalendarWindowPayload };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(from: string, to: string, data: CalendarWindowPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(cacheKey(from, to), JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}

export function invalidateCalendarWindowCache(from?: string, to?: string) {
  if (typeof window === "undefined") return;
  try {
    if (from && to) {
      sessionStorage.removeItem(cacheKey(from, to));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export async function fetchCalendarWindow(
  from: string,
  to: string,
  init?: RequestInit,
  options?: { skipCache?: boolean },
): Promise<CalendarWindowResult> {
  if (!options?.skipCache) {
    const cached = readCache(from, to);
    if (cached) return { ok: true, data: cached };
  }

  try {
    const q = new URLSearchParams({ from_ymd: from, to_ymd: to });
    const res = await fetch(`${getApiBaseUrl()}/hub/calendar-window?${q}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, message: raw || `HTTP ${res.status}` };
    }
    const data = JSON.parse(raw) as CalendarWindowPayload;
    writeCache(from, to, data);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return {
      ok: false,
      message: e instanceof Error ? e.message : "캘린더 데이터를 불러오지 못했습니다.",
    };
  }
}
