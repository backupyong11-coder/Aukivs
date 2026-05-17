/**
 * 마일스톤(로컬 전용) — 타임라인·간트 뷰용 브라우저 저장.
 */

export type MilestoneMarker = "flag" | "circle" | "diamond";

export type MilestoneCardSide = "above" | "below";

export type MilestoneItem = {
  id: string;
  /** 타임라인·간트에 짧게 표시 (예: A, B, M1) */
  shortLabel: string;
  title: string;
  /** 단일 일정 또는 범위 시작 */
  startYmd: string;
  /** 있으면 간트·타임라인 막대(종료일 포함) */
  endYmd?: string;
  /** 필터·표시용 프로젝트 이름 (예: 프로젝트 A) — 비우면 「기본」으로 취급 */
  project: string;
  /** 그룹 라벨 (예: Q1, 3–4월) — 프로젝트와 별도 메모 */
  group: string;
  critical: boolean;
  marker: MilestoneMarker;
  /** 타임라인 카드(설명)를 축 위/아래 중 어디에 둘지 */
  cardSide: MilestoneCardSide;
  order: number;
};

export type MilestoneBundle = {
  /** 2: view 기간·shortLabel·cardSide */
  version: 2;
  /** 화면 상단 제목 */
  title: string;
  /** 타임라인·간트 가로축 시작일 (YYYY-MM-DD) */
  viewStartYmd: string;
  /** 타임라인·간트 가로축 종료일 (YYYY-MM-DD, 포함) */
  viewEndYmd: string;
  items: MilestoneItem[];
};

const STORAGE_KEY = "worksheet_milestones_v1";
const PAD_DAYS = 4;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ms-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function padRangeFromItems(items: MilestoneItem[]): { start: string; end: string } | null {
  const r = items
    .map((it) => {
      const s = parseYmdToTime(it.startYmd);
      const e = it.endYmd ? parseYmdToTime(it.endYmd) : s;
      if (!Number.isFinite(s)) return null;
      return { s, e: Number.isFinite(e) ? e : s };
    })
    .filter((x): x is { s: number; e: number } => x != null);
  if (r.length === 0) return null;
  let minT = Math.min(...r.map((x) => x.s));
  let maxT = Math.max(...r.map((x) => x.e));
  minT -= PAD_DAYS * 86400000;
  maxT += PAD_DAYS * 86400000;
  const ds = new Date(minT);
  const de = new Date(maxT);
  return {
    start: `${ds.getUTCFullYear()}-${String(ds.getUTCMonth() + 1).padStart(2, "0")}-${String(ds.getUTCDate()).padStart(2, "0")}`,
    end: `${de.getUTCFullYear()}-${String(de.getUTCMonth() + 1).padStart(2, "0")}-${String(de.getUTCDate()).padStart(2, "0")}`,
  };
}

/** 모든 일정을 덮도록 표시 기간 제안 (여유 PAD_DAYS) */
export function suggestViewRangeFromItems(items: MilestoneItem[]): { viewStartYmd: string; viewEndYmd: string } | null {
  const pad = padRangeFromItems(items);
  if (!pad) return null;
  return { viewStartYmd: pad.start, viewEndYmd: pad.end };
}

function ymdFromUtcMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** v1 저장분 → v2 정규화 */
export function normalizeMilestoneBundle(raw: unknown): MilestoneBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title : "마일스톤";
  const itemsRaw = p.items;
  if (!Array.isArray(itemsRaw)) return null;

  const items: MilestoneItem[] = itemsRaw.map((row, i) => {
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : newId();
    const startYmd = typeof o.startYmd === "string" ? o.startYmd : formatTodayYmdLocal();
    const endYmd = typeof o.endYmd === "string" && o.endYmd.trim() ? o.endYmd.trim() : undefined;
    const shortLabel = typeof o.shortLabel === "string" ? o.shortLabel : "";
    const side: MilestoneCardSide =
      o.cardSide === "below" || o.cardSide === "above" ? o.cardSide : i % 2 === 0 ? "above" : "below";
    return {
      id,
      shortLabel,
      title: typeof o.title === "string" ? o.title : "",
      startYmd,
      endYmd,
      project: typeof o.project === "string" ? o.project : "기본",
      group: typeof o.group === "string" ? o.group : "일정",
      critical: Boolean(o.critical),
      marker:
        o.marker === "flag" || o.marker === "circle" || o.marker === "diamond" ? o.marker : "circle",
      cardSide: side,
      order: typeof o.order === "number" ? o.order : i,
    };
  });

  let viewStartYmd: string;
  let viewEndYmd: string;
  if (p.version === 2 && typeof p.viewStartYmd === "string" && typeof p.viewEndYmd === "string") {
    viewStartYmd = p.viewStartYmd;
    viewEndYmd = p.viewEndYmd;
  } else {
    const pad = padRangeFromItems(items);
    if (pad) {
      viewStartYmd = pad.start;
      viewEndYmd = pad.end;
    } else {
      const t = formatTodayYmdLocal();
      viewStartYmd = t;
      viewEndYmd = ymdFromUtcMs(parseYmdToTime(t) + 55 * 86400000);
    }
  }

  if (parseYmdToTime(viewEndYmd) < parseYmdToTime(viewStartYmd)) {
    [viewStartYmd, viewEndYmd] = [viewEndYmd, viewStartYmd];
  }

  return { version: 2, title, viewStartYmd, viewEndYmd, items };
}

export function createDefaultMilestoneBundle(): MilestoneBundle {
  const items: Omit<MilestoneItem, "id">[] = [
    {
      shortLabel: "A",
      title: "주요 7개 킬러 타이틀 일괄 UCI 행정 승인 신청",
      startYmd: "2026-03-24",
      project: "프로젝트 A",
      group: "3–4월",
      critical: false,
      marker: "flag",
      cardSide: "above",
      order: 0,
    },
    {
      shortLabel: "B",
      title: "핵심 신작(오피스 리벤지, 이모 최면) 왓챠 타겟 기획안 제출",
      startYmd: "2026-03-25",
      project: "프로젝트 A",
      group: "3–4월",
      critical: false,
      marker: "circle",
      cardSide: "below",
      order: 1,
    },
    {
      shortLabel: "C",
      title: "소울북스/로크미디어 여의도 출판만화 대형 미팅",
      startYmd: "2026-04-01",
      project: "프로젝트 A",
      group: "3–4월",
      critical: false,
      marker: "flag",
      cardSide: "above",
      order: 2,
    },
    {
      shortLabel: "D",
      title: "세종시 AI 융복합/영상 지원사업 문서 및 최종 PPT 발표자료 제출 마감 랠리",
      startYmd: "2026-04-09",
      endYmd: "2026-04-16",
      project: "프로젝트 B",
      group: "3–4월",
      critical: true,
      marker: "flag",
      cardSide: "below",
      order: 3,
    },
    {
      shortLabel: "E",
      title: "왓챠 대량 업로드 및 미툰 전송 오류 완벽 복구 완료",
      startYmd: "2026-04-17",
      project: "프로젝트 B",
      group: "3–4월",
      critical: false,
      marker: "flag",
      cardSide: "above",
      order: 4,
    },
  ];
  return {
    version: 2,
    title: "2026년 3–4월 주요 마일스톤",
    viewStartYmd: "2026-03-01",
    viewEndYmd: "2026-04-30",
    items: items.map((it) => ({ ...it, id: newId() })),
  };
}

export function loadMilestoneBundle(): MilestoneBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeMilestoneBundle(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveMilestoneBundle(bundle: MilestoneBundle): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* quota */
  }
}

export function createEmptyItem(order: number): MilestoneItem {
  const letter = String.fromCharCode(65 + (order % 26));
  return {
    id: newId(),
    shortLabel: letter,
    title: "",
    startYmd: formatTodayYmdLocal(),
    project: "기본",
    group: "일정",
    critical: false,
    marker: "circle",
    cardSide: order % 2 === 0 ? "above" : "below",
    order,
  };
}

/** 빈 값·공백은 「기본」 프로젝트로 묶음 */
export function milestoneProjectLabel(project: string | undefined): string {
  const t = (project ?? "").trim();
  return t || "기본";
}

/** 표시 구간 길이(시작~종료일 포함 일수) */
export function viewTotalDays(viewStartYmd: string, viewEndYmd: string): number {
  const a = parseYmdToTime(viewStartYmd);
  const b = parseYmdToTime(viewEndYmd);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function formatTodayYmdLocal(): string {
  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = String(seoul.getMonth() + 1).padStart(2, "0");
  const d = String(seoul.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseYmdToTime(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

export function daysBetweenInclusive(startYmd: string, endYmd: string): number {
  const a = parseYmdToTime(startYmd);
  const b = parseYmdToTime(endYmd);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** 표시용 짧은 날짜 (예 3.24) */
export function shortKoDate(ymd: string): string {
  const parts = ymd.split("-").map((x) => Number(x));
  const m = parts[1];
  const d = parts[2];
  if (!m || !d) return ymd;
  return `${m}.${d}`;
}
