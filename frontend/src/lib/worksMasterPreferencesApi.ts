import { getApiBaseUrl } from "@/lib/apiBase";
import { DEFAULT_WORK_GENRES } from "@/lib/worksGenre";

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

export async function fetchWorksMasterPreferences(): Promise<{
  ok: true;
  workGenres: string[];
} | {
  ok: false;
  workGenres: string[];
  message: string;
}> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/works-master-preferences`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        workGenres: [...DEFAULT_WORK_GENRES],
        message: raw.slice(0, 200) || `HTTP ${res.status}`,
      };
    }
    const j = JSON.parse(raw) as { work_genres?: unknown };
    const workGenres = cleanList(j.work_genres);
    return {
      ok: true,
      workGenres: workGenres.length > 0 ? workGenres : [...DEFAULT_WORK_GENRES],
    };
  } catch {
    return {
      ok: false,
      workGenres: [...DEFAULT_WORK_GENRES],
      message: "작품 분류 설정을 불러올 수 없습니다.",
    };
  }
}

export async function saveWorksMasterPreferences(
  workGenres: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/works-master-preferences`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_genres: cleanList(workGenres) }),
    });
    if (!res.ok) {
      const raw = await res.text();
      return { ok: false, message: raw.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "작품 분류 설정을 저장할 수 없습니다." };
  }
}
