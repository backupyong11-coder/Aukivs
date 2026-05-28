import { normalizeSheetDateYmd, seoulYmdPartsNow, ymdFromParts } from "@/lib/sheetDates";
import { WORK_GENRE_FIELD } from "@/lib/worksGenre";

export type CountSlice = { label: string; count: number };

export type WorksDashboardStats = {
  total: number;
  productionDone: number;
  inProgress: number;
  completedStatus: number;
  upcomingSupply: number;
  genreSlices: CountSlice[];
  statusSlices: CountSlice[];
  formatSlices: CountSlice[];
  monthlySupply: { month: number; label: string; count: number }[];
  adultGeneral: { adult: number; general: number; other: number };
};

const BOOL_FIELD = "제작완료";
const STATUS_FIELD = "현재상태";
const FORMAT_FIELD = "형식(웹툰/웹소설 등)";
const ADULT_FIELD = "분류(일반/성인)";
const SUPPLY_FIELD = "첫 공급 일정";

function countByField(
  items: Record<string, string>[],
  field: string,
  limit = 8,
): CountSlice[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const raw = (it[field] ?? "").trim();
    const label = raw || "(미지정)";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([label, count]) => ({ label, count }));
  if (sorted.length > limit) {
    const rest = sorted.slice(limit).reduce((s, [, c]) => s + c, 0);
    if (rest > 0) top.push({ label: "기타", count: rest });
  }
  return top;
}

function isProductionDone(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "O" || v === "✓";
}

function isCompletedStatus(status: string): boolean {
  const s = status.trim();
  return s.includes("완결") || s.includes("완료");
}

function isInProgressStatus(status: string): boolean {
  const s = status.trim();
  if (!s) return false;
  if (isCompletedStatus(s)) return false;
  return s.includes("제작") || s.includes("연재") || s.includes("진행");
}

export function computeWorksDashboardStats(
  items: Record<string, string>[],
): WorksDashboardStats {
  let productionDone = 0;
  let completedStatus = 0;
  let inProgress = 0;
  let upcomingSupply = 0;
  let adult = 0;
  let general = 0;
  let other = 0;

  const { year, month, day } = seoulYmdPartsNow();
  const todayYmd = ymdFromParts(year, month, day);
  const monthCounts = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `${i + 1}월`,
    count: 0,
  }));

  for (const it of items) {
    if (isProductionDone(it[BOOL_FIELD] ?? "")) productionDone++;

    const status = it[STATUS_FIELD] ?? "";
    if (isCompletedStatus(status)) completedStatus++;
    else if (isInProgressStatus(status)) inProgress++;

    const supply = normalizeSheetDateYmd(it[SUPPLY_FIELD] ?? "");
    if (supply && supply >= todayYmd) upcomingSupply++;
    if (supply?.startsWith(String(year))) {
      const m = Number.parseInt(supply.slice(5, 7), 10);
      if (m >= 1 && m <= 12) monthCounts[m - 1].count++;
    }

    const ag = (it[ADULT_FIELD] ?? "").trim();
    if (ag.includes("성인") || ag === "19" || ag === "Y") adult++;
    else if (ag.includes("일반") || ag === "N") general++;
    else other++;
  }

  return {
    total: items.length,
    productionDone,
    inProgress,
    completedStatus,
    upcomingSupply,
    genreSlices: countByField(items, WORK_GENRE_FIELD),
    statusSlices: countByField(items, STATUS_FIELD),
    formatSlices: countByField(items, FORMAT_FIELD),
    monthlySupply: monthCounts,
    adultGeneral: { adult, general, other },
  };
}
