import { getApiBaseUrl } from "@/lib/apiBase";

/** GET /tasks — 업무정리 시트 행(dict, 한글 키) */
export type TaskSheetRow = Record<string, string>;

export async function fetchTasks(): Promise<
  { ok: true; items: TaskSheetRow[] } | { ok: false; message: string }
> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/tasks`, {
      headers: { Accept: "application/json" },
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${rawText}` };
    }
    const parsed: unknown = JSON.parse(rawText);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: "응답이 배열이 아닙니다." };
    }
    const items: TaskSheetRow[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const out: TaskSheetRow = {};
      for (const [k, v] of Object.entries(rec)) {
        out[k] = v == null ? "" : String(v);
      }
      items.push(out);
    }
    return { ok: true, items };
  } catch (e: unknown) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "요청 중 오류가 발생했습니다.",
    };
  }
}
