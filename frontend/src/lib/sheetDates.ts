/** 서울(Asia/Seoul) 기준 YYYY-MM-DD */
export function formatSeoulYmd(date: Date): string {
  const seoul = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = String(seoul.getMonth() + 1).padStart(2, "0");
  const d = String(seoul.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function seoulYmdPartsNow(): { year: number; month: number; day: number } {
  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return { year: seoul.getFullYear(), month: seoul.getMonth() + 1, day: seoul.getDate() };
}

export function seoulCalendarYearMonthNow(): { year: number; month: number } {
  const { year, month } = seoulYmdPartsNow();
  return { year, month };
}

export function normalizeSheetDateYmd(raw: string): string | null {
  const s = raw.trim().replace(/\./g, "-").replace(/\//g, "-").replace(/\s+/g, "");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

export function ymdFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addCalendarDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** 해당 날짜가 속한 주의 일요일(달력 열 시작) */
export function sundayWeekStart(y: number, m: number, d: number): { y: number; m: number; d: number } {
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  dt.setDate(dt.getDate() - dow);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}
