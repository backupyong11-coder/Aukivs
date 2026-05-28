/** 정리 표에서 날짜 미니 달력으로 편집하는 열 이름 */

export const PLATFORM_TABLE_DATE_FIELDS = new Set<string>(["발표일"]);

export const UPLOAD_ROW_TABLE_DATE_FIELDS = new Set<string>([
  "업로드일",
  "런칭일",
  "마지막업로드일",
  "다음업로드일",
]);

export const LAUNCHING_TABLE_DATE_FIELDS = UPLOAD_ROW_TABLE_DATE_FIELDS;

export const WORKS_TABLE_DATE_FIELDS = new Set<string>(["첫 공급 일정"]);

export function isSheetTableDateField(field: string): boolean {
  return (
    PLATFORM_TABLE_DATE_FIELDS.has(field) ||
    UPLOAD_ROW_TABLE_DATE_FIELDS.has(field) ||
    WORKS_TABLE_DATE_FIELDS.has(field)
  );
}
