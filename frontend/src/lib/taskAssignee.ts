/** 업무정리 API — 직원 분배 필드 */
export const TASK_ASSIGNEE_FIELD = "업무담당";

const LEGACY_ASSIGNEE_KEYS = ["상태", "담당자"] as const;

/** API/레거시 키에서 업무담당 문자열 추출 */
export function readTaskAssignee(row: Record<string, string | undefined | null>): string {
  const direct = (row[TASK_ASSIGNEE_FIELD] ?? "").trim();
  if (direct) return direct;
  for (const key of LEGACY_ASSIGNEE_KEYS) {
    const v = (row[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

export function isTaskDone(raw: string | undefined | null): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "완료" || v === "✓";
}

/** 담당자 이름 일치 (완전 일치 우선, 포함도 허용) */
export function taskMatchesAssignee(
  row: Record<string, string | undefined | null>,
  personName: string,
): boolean {
  const name = personName.trim();
  const assignee = readTaskAssignee(row);
  if (!name) return assignee === "";
  if (assignee === name) return true;
  return assignee.includes(name);
}
