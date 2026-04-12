import { getApiBaseUrl } from "@/lib/apiBase";

export type ChecklistItem = {
  id: string;
  title: string;
  note: string | null;
  due_date?: string | null;
  platform?: string | null;
  category?: string | null;
};

/** due_date가 있으면 `[마감일] 업무명`, 없으면 업무명만 */
export function checklistDisplayTitle(item: ChecklistItem): string {
  const d = item.due_date?.trim();
  if (d) return `[${d}] ${item.title}`;
  return item.title;
}

export type FetchChecklistResult =
  | { ok: true; items: ChecklistItem[] }
  | { ok: false; message: string };

function parseDueDate(rec: Record<string, unknown>): string | null {
  if (!("due_date" in rec) || rec.due_date === null || rec.due_date === undefined) {
    return null;
  }
  return typeof rec.due_date === "string" ? rec.due_date : null;
}

function parseChecklistItems(raw: unknown): ChecklistItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: ChecklistItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.title !== "string") continue;
    const note = typeof rec.note === "string" ? rec.note : null;
    items.push({
      id: rec.id,
      title: rec.title,
      note,
      due_date: parseDueDate(rec),
      platform: typeof rec.platform === "string" ? rec.platform : null,
      category: typeof rec.category === "string" ? rec.category : null,
    });
  }
  return items;
}

export type CompleteChecklistResult =
  | { ok: true; completed: number }
  | { ok: false; message: string };

function formatHttpDetail(status: number, raw: string): string {
  try {
    const j = JSON.parse(raw) as { detail?: unknown };
    if (typeof j.detail === "string") return `HTTP ${status}: ${j.detail}`;
    if (Array.isArray(j.detail))
      return `HTTP ${status}: ${JSON.stringify(j.detail)}`;
  } catch {
    /* use raw */
  }
  return `HTTP ${status}: ${raw}`;
}

export type UpdateChecklistResult =
  | { ok: true }
  | { ok: false; message: string };

export type DeleteChecklistResult =
  | { ok: true }
  | { ok: false; message: string };

export type CreateChecklistResult =
  | { ok: true; item: ChecklistItem }
  | { ok: false; message: string };

export async function createChecklistItem(
  payload: { title: string; note: string | null },
  init?: RequestInit,
): Promise<CreateChecklistResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/checklist/create`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({
        title: payload.title,
        note: payload.note,
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      if (!parsed || typeof parsed !== "object") {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.id !== "string" || typeof rec.title !== "string") {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      const note = typeof rec.note === "string" ? rec.note : null;
      return {
        ok: true,
        item: {
          id: rec.id,
          title: rec.title,
          note,
          due_date: parseDueDate(rec),
        },
      };
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
          : "요청 중 오류가 발생했습니다.",
    };
  }
}

export async function updateChecklistItem(
  payload: { id: string; title: string; note: string | null },
  init?: RequestInit,
): Promise<UpdateChecklistResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/checklist/update`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({
        id: payload.id,
        title: payload.title,
        note: payload.note,
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const data = JSON.parse(rawText) as { updated?: unknown };
      if (data.updated !== true) {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true };
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
          : "요청 중 오류가 발생했습니다.",
    };
  }
}

export async function deleteChecklistItem(
  id: string,
  init?: RequestInit,
): Promise<DeleteChecklistResult> {
  const base = getApiBaseUrl();
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, message: "[파싱] 삭제할 항목 id가 없습니다." };
  }

  try {
    const res = await fetch(`${base}/checklist/delete`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({ id: trimmed }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const data = JSON.parse(rawText) as { deleted?: unknown };
      if (data.deleted !== true) {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true };
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
          : "요청 중 오류가 발생했습니다.",
    };
  }
}

export async function completeChecklistItems(
  ids: string[],
  init?: RequestInit,
): Promise<CompleteChecklistResult> {
  const base = getApiBaseUrl();
  if (ids.length === 0) {
    return { ok: false, message: "[파싱] 완료할 항목이 없습니다." };
  }

  try {
    const res = await fetch(`${base}/checklist/complete`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({ ids }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const data = JSON.parse(rawText) as { completed?: unknown };
      if (typeof data.completed !== "number") {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true, completed: data.completed };
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
          : "요청 중 오류가 발생했습니다.",
    };
  }
}

export type SuggestMode = "prioritize" | "draft";

export type ChecklistSuggestItem = {
  title: string;
  reason: string | null;
  priority: number | null;
  note: string | null;
};

export type ChecklistSuggestData = {
  mode: SuggestMode;
  summary: string;
  items: ChecklistSuggestItem[];
};

export type ChecklistSuggestResult =
  | { ok: true; data: ChecklistSuggestData }
  | { ok: false; message: string };

function parseChecklistSuggestPayload(
  raw: unknown,
): ChecklistSuggestData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.mode !== "prioritize" && o.mode !== "draft") return null;
  if (typeof o.summary !== "string") return null;
  if (!Array.isArray(o.items)) return null;
  const items: ChecklistSuggestItem[] = [];
  for (const row of o.items) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (typeof r.title !== "string") return null;
    items.push({
      title: r.title,
      reason: typeof r.reason === "string" ? r.reason : null,
      priority: typeof r.priority === "number" ? r.priority : null,
      note: typeof r.note === "string" ? r.note : null,
    });
  }
  return {
    mode: o.mode,
    summary: o.summary,
    items,
  };
}

export async function suggestChecklist(
  payload: { mode: SuggestMode; prompt?: string | null },
  init?: RequestInit,
): Promise<ChecklistSuggestResult> {
  const base = getApiBaseUrl();
  const body: Record<string, unknown> = { mode: payload.mode };
  if (payload.prompt != null && payload.prompt !== "") {
    body.prompt = payload.prompt;
  }

  try {
    const res = await fetch(`${base}/ai/checklist/suggest`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify(body),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      const data = parseChecklistSuggestPayload(parsed);
      if (data === null) {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true, data };
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
          : "요청 중 오류가 발생했습니다.",
    };
  }
}

export async function fetchChecklist(
  init?: RequestInit,
): Promise<FetchChecklistResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/checklist`, {
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
      const items = parseChecklistItems(parsed);
      if (items === null) {
        return { ok: false, message: "응답이 올바른 배열이 아닙니다." };
      }
      return { ok: true, items };
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
