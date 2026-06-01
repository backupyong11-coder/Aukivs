/** 서울(Asia/Seoul) 기준 YYYY-MM-DD — Intl만 사용(로케일 문자열을 Date로 다시 파싱하지 않음) */
export function formatSeoulYmd(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function seoulYmdPartsNow(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  const d = Number(parts.find((p) => p.type === "day")?.value ?? 0);
  return { year: y, month: m, day: d };
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

/** 업무정리 마감일·실행일 — HTML date input용 YYYY-MM-DD */
export function toDateInputValue(raw: string): string {
  return normalizeSheetDateYmd(raw) ?? "";
}

export function isTaskDateField(field: string): boolean {
  return field === "마감일" || field === "실행일";
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
