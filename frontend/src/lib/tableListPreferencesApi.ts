import { getApiBaseUrl } from "@/lib/apiBase";
import { clampColumnWidth } from "@/lib/tableColumnWidths";
import type { TableListPageId } from "@/lib/tableListView";

export type FetchColumnWidthsResult =
  | { ok: true; columnWidths: Record<string, number> }
  | { ok: false; message: string };

export type SaveColumnWidthsResult =
  | { ok: true }
  | { ok: false; message: string };

function parseWidths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "number" || !Number.isFinite(v)) continue;
    out[k] = clampColumnWidth(v);
  }
  return out;
}

export async function fetchColumnWidthsFromServer(
  pageId: TableListPageId,
): Promise<FetchColumnWidthsResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/table-list-preferences/${encodeURIComponent(pageId)}`,
      { method: "GET", credentials: "include", cache: "no-store" },
    );
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, message: raw.slice(0, 200) || `HTTP ${res.status}` };
    }
    const j = JSON.parse(raw) as { column_widths?: unknown };
    return { ok: true, columnWidths: parseWidths(j.column_widths) };
  } catch {
    return { ok: false, message: "서버에 연결할 수 없습니다." };
  }
}

export async function saveColumnWidthsToServer(
  pageId: TableListPageId,
  columnWidths: Record<string, number>,
): Promise<SaveColumnWidthsResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/table-list-preferences/${encodeURIComponent(pageId)}`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_widths: columnWidths }),
      },
    );
    if (!res.ok) {
      const raw = await res.text();
      return { ok: false, message: raw.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "서버에 연결할 수 없습니다." };
  }
}
