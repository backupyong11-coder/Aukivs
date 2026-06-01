/** 업무정리 API — 외부담당자(기존 업무담당/인물담당) */
export const TASK_ASSIGNEE_FIELD = "외부담당자";

/** 업무정리 API — 담당자(기존 피로도 컬럼을 담당자로 재사용) */
export const TASK_MANAGER_FIELD = "담당자";

const WORK_ASSIGNEE_KEYS = ["외부담당자", "업무담당", "인물담당", "상태"] as const;

/** 레거시: 예전 '상태' 헤더만 외부담당자로 매핑 (담당자와 분리) */
const LEGACY_WORK_ASSIGNEE_KEYS = ["상태"] as const;

/** 임직원별 보드 — 업무담당·인물담당·상태만 (담당자 제외) */
export function readWorkAssignee(row: Record<string, string | undefined | null>): string {
  for (const key of WORK_ASSIGNEE_KEYS) {
    const v = (row[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

/** 담당자 탭 — 담당자 열만 */
export function readTaskManager(row: Record<string, string | undefined | null>): string {
  const direct = (row[TASK_MANAGER_FIELD] ?? "").trim();
  if (direct) return direct;
  // 레거시: 예전 헤더 '피로도' → '담당자'
  return (row["피로도"] ?? "").trim();
}

/** 외부담당자 + 예전 '상태' 헤더 (담당자 열과 독립) */
export function readTaskAssignee(row: Record<string, string | undefined | null>): string {
  const direct = readWorkAssignee(row);
  if (direct) return direct;
  for (const key of LEGACY_WORK_ASSIGNEE_KEYS) {
    const v = (row[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

export type PersonnelAssigneeMode = "employee" | "manager";

export function readPersonnelAssignee(
  row: Record<string, string | undefined | null>,
  mode: PersonnelAssigneeMode,
): string {
  return mode === "manager" ? readTaskManager(row) : readWorkAssignee(row);
}

export function isTaskDone(raw: string | undefined | null): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "완료" || v === "✓";
}

function nameMatchesField(fieldValue: string, personName: string): boolean {
  const name = personName.trim();
  const assignee = fieldValue.trim();
  if (!name) return assignee === "";
  if (assignee === name) return true;
  return assignee.includes(name);
}

/** 외부담당자 이름 일치 (담당자 열과 독립) */
export function taskMatchesAssignee(
  row: Record<string, string | undefined | null>,
  personName: string,
): boolean {
  return nameMatchesField(readTaskAssignee(row), personName);
}

/** 담당자(내부) 이름 일치 */
export function taskMatchesManager(
  row: Record<string, string | undefined | null>,
  personName: string,
): boolean {
  return nameMatchesField(readTaskManager(row), personName);
}

export function taskMatchesPersonnelAssignee(
  row: Record<string, string | undefined | null>,
  personName: string,
  mode: PersonnelAssigneeMode,
): boolean {
  return nameMatchesField(readPersonnelAssignee(row, mode), personName);
}
