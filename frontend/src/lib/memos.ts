import { getApiBaseUrl } from "@/lib/apiBase";

export type MemoItem = {
  sheet_row: number;
  content: string;
  memo_date: string;
  category: string | null;
};

export type FetchMemosResult =
  | { ok: true; items: MemoItem[] }
  | { ok: false; message: string };

export type AppendMemoResult = { ok: true } | { ok: false; message: string };

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

/** 메모 API 실패 시 사용자용 문구 (404·연결 오류 등). */
export function userFacingMemoHttpError(status: number, raw: string): string {
  if (status === 404 || status === 405) {
    return "메모 저장에 실패했습니다. 백엔드 주소 또는 /memos/append 연결을 확인하세요.";
  }
  if (status === 503) {
    return "메모 서버 설정을 확인할 수 없습니다. 서비스 계정·시트 URL을 점검하세요.";
  }
  if (status >= 500) {
    return "메모 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  const detail = formatHttpDetail(status, raw);
  if (/메모 내용이 비어/.test(detail)) {
    return "메모 내용을 입력해 주세요.";
  }
  return detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
}

function parseMemoItems(raw: unknown): MemoItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: MemoItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.content !== "string") continue;
    const sheet_row =
      typeof rec.sheet_row === "number" && Number.isFinite(rec.sheet_row)
        ? rec.sheet_row
        : null;
    if (sheet_row == null) continue;
    const memo_date =
      typeof rec.memo_date === "string" ? rec.memo_date : "";
    const category =
      typeof rec.category === "string" && rec.category.trim()
        ? rec.category
        : null;
    items.push({
      sheet_row,
      content: rec.content,
      memo_date,
      category,
    });
  }
  return items;
}

export async function fetchMemos(
  init?: RequestInit,
): Promise<FetchMemosResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/memos`, {
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
        message: userFacingMemoHttpError(res.status, rawText),
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      return { ok: false, message: "메모 목록 응답이 올바른 JSON이 아닙니다." };
    }
    const items = parseMemoItems(parsed);
    if (!items) {
      return { ok: false, message: "메모 목록 응답 형식이 올바르지 않습니다." };
    }
    return { ok: true, items };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "메모 목록을 불러오지 못했습니다.",
    };
  }
}

export async function appendMemo(
  content: string,
  category: string,
  init?: RequestInit,
): Promise<AppendMemoResult> {
  const base = getApiBaseUrl();
  const body = {
    content: content.trim(),
    category: category.trim() ? category.trim() : null,
  };
  try {
    const res = await fetch(`${base}/memos/append`, {
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
      return {
        ok: false,
        message: userFacingMemoHttpError(res.status, rawText),
      };
    }
    return { ok: true };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return {
      ok: false,
      message:
        "메모 저장에 실패했습니다. 백엔드가 실행 중인지·네트워크를 확인하세요.",
    };
  }
}
