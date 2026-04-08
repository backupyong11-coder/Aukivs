import type { SuggestMode } from "@/lib/checklist";

/** AI draft 행마다 고정 키(재실행 시 인덱스·내용 기준으로 구분). */
export function draftSuggestItemKey(
  index: number,
  title: string,
  note: string | null,
): string {
  return `${index}\u0001${title}\u0001${note ?? ""}`;
}

export function showDraftAddToChecklist(mode: SuggestMode): boolean {
  return mode === "draft";
}

export function canStartDraftAddToChecklist(
  key: string,
  addedKeys: ReadonlySet<string>,
  addingKeys: Readonly<Record<string, boolean>>,
  bulkProcessing: boolean = false,
): boolean {
  if (bulkProcessing) return false;
  if (addedKeys.has(key)) return false;
  if (addingKeys[key]) return false;
  return true;
}

export type DraftSuggestRow = { title: string; note: string | null };

/** 일괄 추가 대상: 선택됐고, 아직 추가되지 않았으며, 개별 추가 중이 아닌 행만. */
export function filterBatchDraftTargets(
  draftItems: ReadonlyArray<DraftSuggestRow>,
  selectedKeys: ReadonlySet<string>,
  addedKeys: ReadonlySet<string>,
  addingKeys: Readonly<Record<string, boolean>>,
): { key: string; title: string; note: string | null }[] {
  const out: { key: string; title: string; note: string | null }[] = [];
  draftItems.forEach((it, idx) => {
    const key = draftSuggestItemKey(idx, it.title, it.note);
    if (!selectedKeys.has(key)) return;
    if (addedKeys.has(key)) return;
    if (addingKeys[key]) return;
    out.push({ key, title: it.title, note: it.note });
  });
  return out;
}

/** 체크박스로 선택 가능한지(일괄 처리 중·추가됨·추가 중이면 불가). */
export function canToggleDraftRowSelection(
  key: string,
  addedKeys: ReadonlySet<string>,
  addingKeys: Readonly<Record<string, boolean>>,
  bulkProcessing: boolean,
): boolean {
  if (bulkProcessing) return false;
  if (addedKeys.has(key)) return false;
  if (addingKeys[key]) return false;
  return true;
}
