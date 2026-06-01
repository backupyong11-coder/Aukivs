/** 업무정리 — 정량화 구분 자동 조합 (분야 + 분류 + 정량화 분) */

export const QUANTIFICATION_TYPE_SOURCE_FIELDS = ["분야", "분류", "정량화 분"] as const;

export type QuantificationTypeSourceField = (typeof QUANTIFICATION_TYPE_SOURCE_FIELDS)[number];

export function isQuantificationTypeSourceField(field: string): field is QuantificationTypeSourceField {
  return (
    field === "분야" ||
    field === "분류" ||
    field === "정량화 분"
  );
}

/** `[성인웹툰]` + `[제작]` + `[AI스토리교정]` → `[성인웹툰][제작][AI스토리교정]` */
export function composeQuantificationType(
  row: Record<string, string | undefined | null>,
): string {
  return QUANTIFICATION_TYPE_SOURCE_FIELDS.map((key) => (row[key] ?? "").trim())
    .filter(Boolean)
    .join("");
}

export function withAutoQuantificationType<T extends Record<string, string>>(
  row: T,
): T & { "정량화 구분": string } {
  return {
    ...row,
    "정량화 구분": composeQuantificationType(row),
  };
}
