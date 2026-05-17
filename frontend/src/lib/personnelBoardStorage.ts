/**
 * 인물별 업무 표(로컬 전용) — 행=이름, 열=제작/유통/등 커스텀
 */

export type PersonnelCol = { id: string; label: string };
export type PersonnelRow = { id: string; name: string };

export type PersonnelBoardBundle = {
  version: 1;
  /** 표 제목 (주간 아젠다와 동일 UX) */
  title: string;
  columns: PersonnelCol[];
  rows: PersonnelRow[];
  /** rowId → colId → 내용 */
  cells: Record<string, Record<string, string>>;
};

const STORAGE_KEY = "worksheet_personnel_board_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultPersonnelColumns(): PersonnelCol[] {
  return [
    { id: newId("col"), label: "제작" },
    { id: newId("col"), label: "유통" },
    { id: newId("col"), label: "기타업무" },
  ];
}

export function createDefaultPersonnelBoard(): PersonnelBoardBundle {
  return {
    version: 1,
    title: "인물별",
    columns: defaultPersonnelColumns(),
    rows: [],
    cells: {},
  };
}

function normalizeBundle(raw: unknown): PersonnelBoardBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (Number(p.version) !== 1) return null;
  const colsRaw = p.columns;
  const rowsRaw = p.rows;
  if (!Array.isArray(colsRaw) || !Array.isArray(rowsRaw)) return null;

  const columns: PersonnelCol[] = colsRaw
    .map((c) => {
      const o = c as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : newId("col");
      const label = typeof o.label === "string" ? o.label : "열";
      return { id, label };
    })
    .filter((c) => c.id);

  if (columns.length === 0) {
    return createDefaultPersonnelBoard();
  }

  const rows: PersonnelRow[] = rowsRaw.map((r) => {
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : newId("row");
    const name = typeof o.name === "string" ? o.name : "";
    return { id, name };
  });

  const cellsIn = p.cells;
  const cells: Record<string, Record<string, string>> = {};
  if (cellsIn && typeof cellsIn === "object" && !Array.isArray(cellsIn)) {
    for (const row of rows) {
      cells[row.id] = {};
      const rowObj = (cellsIn as Record<string, unknown>)[row.id];
      if (!rowObj || typeof rowObj !== "object" || Array.isArray(rowObj)) continue;
      for (const col of columns) {
        const v = (rowObj as Record<string, unknown>)[col.id];
        cells[row.id][col.id] = typeof v === "string" ? v : "";
      }
    }
  } else {
    for (const row of rows) {
      cells[row.id] = {};
      for (const col of columns) {
        cells[row.id][col.id] = "";
      }
    }
  }

  return {
    version: 1,
    title: typeof p.title === "string" ? p.title : "인물별",
    columns,
    rows,
    cells,
  };
}

export function loadPersonnelBoard(): PersonnelBoardBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeBundle(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function savePersonnelBoard(bundle: PersonnelBoardBundle): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* quota */
  }
}

export function ensureCellGrid(bundle: PersonnelBoardBundle): PersonnelBoardBundle {
  const cells = { ...bundle.cells };
  for (const row of bundle.rows) {
    if (!cells[row.id]) cells[row.id] = {};
    for (const col of bundle.columns) {
      if (cells[row.id][col.id] === undefined) cells[row.id][col.id] = "";
    }
  }
  return { ...bundle, cells };
}

export function newPersonnelEntityId(kind: "row" | "col"): string {
  return newId(kind);
}
