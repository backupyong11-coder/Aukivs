import { getApiBaseUrl } from "@/lib/apiBase";

export type PlatformRowRecord = Record<string, string> & { id: string; sheet_row: string };

export const PLATFORM_MATRIX_CREATE_FIELDS: { key: string; label: string }[] = [
  { key: "회사명", label: "회사명" },
  { key: "플랫폼명", label: "플랫폼명" },
  { key: "발표일", label: "발표일" },
  { key: "분류", label: "분류" },
  { key: "현재단계", label: "현재단계" },
  { key: "마지막상황", label: "마지막 상황" },
  { key: "다음액션", label: "다음액션" },
  { key: "우선순위", label: "우선순위" },
];

export const PLATFORM_MATRIX_EDIT_FIELDS: { key: string; label: string }[] = [
  { key: "분류", label: "분류" },
  { key: "현재단계", label: "현재단계" },
  { key: "마지막상황", label: "마지막 상황" },
  { key: "대기사유", label: "대기사유" },
  { key: "다음액션", label: "다음액션" },
  { key: "우선순위", label: "우선순위" },
  { key: "비고", label: "비고" },
];

const STATUS_KEY_CANDIDATES = ["마지막상황", "마지막 상황", "최근상황", "최근 상황", "상황"];

export function platformRowLabel(row: PlatformRowRecord): string {
  return (row["플랫폼명"] ?? row["회사명"] ?? "").trim();
}

export function findPlatformRowByLabel(
  rows: PlatformRowRecord[],
  label: string,
): PlatformRowRecord | undefined {
  const t = label.trim();
  if (!t) return undefined;
  return rows.find((r) => platformRowLabel(r) === t);
}

function findStatusKey(item: PlatformRowRecord): string {
  for (const k of STATUS_KEY_CANDIDATES) {
    if (k in item && item[k]) return k;
  }
  return "마지막상황";
}

export function platformRowToEditForm(item: PlatformRowRecord): Record<string, string> {
  const statusKey = findStatusKey(item);
  const f: Record<string, string> = {};
  for (const { key } of PLATFORM_MATRIX_EDIT_FIELDS) {
    f[key] = item[key === "마지막상황" ? statusKey : key] ?? "";
  }
  return f;
}

async function apiFetch(path: string, body?: object) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

export async function fetchPlatformRowsList(): Promise<PlatformRowRecord[]> {
  const data = await apiFetch("/platform-rows");
  return Array.isArray(data) ? (data as PlatformRowRecord[]) : [];
}

export async function createPlatformRow(
  fields: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await apiFetch("/platform-rows/create", fields);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "플랫폼 추가에 실패했습니다.",
    };
  }
}

export async function updatePlatformRow(
  id: string,
  fields: Record<string, string>,
  sourceRow?: PlatformRowRecord,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const payload: Record<string, string> = { id };
    const statusKey = sourceRow ? findStatusKey(sourceRow) : "마지막상황";
    for (const { key } of PLATFORM_MATRIX_EDIT_FIELDS) {
      const outKey = key === "마지막상황" ? statusKey : key;
      payload[outKey] = fields[key] ?? "";
    }
    await apiFetch("/platform-rows/update", payload);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "플랫폼 수정에 실패했습니다.",
    };
  }
}
