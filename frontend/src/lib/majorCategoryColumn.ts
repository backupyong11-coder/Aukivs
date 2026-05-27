/** 7개 정리 표 공통 데이터 열(속성) 이름 */
export const MAJOR_CATEGORY_FIELD = "대분류";

/** 열 순서 맨 앞에「대분류」가 오도록 보장 */
export function ensureMajorCategoryInColumnOrder(keys: string[]): string[] {
  const rest = keys.filter((k) => k !== MAJOR_CATEGORY_FIELD);
  return [MAJOR_CATEGORY_FIELD, ...rest];
}
