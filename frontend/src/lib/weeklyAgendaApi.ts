import { getApiBaseUrl } from "@/lib/apiBase";
import {
  parseWeeklyAgendaWorkbook,
  type WeeklyAgendaWorkbook,
} from "@/lib/weeklyAgendaStorage";

export type FetchWeeklyAgendaResult =
  | { ok: true; workbook: WeeklyAgendaWorkbook | null; updatedAt: string | null }
  | { ok: false; message: string; status?: number };

export type SaveWeeklyAgendaResult =
  | { ok: true; updatedAt: string | null }
  | { ok: false; message: string; status?: number };

function formatHttpDetail(status: number, raw: string): string {
  try {
    const j = JSON.parse(raw) as { detail?: unknown };
    if (typeof j.detail === "string") return `HTTP ${status}: ${j.detail}`;
  } catch {
    /* use raw */
  }
  return `HTTP ${status}: ${raw.slice(0, 200)}`;
}

export function userFacingWeeklyAgendaError(status: number, raw: string, op: "fetch" | "save"): string {
  if (status === 401) {
    return "데모 접근 코드가 필요합니다. /demo-login 에서 로그인해 주세요.";
  }
  if (status === 503) {
    return op === "fetch"
      ? "주간 아젠다 서버(Supabase) 설정을 확인할 수 없습니다."
      : "주간 아젠다를 서버에 저장할 수 없습니다. Supabase 설정을 확인하세요.";
  }
  if (status >= 500) {
    return "주간 아젠다 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  const detail = formatHttpDetail(status, raw);
  return detail.length > 180 ? `${detail.slice(0, 180)}…` : detail;
}

export async function fetchWeeklyAgendaFromServer(): Promise<FetchWeeklyAgendaResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/weekly-agenda`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: userFacingWeeklyAgendaError(res.status, raw, "fetch"),
      };
    }
    let j: { workbook?: unknown; updated_at?: string | null };
    try {
      j = JSON.parse(raw) as { workbook?: unknown; updated_at?: string | null };
    } catch {
      return { ok: false, message: "서버 응답을 읽을 수 없습니다." };
    }
    if (j.workbook == null) {
      return { ok: true, workbook: null, updatedAt: j.updated_at ?? null };
    }
    const wb = parseWeeklyAgendaWorkbook(j.workbook);
    if (!wb) {
      return { ok: false, message: "서버에 저장된 주간 아젠다 형식이 올바르지 않습니다." };
    }
    return { ok: true, workbook: wb, updatedAt: j.updated_at ?? null };
  } catch {
    return { ok: false, message: "주간 아젠다 서버에 연결할 수 없습니다." };
  }
}

export async function saveWeeklyAgendaToServer(
  workbook: WeeklyAgendaWorkbook,
): Promise<SaveWeeklyAgendaResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/weekly-agenda`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workbook }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        message: userFacingWeeklyAgendaError(res.status, raw, "save"),
      };
    }
    let updatedAt: string | null = null;
    try {
      const j = JSON.parse(raw) as { updated_at?: string | null };
      updatedAt = j.updated_at ?? null;
    } catch {
      /* ok without body */
    }
    return { ok: true, updatedAt };
  } catch {
    return { ok: false, message: "주간 아젠다 서버에 연결할 수 없습니다." };
  }
}
