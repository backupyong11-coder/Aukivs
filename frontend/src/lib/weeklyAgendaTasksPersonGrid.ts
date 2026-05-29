import { loadPersonnelBoard } from "@/lib/personnelBoardStorage";
import {
  readTaskManager,
  taskMatchesPersonnelAssignee,
  type PersonnelAssigneeMode,
} from "@/lib/taskAssignee";
import type { TaskSheetRow } from "@/lib/tasks";
import { addCalendarDays, normalizeSheetDateYmd, ymdFromParts } from "@/lib/sheetDates";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  emptyWeekdayCells,
  loadWeeklyAgendaWorkbook,
  type PersonGridRow,
  type PersonGridState,
  type WeekdayKey,
} from "@/lib/weeklyAgendaStorage";

export const WEEKLY_AGENDA_MANAGER_PINNED = ["김영화", "황승현", "문자빈"] as const;

export function compareWeeklyAgendaPersonName(a: string, b: string): number {
  if (a === "(담당자 없음)") return 1;
  if (b === "(담당자 없음)") return -1;
  const ia = WEEKLY_AGENDA_MANAGER_PINNED.indexOf(a as (typeof WEEKLY_AGENDA_MANAGER_PINNED)[number]);
  const ib = WEEKLY_AGENDA_MANAGER_PINNED.indexOf(b as (typeof WEEKLY_AGENDA_MANAGER_PINNED)[number]);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, "ko");
}

export type WeekColumnDef = {
  key: WeekdayKey;
  ymd: string;
  label: string;
  inRange: boolean;
};

function ymdInRange(ymd: string, from: string, to: string): boolean {
  const x = (ymd || "").trim();
  const a = (from || "").trim();
  const b = (to || "").trim();
  if (!x) return false;
  if (a && x < a) return false;
  if (b && x > b) return false;
  return true;
}

function parseYmdParts(ymd: string): { y: number; m: number; d: number } | null {
  const n = normalizeSheetDateYmd(ymd);
  if (!n) return null;
  const [y, m, d] = n.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** `from` 이 속한 주의 월요일 */
export function mondayOfWeekContaining(fromYmd: string): { y: number; m: number; d: number } | null {
  const parts = parseYmdParts(fromYmd);
  if (!parts) return null;
  const dow = new Date(parts.y, parts.m - 1, parts.d).getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(parts.y, parts.m, parts.d, delta);
}

const WEEKDAY_OFFSET: Record<WeekdayKey, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
};

/** 기간 탭 from/to → 월~금 열 정의 (예: 월 (5.18)) */
export function buildWeekColumnDefs(from: string, to: string): WeekColumnDef[] {
  const mon = mondayOfWeekContaining(from);
  if (!mon) {
    return WEEKDAY_KEYS.map((key) => ({
      key,
      ymd: "",
      label: WEEKDAY_LABELS[key],
      inRange: false,
    }));
  }
  return WEEKDAY_KEYS.map((key) => {
    const parts = addCalendarDays(mon.y, mon.m, mon.d, WEEKDAY_OFFSET[key]);
    const ymd = ymdFromParts(parts.y, parts.m, parts.d);
    return {
      key,
      ymd,
      label: `${WEEKDAY_LABELS[key]} (${parts.m}.${parts.d})`,
      inRange: ymdInRange(ymd, from, to),
    };
  });
}

function formatTaskLine(task: TaskSheetRow): string {
  const minor = (task["정량화 분"] ?? "").trim();
  const title = (task["업무명"] ?? "").trim();
  if (minor && title) return `${minor}\n${title}`;
  return title || minor || "(제목 없음)";
}

/** 일반 업무표 — 소분류(정량화 분) · 세부 내용(업무명) */
export function taskAgendaMinor(task: TaskSheetRow): string {
  return (task["정량화 분"] ?? "").trim();
}

export function taskAgendaDetails(task: TaskSheetRow): string {
  return (task["업무명"] ?? "").trim();
}

export function taskAgendaMajor(task: TaskSheetRow): string {
  return (task["분류"] ?? "").trim() || "미분류";
}

export function filterTasksByExecuteRange(
  items: TaskSheetRow[],
  from: string,
  to: string,
): TaskSheetRow[] {
  return items.filter((t) => ymdInRange((t["실행일"] ?? "").trim(), from, to));
}

/** 주간 아젠다 보드·인물별 보드·업무 담당자에서 행(인물) 목록 수집 */
export function collectWeeklyAgendaPersonNames(
  tasks: TaskSheetRow[],
  mode: PersonnelAssigneeMode = "manager",
): string[] {
  const seen = new Set<string>();
  const pinned: string[] = [];
  const rest: string[] = [];

  const add = (raw: string, forcePinned = false) => {
    const name = raw.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    if (forcePinned) pinned.push(name);
    else rest.push(name);
  };

  if (mode === "manager") {
    for (const p of WEEKLY_AGENDA_MANAGER_PINNED) add(p, true);
  }

  const personnelBoard = loadPersonnelBoard();
  for (const row of personnelBoard?.rows ?? []) add(row.name);

  const agendaWb = loadWeeklyAgendaWorkbook();
  const activeSheet =
    agendaWb?.sheets.find((s) => s.id === agendaWb.activeSheetId) ?? agendaWb?.sheets[0];
  for (const row of activeSheet?.state.personGrid?.rows ?? []) add(row.name);

  for (const sheet of agendaWb?.sheets ?? []) {
    for (const row of sheet.state.personGrid?.rows ?? []) add(row.name);
  }

  for (const task of tasks) {
    if (mode === "manager") add(readTaskManager(task));
    else add(task["외부담당자"] ?? "");
  }

  rest.sort((a, b) => a.localeCompare(b, "ko"));
  return [...pinned, ...rest];
}

type CellBuckets = Record<WeekdayKey, string[]>;

function emptyBuckets(): CellBuckets {
  return { mon: [], tue: [], wed: [], thu: [], fri: [] };
}

function bucketsToCells(buckets: CellBuckets): Record<WeekdayKey, string> {
  const cells = emptyWeekdayCells();
  for (const key of WEEKDAY_KEYS) {
    cells[key] = buckets[key].join("\n");
  }
  return cells;
}

/** 실행일·담당자 기준으로 인물×요일 그리드 자동 생성 */
export function buildAutoPersonGridFromTasks(
  tasks: TaskSheetRow[],
  from: string,
  to: string,
  personNames: string[],
  mode: PersonnelAssigneeMode = "manager",
): { grid: PersonGridState; weekColumns: WeekColumnDef[]; matchedCount: number } {
  const weekColumns = buildWeekColumnDefs(from, to);
  const ymdToKey = new Map<string, WeekdayKey>();
  for (const col of weekColumns) {
    if (col.inRange && col.ymd) ymdToKey.set(col.ymd, col.key);
  }

  const names = [...personNames];
  const seen = new Set(names.map((n) => n.trim()).filter(Boolean));
  const bucketsByPerson = new Map<string, CellBuckets>();
  for (const name of names) {
    bucketsByPerson.set(name, emptyBuckets());
  }
  const unassigned = emptyBuckets();
  let matchedCount = 0;

  for (const task of tasks) {
    const execNorm = normalizeSheetDateYmd(task["실행일"] ?? "");
    if (!execNorm || !ymdInRange(execNorm, from, to)) continue;
    const dayKey = ymdToKey.get(execNorm);
    if (!dayKey) continue;

    const line = formatTaskLine(task);
    let person =
      names.find((n) => taskMatchesPersonnelAssignee(task, n, mode)) ?? "";
    if (!person) {
      const manager = readTaskManager(task).trim();
      if (manager) {
        if (!seen.has(manager)) {
          seen.add(manager);
          names.push(manager);
          bucketsByPerson.set(manager, emptyBuckets());
        }
        person = manager;
      }
    }

    if (person && bucketsByPerson.has(person)) {
      bucketsByPerson.get(person)![dayKey].push(line);
      matchedCount += 1;
    } else {
      unassigned[dayKey].push(line);
      matchedCount += 1;
    }
  }

  const rows: PersonGridRow[] = names.map((name, order) => ({
    id: `auto-${name}`,
    name,
    order,
    cells: bucketsToCells(bucketsByPerson.get(name) ?? emptyBuckets()),
  }));

  const unassignedTotal = WEEKDAY_KEYS.reduce((acc, k) => acc + unassigned[k].length, 0);
  if (unassignedTotal > 0) {
    rows.push({
      id: "__unassigned__",
      name: "(담당자 없음)",
      order: rows.length,
      cells: bucketsToCells(unassigned),
    });
  }

  rows.sort((a, b) => compareWeeklyAgendaPersonName(a.name, b.name));
  const sortedRows = rows.map((r, order) => ({ ...r, order }));

  return {
    grid: { title: "인물별 주간", rows: sortedRows },
    weekColumns,
    matchedCount,
  };
}
