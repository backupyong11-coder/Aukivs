/**
 * 주간 아젠다(Weekly Agenda) 로컬 전용 — 브라우저 localStorage.
 * v2: 기간(시트)별 탭·여러 개 저장.
 */

export type MajorCategory = {
  id: string;
  name: string;
  order: number;
};

/** 대분류별 소분류 빠른 입력 라벨(선택). */
export type MinorPreset = {
  id: string;
  majorId: string;
  label: string;
  order: number;
};

export type AgendaRow = {
  id: string;
  majorId: string;
  minor: string;
  details: string;
  checklist: string;
  /** 체크 사항 열을 강조(빨간색) — 스크린샷의 긴급 표기용 */
  urgent: boolean;
};

export type WeeklyAgendaState = {
  version: 1;
  title: string;
  majors: MajorCategory[];
  minorPresets: MinorPreset[];
  rows: AgendaRow[];
};

/** 탭(기간) 한 장 — 내용은 v1 state와 동일 */
export type WeeklyAgendaSheet = {
  id: string;
  label: string;
  order: number;
  state: WeeklyAgendaState;
};

export type WeeklyAgendaWorkbook = {
  version: 2;
  activeSheetId: string;
  sheets: WeeklyAgendaSheet[];
};

const STORAGE_KEY_V2 = "worksheet_weekly_agenda_v2";
const STORAGE_KEY_V1 = "worksheet_weekly_agenda_v1";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultState(): WeeklyAgendaState {
  const m1 = newId();
  const m2 = newId();
  const m3 = newId();
  return {
    version: 1,
    title: "Weekly Agenda",
    majors: [
      { id: m1, name: "제작", order: 0 },
      { id: m2, name: "유통", order: 1 },
      { id: m3, name: "기타업무", order: 2 },
    ],
    minorPresets: [],
    rows: [],
  };
}

/** 새 탭 기본 이름 제안 (서울 날짜 기준) */
export function getSuggestedAgendaTabLabel(): string {
  if (typeof window === "undefined") return "새 기간";
  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = seoul.getMonth() + 1;
  const d = seoul.getDate();
  return `${y}년 ${m}월 ${d}일 기준`;
}

export function createSheetFromState(label: string, state: WeeklyAgendaState, order: number): WeeklyAgendaSheet {
  return {
    id: newId(),
    label: label.trim() || getSuggestedAgendaTabLabel(),
    order,
    state: { ...state, version: 1 } satisfies WeeklyAgendaState,
  };
}

/** 빈 템플릿으로 새 시트 (대분류만 있는 시작 상태) */
export function createNewEmptySheet(label: string, order: number): WeeklyAgendaSheet {
  return createSheetFromState(label.trim() || getSuggestedAgendaTabLabel(), createDefaultState(), order);
}

function migrateV1ToWorkbook(raw: WeeklyAgendaState): WeeklyAgendaWorkbook {
  const id = newId();
  return {
    version: 2,
    activeSheetId: id,
    sheets: [
      {
        id,
        label: raw.title?.trim() || "기본",
        order: 0,
        state: { ...raw, version: 1 },
      },
    ],
  };
}

function parseWorkbook(raw: unknown): WeeklyAgendaWorkbook | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 2 || typeof o.activeSheetId !== "string" || !Array.isArray(o.sheets)) return null;
  const sheets: WeeklyAgendaSheet[] = [];
  for (const item of o.sheets) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const st = s.state as WeeklyAgendaState | undefined;
    if (typeof s.id !== "string" || typeof s.label !== "string" || typeof s.order !== "number") continue;
    if (!st || st.version !== 1 || !Array.isArray(st.majors) || !Array.isArray(st.rows)) continue;
    sheets.push({
      id: s.id,
      label: s.label,
      order: s.order,
      state: st,
    });
  }
  if (sheets.length === 0) return null;
  const active = sheets.some((x) => x.id === o.activeSheetId) ? o.activeSheetId : sheets[0].id;
  return { version: 2, activeSheetId: active, sheets };
}

export function loadWeeklyAgendaWorkbook(): WeeklyAgendaWorkbook | null {
  if (typeof window === "undefined") return null;
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const wb = parseWorkbook(JSON.parse(rawV2) as unknown);
      if (wb) return wb;
    }
    const rawV1 = window.localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as WeeklyAgendaState;
      if (parsed?.version === 1 && Array.isArray(parsed.majors) && Array.isArray(parsed.rows)) {
        return migrateV1ToWorkbook(parsed);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWeeklyAgendaWorkbook(workbook: WeeklyAgendaWorkbook): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(workbook));
    try {
      window.localStorage.removeItem(STORAGE_KEY_V1);
    } catch {
      /* */
    }
  } catch {
    /* quota */
  }
}

/** 최초 진입용 워크북 */
export function createDefaultWorkbook(): WeeklyAgendaWorkbook {
  const sheet = createNewEmptySheet(getSuggestedAgendaTabLabel(), 0);
  return {
    version: 2,
    activeSheetId: sheet.id,
    sheets: [sheet],
  };
}

/** v1 호환: 단일 state 로드 (마이그레이션만) — UI는 워크북 사용 권장 */
export function loadWeeklyAgendaState(): WeeklyAgendaState | null {
  const wb = loadWeeklyAgendaWorkbook();
  if (!wb) return null;
  const sh = wb.sheets.find((s) => s.id === wb.activeSheetId) ?? wb.sheets[0];
  return sh?.state ?? null;
}

/** v1 호환: 저장 시 워크북이 있으면 활성 시트만 갱신 */
export function saveWeeklyAgendaState(state: WeeklyAgendaState): void {
  if (typeof window === "undefined") return;
  const wb = loadWeeklyAgendaWorkbook();
  if (!wb) {
    const initial = migrateV1ToWorkbook(state);
    saveWeeklyAgendaWorkbook(initial);
    try {
      window.localStorage.removeItem(STORAGE_KEY_V1);
    } catch {
      /* */
    }
    return;
  }
  const nextSheets = wb.sheets.map((s) =>
    s.id === wb.activeSheetId
      ? { ...s, state: { ...state, version: 1 } satisfies WeeklyAgendaState }
      : s,
  );
  saveWeeklyAgendaWorkbook({ ...wb, sheets: nextSheets });
}

export function createRow(majorId: string): AgendaRow {
  return {
    id: newId(),
    majorId,
    minor: "",
    details: "",
    checklist: "",
    urgent: false,
  };
}

export function createMajor(name: string, order: number): MajorCategory {
  return { id: newId(), name: name.trim() || "새 대분류", order };
}

export function createMinorPreset(majorId: string, label: string, order: number): MinorPreset {
  return { id: newId(), majorId, label: label.trim() || "항목", order };
}
