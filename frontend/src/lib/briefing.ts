import { getApiBaseUrl } from "@/lib/apiBase";

export type BriefingSummary = {
  today_checklist_count: number;
  overdue_checklist_count: number;
  today_upload_count: number;
  overdue_upload_count: number;
};

export type BriefingUrgentItem = {
  uid: string;
  id: string;
  source: "checklist" | "upload";
  title: string;
  note: string | null;
  uploaded_at: string | null;
};

export type BriefingTodayPayload = {
  briefing_text: string;
  summary: BriefingSummary;
  urgent_items: BriefingUrgentItem[];
  warnings: string[];
};

export type FetchBriefingTodayResult =
  | { ok: true; payload: BriefingTodayPayload }
  | { ok: false; message: string };

function parseBriefingToday(raw: unknown): BriefingTodayPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.briefing_text !== "string" || !o.summary || typeof o.summary !== "object") {
    return null;
  }
  const s = o.summary as Record<string, unknown>;
  const nums = [
    "today_checklist_count",
    "overdue_checklist_count",
    "today_upload_count",
    "overdue_upload_count",
  ] as const;
  for (const k of nums) {
    if (typeof s[k] !== "number" || !Number.isFinite(s[k])) return null;
  }
  const summary: BriefingSummary = {
    today_checklist_count: s.today_checklist_count as number,
    overdue_checklist_count: s.overdue_checklist_count as number,
    today_upload_count: s.today_upload_count as number,
    overdue_upload_count: s.overdue_upload_count as number,
  };
  if (!Array.isArray(o.urgent_items)) return null;
  const urgent_items: BriefingUrgentItem[] = [];
  for (const row of o.urgent_items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.uid !== "string" || typeof r.id !== "string" || typeof r.title !== "string") {
      continue;
    }
    if (r.source !== "checklist" && r.source !== "upload") continue;
    const note =
      r.note === null || r.note === undefined
        ? null
        : typeof r.note === "string"
          ? r.note
          : null;
    const uploaded_at =
      r.uploaded_at === null || r.uploaded_at === undefined
        ? null
        : typeof r.uploaded_at === "string"
          ? r.uploaded_at
          : null;
    urgent_items.push({
      uid: r.uid,
      id: r.id,
      source: r.source,
      title: r.title,
      note,
      uploaded_at,
    });
  }
  const warnings: string[] = [];
  if (Array.isArray(o.warnings)) {
    for (const w of o.warnings) {
      if (typeof w === "string") warnings.push(w);
    }
  }
  return {
    briefing_text: o.briefing_text,
    summary,
    urgent_items,
    warnings,
  };
}

export async function fetchBriefingToday(
  init?: RequestInit,
): Promise<FetchBriefingTodayResult> {
  const base = getApiBaseUrl();

  try {
    const res = await fetch(`${base}/briefing/today`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
    const rawText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}: ${rawText}`,
      };
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      const payload = parseBriefingToday(parsed);
      if (!payload) {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true, payload };
    } catch {
      return { ok: false, message: "응답이 올바른 JSON이 아닙니다." };
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e;
    }
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "백엔드에 연결할 수 없습니다. FastAPI가 실행 중인지 확인하세요.",
    };
  }
}
