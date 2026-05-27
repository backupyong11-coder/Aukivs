/** 플랫폼정리 DB ↔ 지속진행 DB 공통 상태 필드 */

export const PLATFORM_ON_HOLD_FIELD = "보류";
export const PLATFORM_PROGRESS_EXTRA_FIELD = "진행";
export const PLATFORM_PROGRESS_CORE_FIELD = "진행중";
export const PLATFORM_DONE_FIELD = "완료";

export function isPlatformProgressTrue(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toUpperCase();
  return s === "TRUE" || s === "1" || s === "YES" || s === "Y" || s === "O" || s === "✓";
}

/** 플랫폼정리 DB extra「보류」체크 */
export function isPlatformRowOnHold(row: Record<string, unknown>): boolean {
  return isPlatformProgressTrue(row[PLATFORM_ON_HOLD_FIELD]);
}

/** extra「진행」 또는 코어「진행중」 */
export function isPlatformRowInProgress(row: Record<string, unknown>): boolean {
  return (
    isPlatformProgressTrue(row[PLATFORM_PROGRESS_EXTRA_FIELD]) ||
    isPlatformProgressTrue(row[PLATFORM_PROGRESS_CORE_FIELD])
  );
}

export function isPlatformRowDone(row: Record<string, unknown>): boolean {
  return isPlatformProgressTrue(row[PLATFORM_DONE_FIELD]);
}
