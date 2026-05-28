import { getApiBaseUrl } from "@/lib/apiBase";

export type PlatformMatrixPreferences = {
  columnOrder: string[];
  hiddenColumns: string[];
  rowOrder: string[];
};

export type FetchPlatformMatrixPreferencesResult =
  | { ok: true; preferences: PlatformMatrixPreferences }
  | { ok: false; message: string };

export type SavePlatformMatrixPreferencesResult =
  | { ok: true }
  | { ok: false; message: string };

function cleanList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const label = item.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export async function fetchPlatformMatrixPreferences(): Promise<FetchPlatformMatrixPreferencesResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/platform-matrix-preferences`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, message: raw.slice(0, 200) || `HTTP ${res.status}` };
    }
    const j = JSON.parse(raw) as { column_order?: unknown; hidden_columns?: unknown; row_order?: unknown };
    return {
      ok: true,
      preferences: {
        columnOrder: cleanList(j.column_order),
        hiddenColumns: cleanList(j.hidden_columns),
        rowOrder: cleanList(j.row_order),
      },
    };
  } catch {
    return { ok: false, message: "플랫폼 매트릭스 설정 서버에 연결할 수 없습니다." };
  }
}

export async function savePlatformMatrixPreferences(
  preferences: PlatformMatrixPreferences,
): Promise<SavePlatformMatrixPreferencesResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/platform-matrix-preferences`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        column_order: cleanList(preferences.columnOrder),
        hidden_columns: cleanList(preferences.hiddenColumns),
        row_order: cleanList(preferences.rowOrder),
      }),
    });
    if (!res.ok) {
      const raw = await res.text();
      return { ok: false, message: raw.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "플랫폼 매트릭스 설정을 저장할 수 없습니다." };
  }
}
