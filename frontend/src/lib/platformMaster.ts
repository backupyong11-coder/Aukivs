import { getApiBaseUrl } from "@/lib/apiBase";

export type PlatformMasterItem = Record<string, string>;

type FetchResult =
  const res = await fetch(`${getApiBaseUrl()}/platform-master`);
  | { ok: false; items: PlatformMasterItem[] };

export async function fetchPlatformMaster(): Promise<FetchResult> {
  try {
    const res = await fetch(`${apiBase()}/platform-master`);
    if (!res.ok) return { ok: false, items: [] };
    const data = await res.json();
    const items: PlatformMasterItem[] = Array.isArray(data?.items) ? data.items : [];
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}