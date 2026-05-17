import { isHoliday } from "korean-holidays";

function seoulNoon(y: number, m: number, d: number): Date {
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00+09:00`,
  );
}

/** 서울 달력 기준 요일. 0=일 … 6=토 */
function seoulWeekdaySun0(y: number, m: number, d: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).formatToParts(seoulNoon(y, m, d));
  const w = parts.find((p) => p.type === "weekday")?.value ?? "";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

/** 캘린더에서 토·일 및 법정 공휴일·대체공휴일(서울 기준) */
export function isCalendarRestDay(y: number, m: number, d: number): boolean {
  const wd = seoulWeekdaySun0(y, m, d);
  if (wd === 0 || wd === 6) return true;
  return isHoliday(seoulNoon(y, m, d), { includeSubstitute: true }) != null;
}
