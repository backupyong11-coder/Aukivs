import { getApiBaseUrl } from "@/lib/apiBase";

export type WeeklyMeetingMinutesActionItem = {
  text: string;
  owner?: string;
  due?: string;
  done?: boolean;
};

export type WeeklyMeetingMinutesItem = {
  week_start: string;
  title: string;
  content: string;
  attendees: string[];
  decisions: string[];
  action_items: WeeklyMeetingMinutesActionItem[];
  status: string;
  tags: string[];
  created_at?: string | null;
  updated_at?: string | null;
};

type ListResult =
  | { ok: true; items: WeeklyMeetingMinutesItem[] }
  | { ok: false; message: string };

type UpsertResult =
  | { ok: true; item: WeeklyMeetingMinutesItem }
  | { ok: false; message: string };

type DeleteResult = { ok: true } | { ok: false; message: string };

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { detail?: string | unknown[] };
    if (typeof j.detail === "string") return j.detail;
    return text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

export async function fetchWeeklyMeetingMinutes(opts?: {
  fromYmd?: string;
  toYmd?: string;
}): Promise<ListResult> {
  try {
    const url = new URL(`${getApiBaseUrl()}/weekly-meeting-minutes`);
    if (opts?.fromYmd) url.searchParams.set("from_ymd", opts.fromYmd);
    if (opts?.toYmd) url.searchParams.set("to_ymd", opts.toYmd);
    const res = await fetch(url.toString());
    if (!res.ok) return { ok: false, message: await readError(res) };
    const j = (await res.json()) as { items?: WeeklyMeetingMinutesItem[] };
    return { ok: true, items: Array.isArray(j.items) ? j.items : [] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "주간 회의록 불러오기 실패" };
  }
}

export async function fetchWeeklyMeetingMinutesOne(
  weekStart: string,
): Promise<WeeklyMeetingMinutesItem | null> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/weekly-meeting-minutes/${encodeURIComponent(weekStart)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as WeeklyMeetingMinutesItem;
  } catch {
    return null;
  }
}

export async function upsertWeeklyMeetingMinutes(
  payload: Partial<WeeklyMeetingMinutesItem> & { week_start: string },
): Promise<UpsertResult> {
  try {
    const body = {
      week_start: payload.week_start,
      title: payload.title ?? null,
      content: payload.content ?? null,
      attendees: payload.attendees ?? [],
      decisions: payload.decisions ?? [],
      action_items: payload.action_items ?? [],
      status: payload.status ?? null,
      tags: payload.tags ?? [],
    };
    const res = await fetch(`${getApiBaseUrl()}/weekly-meeting-minutes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    const j = (await res.json()) as { item: WeeklyMeetingMinutesItem };
    return { ok: true, item: j.item };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장 실패" };
  }
}

export async function deleteWeeklyMeetingMinutes(
  weekStart: string,
): Promise<DeleteResult> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/weekly-meeting-minutes/${encodeURIComponent(weekStart)}`,
      { method: "DELETE" },
    );
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "삭제 실패" };
  }
}

/** 임의 날짜가 속한 주의 월요일(YYYY-MM-DD)을 반환. */
export function mondayOfWeek(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  // 일요일=0, 월요일=1
  const dow = dt.getDay();
  const delta = (dow + 6) % 7; // 월요일까지 뺄 일수
  dt.setDate(dt.getDate() - delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** 주어진 주 월요일에 N주를 더한 월요일 */
export function addWeeksToMonday(mondayYmd: string, weeks: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(mondayYmd);
  if (!m) return mondayYmd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + weeks * 7);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** 같은 주에 속하는지(월~일 기준) */
export function isSameMeetingWeek(a: string, b: string): boolean {
  return mondayOfWeek(a) === mondayOfWeek(b);
}
