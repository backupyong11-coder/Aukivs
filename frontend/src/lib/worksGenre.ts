import type { WorksMasterItem } from "@/lib/worksMaster";

export const WORK_GENRE_FIELD = "작품분류";

export const DEFAULT_WORK_GENRES = ["성인웹툰", "BL웹툰", "성인애니", "BL애니"] as const;

export function getWorkGenre(item: WorksMasterItem | Record<string, string>): string {
  return String(item[WORK_GENRE_FIELD] ?? item["work_genre"] ?? "").trim();
}

export function mergeWorkGenreOptions(
  stored: string[],
  items: WorksMasterItem[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const v = label.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  for (const g of stored) push(g);
  for (const g of DEFAULT_WORK_GENRES) push(g);
  for (const item of items) push(getWorkGenre(item));
  return out;
}
