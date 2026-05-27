/** 정리 표 되돌리기 스택 항목 */

export type FieldUndoEntry = {
  kind: "field";
  id: string;
  field: string;
  title: string;
  previousValue: string;
};

export type CompletionUndoEntry = {
  kind: "completion";
  id: string;
  title: string;
  previousDone: string;
};

export type ColumnHideUndoEntry = {
  kind: "column-hide";
  field: string;
  label: string;
};

export type TableUndoEntry = FieldUndoEntry | CompletionUndoEntry | ColumnHideUndoEntry;

export const UNDO_TOAST_MS = 10_000;
export const MAX_UNDO_STACK = 10;

export function undoEntryKey(entry: TableUndoEntry): string {
  if (entry.kind === "field") return `field:${entry.id}:${entry.field}`;
  if (entry.kind === "completion") return `completion:${entry.id}`;
  return `column-hide:${entry.field}`;
}

export function undoToastDescription(entry: TableUndoEntry): string {
  if (entry.kind === "column-hide") {
    return `「${entry.label}」 열을 숨김`;
  }
  if (entry.kind === "completion") {
    return `「${entry.title}」 완료 변경`;
  }
  return `「${entry.title}」 ${entry.field} 변경`;
}

export function pushUndoEntry(
  stack: TableUndoEntry[],
  entry: TableUndoEntry,
  max = MAX_UNDO_STACK,
): TableUndoEntry[] {
  const key = undoEntryKey(entry);
  return [entry, ...stack.filter((e) => undoEntryKey(e) !== key)].slice(0, max);
}

export function isColumnHideUndo(entry: TableUndoEntry): entry is ColumnHideUndoEntry {
  return entry.kind === "column-hide";
}
