import type { MemoItem } from "@/lib/memos";

export const MEMO_MENU_ORDER_STORAGE_KEY = "memo_menu_row_order_v1";

export function memoRowKey(m: MemoItem): string {
  return m.id ? `id:${m.id}` : `row:${m.sheet_row}`;
}

export function loadMemoMenuOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MEMO_MENU_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function saveMemoMenuOrder(keys: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MEMO_MENU_ORDER_STORAGE_KEY, JSON.stringify(keys));
}

/** 저장된 순서를 반영하고, 새 메모는 목록 끝에 붙입니다. */
export function applyMemoMenuOrder(items: MemoItem[], preferredKeys: string[]): MemoItem[] {
  if (preferredKeys.length === 0) return items;
  const byKey = new Map(items.map((m) => [memoRowKey(m), m]));
  const out: MemoItem[] = [];
  const seen = new Set<string>();
  for (const k of preferredKeys) {
    const m = byKey.get(k);
    if (m) {
      out.push(m);
      seen.add(k);
    }
  }
  for (const m of items) {
    const k = memoRowKey(m);
    if (!seen.has(k)) out.push(m);
  }
  return out;
}

export function swapMemoOrderKeys(keys: string[], index: number, dir: -1 | 1): string[] {
  const j = index + dir;
  if (index < 0 || j < 0 || j >= keys.length) return keys;
  const next = [...keys];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}
