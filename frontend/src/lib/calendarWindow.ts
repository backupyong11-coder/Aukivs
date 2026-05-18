import { getApiBaseUrl } from "@/lib/apiBase";
import { fetchMemos, type MemoItem } from "@/lib/memos";
import { normalizeSheetDateYmd } from "@/lib/sheetDates";
import { fetchTasks } from "@/lib/tasks";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";

function shouldFallbackFromHub(status: number): boolean {
  return status === 404 || status === 405;
}

function hubErrorMessage(status: number, raw: string): string {
  if (status === 401) {
    try {
      const j = JSON.parse(raw) as { error?: string };
      if (j.error) return j.error;
    } catch {
      /* ignore */
    }
    return "데모 접근 코드가 필요합니다. /demo-login 에서 로그인해 주세요.";
  }
  return raw || `HTTP ${status}`;
}

function ymdInRange(ymd: string | null, from: string, to: string): boolean {
  if (!ymd) return false;
  return from <= ymd && ymd <= to;
}

function filterUploadRows(
  rows: Record<string, string>[],
  from: string,
  to: string,
): Record<string, string>[] {
  return rows.filter((d) => {
    const up = normalizeSheetDateYmd(d["업로드일"] ?? "");
    const launch = normalizeSheetDateYmd(d["런칭일"] ?? "");
    return ymdInRange(up, from, to) || ymdInRange(launch, from, to);
  });
}

function filterTasks(
  rows: Record<string, string>[],
  from: string,
  to: string,
): Record<string, string>[] {
  return rows.filter((d) => ymdInRange(normalizeSheetDateYmd(d["마감일"] ?? ""), from, to));
}

function filterMemos(items: MemoItem[], from: string, to: string): MemoItem[] {
  const out: MemoItem[] = [];
  for (const m of items) {
    const ymd = normalizeSheetDateYmd(m.memo_date);
    if (ymdInRange(ymd, from, to)) out.push(m);
  }
  return out.slice(0, 200);
}

async function fetchUploadRowsList(init?: RequestInit): Promise<Record<string, string>[]> {
  const res = await fetch(`${getApiBaseUrl()}/upload-rows`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    if (!row || typeof row !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = v == null ? "" : String(v).trim();
    }
    return out;
  });
}

async function fetchCalendarWindowFallback(
  from: string,
  to: string,
  init?: RequestInit,
): Promise<CalendarWindowResult> {
  const [uploadRows, tasks, memos, works] = await Promise.all([
    fetchUploadRowsList(init),
    fetchTasks(),
    fetchMemos(init, 250),
    fetchWorksMaster(),
  ]);
  if (init?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const data: CalendarWindowPayload = {
    uploadRows: filterUploadRows(uploadRows, from, to),
    allTasks: tasks.ok ? filterTasks(tasks.items, from, to) : [],
    memos: memos.ok ? filterMemos(memos.items, from, to) : [],
    worksMaster: works.ok ? works.items : [],
  };
  writeCache(from, to, data);
  return { ok: true, data };
}

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
      if (shouldFallbackFromHub(res.status)) {
        return fetchCalendarWindowFallback(from, to, init);
      }
      return { ok: false, message: hubErrorMessage(res.status, raw) };
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
