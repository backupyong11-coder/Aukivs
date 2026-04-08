const RECENT_KEY = "worksheet.controlRoom.recentQueries";
const FAVORITES_KEY = "worksheet.controlRoom.favoriteQueries";
const MAX_RECENT = 5;
const MAX_FAVORITES = 5;

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function loadRecentQueries(): string[] {
  const list = normalizeList(readJson(RECENT_KEY));
  return list.slice(0, MAX_RECENT);
}

export function loadFavoriteQueries(): string[] {
  const list = normalizeList(readJson(FAVORITES_KEY));
  return list.slice(0, MAX_FAVORITES);
}

export function pushRecentQuery(text: string) {
  const t = text.trim();
  if (!t) return;
  const prev = loadRecentQueries().filter((q) => q !== t);
  const next = [t, ...prev].slice(0, MAX_RECENT);
  writeJson(RECENT_KEY, next);
}

export function toggleFavoriteQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const fav = loadFavoriteQueries();
  const has = fav.includes(t);
  const next = has ? fav.filter((x) => x !== t) : [t, ...fav].slice(0, MAX_FAVORITES);
  writeJson(FAVORITES_KEY, next);
  return !has;
}

export function removeRecentQuery(text: string) {
  const t = text.trim();
  if (!t) return;
  writeJson(
    RECENT_KEY,
    loadRecentQueries().filter((q) => q !== t),
  );
}
