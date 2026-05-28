import { getApiBaseUrl } from "@/lib/apiBase";

export const WORK_MATRIX_FIELDS: { key: string; label: string }[] = [
  { key: "작품명", label: "작품명" },
  { key: "작품분류", label: "분류" },
  { key: "글작가", label: "글작가" },
  { key: "그림작가", label: "그림작가" },
  { key: "연재중인 사이트", label: "연재중인 사이트" },
  { key: "런칭된 사이트", label: "런칭된 사이트" },
  { key: "업로드해야 하는 사이트", label: "업로드해야 하는 사이트" },
  { key: "대기중 사이트", label: "대기중 사이트" },
  { key: "계약된 사이트", label: "계약된 사이트" },
];

async function apiPost(path: string, body: object) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { detail?: string };
      throw new Error(j.detail ?? text);
    } catch (e) {
      if (e instanceof Error && e.message !== text) throw e;
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

export async function createWorksMasterRow(
  fields: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await apiPost("/works-master/create", fields);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "작품 추가에 실패했습니다.",
    };
  }
}

export async function updateWorksMasterRow(
  originalTitle: string,
  fields: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await apiPost("/works-master/update", { original_title: originalTitle, ...fields });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "작품 수정에 실패했습니다.",
    };
  }
}
