import { getApiBaseUrl } from "@/lib/apiBase";

export type UploadItem = {
  id: string;
  title: string;
  file_name: string;
  uploaded_at: string;
  note: string | null;
  status: string | null;
};

/**
 * GET /uploads 목록 전용(시트 행·시각 반영 uid).
 * 카드 DOM id·스크롤/하이라이트 앵커는 이 uid를 씁니다(동일 A열 id 다행 대비).
 */
export type UploadListItem = UploadItem & { uid: string };

/** 필수 열 누락 등으로 목록에서 제외된 행. */
export type UploadRowSkippedIssue = {
  kind: "row_skipped";
  sheet_row: number;
  message: string;
};

/** 동일 A열 id가 여러 유효 행에 있음. 수정/삭제/다음 회차는 id 단일 기준이라 대상이 모호할 수 있음. */
export type UploadDuplicateIdIssue = {
  kind: "duplicate_id";
  id: string;
  sheet_rows: number[];
  message: string;
};

export type UploadListIssue = UploadRowSkippedIssue | UploadDuplicateIdIssue;

/** 중복 id 카드에서 수정/삭제/다음 회차 비활성화 시 버튼 title 등에 사용 */
export const UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON =
  "이 id는 시트에서 중복되어 있어 현재 이 앱에서 안전하게 수정할 수 없습니다. 시트에서 id 중복을 먼저 해소하세요.";

/** GET /uploads issues 중 kind === duplicate_id 인 id 집합 (액션 허용 여부 판별). */
export function duplicateUploadIdsFromIssues(issues: UploadListIssue[]): Set<string> {
  const s = new Set<string>();
  for (const iss of issues) {
    if (iss.kind === "duplicate_id") {
      s.add(iss.id);
    }
  }
  return s;
}

export type FetchUploadsResult =
  | { ok: true; items: UploadListItem[]; issues: UploadListIssue[] }
  | { ok: false; message: string };

export type UpdateUploadResult =
  | { ok: true }
  | { ok: false; message: string };

export type NextEpisodeUploadResult =
  | { ok: true }
  | { ok: false; message: string };

export type DeleteUploadResult =
  | { ok: true }
  | { ok: false; message: string };

export type UploadSuggestPrioritizeItem = {
  id: string;
  title: string;
  reason: string;
  priority: number;
  suggested_action: string;
};

export type UploadSuggestReviewItem = {
  id: string;
  title: string;
  issue: string;
  suggestion: string;
};

export type UploadSuggestResponse =
  | {
      mode: "prioritize";
      summary: string;
      items: UploadSuggestPrioritizeItem[];
    }
  | {
      mode: "review";
      summary: string;
      items: UploadSuggestReviewItem[];
    };

export type SuggestUploadsAiResult =
  | { ok: true; data: UploadSuggestResponse }
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

export type CreateUploadResult =
  | { ok: true; item: UploadItem }
  | { ok: false; message: string };

function parseUploadSuggestResponse(raw: unknown): UploadSuggestResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const mode = rec.mode;
  const summary = rec.summary;
  if (mode !== "prioritize" && mode !== "review") return null;
  if (typeof summary !== "string" || !summary.trim()) return null;
  if (!Array.isArray(rec.items)) return null;

  if (mode === "prioritize") {
    const items: UploadSuggestPrioritizeItem[] = [];
    for (const row of rec.items) {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      if (
        typeof o.id !== "string" ||
        typeof o.title !== "string" ||
        typeof o.reason !== "string" ||
        typeof o.suggested_action !== "string"
      ) {
        return null;
      }
      const pr = o.priority;
      if (typeof pr !== "number" || !Number.isFinite(pr)) return null;
      items.push({
        id: o.id,
        title: o.title,
        reason: o.reason,
        priority: pr,
        suggested_action: o.suggested_action,
      });
    }
    return { mode: "prioritize", summary, items };
  }

  const items: UploadSuggestReviewItem[] = [];
  for (const row of rec.items) {
    if (!row || typeof row !== "object") return null;
    const o = row as Record<string, unknown>;
    if (
      typeof o.id !== "string" ||
      typeof o.title !== "string" ||
      typeof o.issue !== "string" ||
      typeof o.suggestion !== "string"
    ) {
      return null;
    }
    items.push({
      id: o.id,
      title: o.title,
      issue: o.issue,
      suggestion: o.suggestion,
    });
  }
  return { mode: "review", summary, items };
}

const UPLOAD_FILE_NAME_PLACEHOLDER = "(파일명 미입력)";

function parseUploadItem(raw: unknown): UploadItem | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  if (typeof rec.title !== "string" || !rec.title.trim()) return null;
  if (typeof rec.uploaded_at !== "string" || !rec.uploaded_at.trim()) {
    return null;
  }
  const fn =
    typeof rec.file_name === "string" && rec.file_name.trim()
      ? rec.file_name.trim()
      : UPLOAD_FILE_NAME_PLACEHOLDER;
  const note = typeof rec.note === "string" ? rec.note : null;
  const status =
    rec.status === undefined || rec.status === null
      ? null
      : typeof rec.status === "string"
        ? rec.status
        : null;
  return {
    id: rec.id.trim(),
    title: rec.title.trim(),
    file_name: fn,
    uploaded_at: rec.uploaded_at.trim(),
    note,
    status,
  };
}

function parseUploadItems(raw: unknown): UploadItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: UploadItem[] = [];
  for (const row of raw) {
    const item = parseUploadItem(row);
    if (item) items.push(item);
  }
  return items;
}

function parseUploadListItem(raw: unknown, rowIndex: number): UploadListItem | null {
  const base = parseUploadItem(raw);
  if (!base || !raw || typeof raw !== "object") return null;
  const uidRaw = (raw as Record<string, unknown>).uid;
  if (typeof uidRaw === "string" && uidRaw.trim()) {
    return { ...base, uid: uidRaw.trim() };
  }
  return {
    ...base,
    uid: `upload-${base.id}-${base.uploaded_at}-${rowIndex}`,
  };
}

export function parseUploadListResponse(raw: unknown): {
  items: UploadListItem[];
  issues: UploadListIssue[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items: UploadListItem[] = [];
  for (let i = 0; i < o.items.length; i++) {
    const it = parseUploadListItem(o.items[i], i);
    if (it) items.push(it);
  }
  const issues: UploadListIssue[] = [];
  if (Array.isArray(o.issues)) {
    for (const row of o.issues) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const kind = r.kind;
      if (kind === "row_skipped") {
        const sr = r.sheet_row;
        if (typeof sr !== "number" || !Number.isFinite(sr) || sr < 2) continue;
        if (typeof r.message !== "string") continue;
        issues.push({ kind: "row_skipped", sheet_row: sr, message: r.message });
        continue;
      }
      if (kind === "duplicate_id") {
        if (typeof r.id !== "string" || !r.id.trim()) continue;
        if (typeof r.message !== "string") continue;
        if (!Array.isArray(r.sheet_rows)) continue;
        const sheet_rows: number[] = [];
        for (const x of r.sheet_rows) {
          if (typeof x === "number" && Number.isFinite(x) && x >= 2) {
            sheet_rows.push(x);
          }
        }
        if (sheet_rows.length < 2) continue;
        issues.push({
          kind: "duplicate_id",
          id: r.id,
          sheet_rows,
          message: r.message,
        });
      }
    }
  }
  return { items, issues };
}

/** 레거시: GET /uploads 가 배열만 돌려주던 경우 */
function parseUploadListResponseLegacyArray(raw: unknown): {
  items: UploadListItem[];
  issues: UploadListIssue[];
} | null {
  if (!Array.isArray(raw)) return null;
  const items: UploadListItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const it = parseUploadListItem(raw[i], i);
    if (it) items.push(it);
  }
  return { items, issues: [] };
}

export async function createUploadItem(
  payload: {
    title: string;
    file_name: string | null;
    uploaded_at: string | null;
    note: string | null;
    status: string | null;
  },
  init?: RequestInit,
): Promise<CreateUploadResult> {
  const base = getApiBaseUrl();
  const title = payload.title.trim();
  if (!title) {
    return { ok: false, message: "[파싱] 제목(title)은 비울 수 없습니다." };
  }

  try {
    const res = await fetch(`${base}/uploads/create`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({
        title,
        file_name: payload.file_name,
        uploaded_at: payload.uploaded_at,
        note: payload.note,
        status: payload.status,
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      const item = parseUploadItem(parsed);
      if (!item) {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true, item };
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

export async function deleteUploadItem(
  id: string,
  init?: RequestInit,
): Promise<DeleteUploadResult> {
  const base = getApiBaseUrl();
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, message: "[파싱] 항목 id가 없습니다." };
  }

  try {
    const res = await fetch(`${base}/uploads/delete`, {
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

export async function suggestUploadsAi(
  payload: { mode: "prioritize" | "review"; prompt: string | null },
  init?: RequestInit,
): Promise<SuggestUploadsAiResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/ai/uploads/suggest`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({
        mode: payload.mode,
        prompt: payload.prompt,
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      return { ok: false, message: formatHttpDetail(res.status, rawText) };
    }
    try {
      const parsed: unknown = JSON.parse(rawText);
      const data = parseUploadSuggestResponse(parsed);
      if (!data) {
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

export async function updateUploadItem(
  payload: {
    id: string;
    status: string | null;
    note: string | null;
    uploaded_at: string;
  },
  init?: RequestInit,
): Promise<UpdateUploadResult> {
  const base = getApiBaseUrl();
  const iso = payload.uploaded_at.trim();
  if (!iso) {
    return {
      ok: false,
      message:
        "[파싱] 업로드 시각(uploaded_at)은 비울 수 없습니다. ISO 8601 형식으로 입력하세요.",
    };
  }

  try {
    const res = await fetch(`${base}/uploads/update`, {
      method: "POST",
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify({
        id: payload.id,
        status: payload.status,
        note: payload.note,
        uploaded_at: iso,
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

export async function nextEpisodeUpload(
  id: string,
  init?: RequestInit,
): Promise<NextEpisodeUploadResult> {
  const base = getApiBaseUrl();
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, message: "[파싱] 항목 id가 없습니다." };
  }

  try {
    const res = await fetch(`${base}/uploads/next-episode`, {
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
      const data = JSON.parse(rawText) as { advanced?: unknown };
      if (data.advanced !== true) {
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

export async function fetchUploads(
  init?: RequestInit,
): Promise<FetchUploadsResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/uploads`, {
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
      let data = parseUploadListResponse(parsed);
      if (data === null) {
        data = parseUploadListResponseLegacyArray(parsed);
      }
      if (data === null) {
        return { ok: false, message: "응답 형식이 올바르지 않습니다." };
      }
      return { ok: true, items: data.items, issues: data.issues };
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
