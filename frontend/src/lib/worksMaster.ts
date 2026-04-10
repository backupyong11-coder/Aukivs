import { apiBase } from "@/lib/apiBase";

export type WorksMasterItem = Record<string, string>;

type FetchResult =
  | { ok: true; items: WorksMasterItem[] }
  | { ok: false; items: WorksMasterItem[] };

export async function fetchWorksMaster(): Promise<FetchResult> {
  try {
    const res = await fetch(`${apiBase()}/works-master`);
    if (!res.ok) return { ok: false, items: [] };
    const data = await res.json();
    const items: WorksMasterItem[] = Array.isArray(data?.items) ? data.items : [];
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}