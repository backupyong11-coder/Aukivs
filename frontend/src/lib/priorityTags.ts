export const DEFAULT_PRIORITY_TAGS = ["오키브스", "업체", "없음", "논의"] as const;

const STORAGE_KEY = "worksheet.priority_tags.v1";

export function loadPriorityTagOptions(): string[] {
  const base = [...DEFAULT_PRIORITY_TAGS];
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return base;
    const seen = new Set<string>(base);
    const extra: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      extra.push(t);
    }
    return [...base, ...extra];
  } catch {
    return base;
  }
}

export function savePriorityTagOptions(tags: string[]) {
  if (typeof window === "undefined") return;
  const defaults = new Set(DEFAULT_PRIORITY_TAGS);
  const custom = tags.map((t) => t.trim()).filter((t) => t && !defaults.has(t as (typeof DEFAULT_PRIORITY_TAGS)[number]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    /* ignore */
  }
}

export function priorityTagStyle(tag: string): string {
  const t = tag.trim();
  if (t === "오키브스") return "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200";
  if (t === "업체") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  if (t === "없음") return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  if (t === "논의") return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  return "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200";
}
