/**
 * 플랫폼 정산 — 업체별 방법 + 월별 체크 캘린더
 */

export type SettlementTaskType = "receive" | "invoice" | "withdraw" | "deposit" | "verify";

export type SettlementMonthlyTask = {
  id: string;
  /** 1~31, 해당 월의 일 */
  dayStart: number;
  dayEnd?: number;
  label: string;
  type: SettlementTaskType;
  /** 0=일 … 1=월 … 매주 반복 (선택) */
  recurringWeekday?: number;
  done?: boolean;
};

export type SettlementVendor = {
  id: string;
  order: number;
  company: string;
  settlementName: string;
  launchDate: string;
  flow: string;
  verifyFrequency: string;
  site: string;
  loginId: string;
  loginPassword: string;
  settlementDateNote: string;
  invoiceNote: string;
  depositDateNote: string;
  method: string;
  verifyMethod: string;
  monthlyTasks: SettlementMonthlyTask[];
  notes?: string;
};

export type SettlementProfile = {
  version: 1;
  title: string;
  vendors: SettlementVendor[];
};

const STORAGE_KEY = "worksheet_settlement_v1";

export const SETTLEMENT_TASK_META: Record<
  SettlementTaskType,
  { label: string; color: string; bg: string }
> = {
  receive: { label: "수령", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-950/50" },
  invoice: { label: "계산서", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-950/50" },
  withdraw: { label: "출금신청", color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-950/50" },
  deposit: { label: "입금", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-950/50" },
  verify: { label: "확인", color: "text-sky-700 dark:text-sky-300", bg: "bg-sky-100 dark:bg-sky-950/50" },
};

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function task(
  dayStart: number,
  label: string,
  type: SettlementTaskType,
  dayEnd?: number,
  recurringWeekday?: number,
): SettlementMonthlyTask {
  return {
    id: newId("stask"),
    dayStart,
    ...(dayEnd !== undefined ? { dayEnd } : {}),
    label,
    type,
    ...(recurringWeekday !== undefined ? { recurringWeekday } : {}),
    done: false,
  };
}

function vendor(
  order: number,
  data: Omit<SettlementVendor, "id" | "order" | "monthlyTasks"> & {
    monthlyTasks: SettlementMonthlyTask[];
  },
): SettlementVendor {
  return { id: newId("vendor"), order, ...data };
}

/** CSV「오키브스 시트 - 정산방법」기준 초기 데이터 */
export function createDefaultSettlementProfile(): SettlementProfile {
  return {
    version: 1,
    title: "플랫폼 정산",
    vendors: [
      vendor(1, {
        company: "무툰",
        settlementName: "무툰/큐툰",
        launchDate: "5.7",
        flow: "5월 판매 → 6월 10일까지 정산자료 수령 → 정산자료 받은 뒤 10일 이내 계산서 발행 → 6월 말 입금",
        verifyFrequency: "월마다 보내줌",
        site: "메일",
        loginId: "",
        loginPassword: "",
        settlementDateNote: "익월 10일",
        invoiceNote: "정산 후 10일 이내 계산서 발행",
        depositDateNote: "익월 말일",
        method:
          "운영사: 핑거스토리 / 무툰·큐툰 / 월 1회 / 매월 1~말일 판매분 / 결제수수료 10% 공제 후 순매출 70:30 / 1코인=100원 VAT 제외",
        verifyMethod: "CP사별 CMS 페이지 없음 — 메일·본문 안내",
        monthlyTasks: [
          task(10, "정산자료 수령", "receive"),
          task(11, "계산서 발행 (수령 후 10일 이내)", "invoice", 20),
          task(28, "입금 확인 (월말)", "deposit", 31),
        ],
      }),
      vendor(2, {
        company: "왓챠",
        settlementName: "WATCHA 웹툰",
        launchDate: "4.16, 4.23",
        flow: "5월 판매 → 6월 20일까지 월간 정산서 → 6월 말까지 세금계산서 → 7월 말 입금",
        verifyFrequency: "일주일마다 확인 가능",
        site: "메일",
        loginId: "",
        loginPassword: "",
        settlementDateNote: "익월 20일",
        invoiceNote: "말일까지 계산서 발행",
        depositDateNote: "그 다음 말일 입금",
        method: "매주 월요일 정산 메일 → 매월 20일 합산 정산서",
        verifyMethod: "매주 월요일 정산 메일 확인",
        monthlyTasks: [
          task(1, "매주 월요일 정산 메일 확인", "verify", undefined, 1),
          task(20, "월간 정산서 수령", "receive"),
          task(25, "세금계산서 발행", "invoice", 31),
        ],
      }),
      vendor(3, {
        company: "리디",
        settlementName: "CP 사이트",
        launchDate: "",
        flow: "5월 판매 → 6월 20일경 정산 리포트 → 약 2주 뒤 역발행·입금",
        verifyFrequency: "실시간 확인 가능",
        site: "https://cp.ridibooks.com/cp/login",
        loginId: "803-87-02636",
        loginPassword: "aukivs8910",
        settlementDateNote: "익월 20일",
        invoiceNote: "역발행",
        depositDateNote: "리포트 후 약 2주",
        method: "정산보고(25일) 후 약 2주 뒤 역발행 계산서 및 입금",
        verifyMethod: "CP 사이트 정산 메뉴",
        monthlyTasks: [
          task(20, "정산 리포트 메일 수령", "receive"),
          task(1, "역발행·입금 확인 (익월 초)", "deposit", 7),
        ],
      }),
      vendor(4, {
        company: "미툰앤노벨",
        settlementName: "CP 페이지",
        launchDate: "4.23",
        flow: "5월 수익 → 6월 1~4일 CMS 출금신청 → 6월 25일 입금",
        verifyFrequency: "실시간 확인 가능",
        site: "http://cp.me.co.kr/login.php",
        loginId: "Studioaukivs",
        loginPassword: "123456",
        settlementDateNote: "익월 25일",
        invoiceNote: "매월 4일까지 세금계산서 (과세/면세)",
        depositDateNote: "1~4일 신청 시 25일 입금",
        method: "CMS [정산신청] > [월별 정산금액] 조회 / [출금신청] 최소 1만원",
        verifyMethod: "CMS 로그인 > 정산신청 > 월별 정산금액",
        monthlyTasks: [
          task(1, "출금 신청 + 세금계산서", "withdraw", 4),
          task(25, "입금 확인", "deposit"),
        ],
      }),
      vendor(5, {
        company: "투믹스 국내",
        settlementName: "투믹스 국내",
        launchDate: "",
        flow: "5월 판매 → 6월 10일 이내 정산내역 → 6/1~10 계산서 → 6월 마지막 주 수요일 입금",
        verifyFrequency: "통계 보고서·관리자 사이트 (로그인 미확인)",
        site: "",
        loginId: "",
        loginPassword: "",
        settlementDateNote: "익월 10일",
        invoiceNote: "익월 1~10일",
        depositDateNote: "익월 마지막 주 수요일",
        method: "계약상 통계 보고서 또는 관리자 사이트",
        verifyMethod: "본문에서 위치 미확인",
        monthlyTasks: [
          task(1, "정산내역 수령", "receive", 10),
          task(1, "계산서·세금계산서 발행", "invoice", 10),
          task(22, "입금 확인 (마지막 주 수요일 전후)", "deposit", 28),
        ],
      }),
      vendor(6, {
        company: "투믹스 글로벌",
        settlementName: "투믹스 글로벌",
        launchDate: "",
        flow: "5월 판매 → 7월 10일 이내 정산 (익익월) → 7/1~10 계산서 → 7월 마지막 주 수요일",
        verifyFrequency: "통계 보고서·관리자 사이트",
        site: "",
        loginId: "",
        loginPassword: "",
        settlementDateNote: "익익월 10일",
        invoiceNote: "익익월 1~10일",
        depositDateNote: "익익월 마지막 주 수요일",
        method: "국내와 동일 주기, 2개월 후 정산",
        verifyMethod: "본문에서 위치 미확인",
        notes: "전월 판매 기준 2개월 뒤(익익월)에 아래 일정 적용",
        monthlyTasks: [
          task(1, "정산내역 수령 (익익월)", "receive", 10),
          task(1, "계산서 발행 (익익월)", "invoice", 10),
          task(22, "입금 확인 (익익월 말)", "deposit", 28),
        ],
      }),
    ],
  };
}

function normalizeMonthlyTask(raw: unknown, i: number): SettlementMonthlyTask | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const types: SettlementTaskType[] = ["receive", "invoice", "withdraw", "deposit", "verify"];
  const type = types.includes(o.type as SettlementTaskType) ? (o.type as SettlementTaskType) : "verify";
  return {
    id: o.id,
    dayStart: typeof o.dayStart === "number" ? o.dayStart : i + 1,
    ...(typeof o.dayEnd === "number" ? { dayEnd: o.dayEnd } : {}),
    label: typeof o.label === "string" ? o.label : "",
    type,
    ...(typeof o.recurringWeekday === "number" ? { recurringWeekday: o.recurringWeekday } : {}),
    done: o.done === true,
  };
}

function normalizeVendor(raw: unknown, i: number): SettlementVendor | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const tasksRaw = o.monthlyTasks;
  const monthlyTasks: SettlementMonthlyTask[] = [];
  if (Array.isArray(tasksRaw)) {
    tasksRaw.forEach((t, j) => {
      const item = normalizeMonthlyTask(t, j);
      if (item) monthlyTasks.push(item);
    });
  }
  return {
    id: o.id,
    order: typeof o.order === "number" ? o.order : i + 1,
    company: typeof o.company === "string" ? o.company : "",
    settlementName: typeof o.settlementName === "string" ? o.settlementName : "",
    launchDate: typeof o.launchDate === "string" ? o.launchDate : "",
    flow: typeof o.flow === "string" ? o.flow : "",
    verifyFrequency: typeof o.verifyFrequency === "string" ? o.verifyFrequency : "",
    site: typeof o.site === "string" ? o.site : "",
    loginId: typeof o.loginId === "string" ? o.loginId : "",
    loginPassword: typeof o.loginPassword === "string" ? o.loginPassword : "",
    settlementDateNote: typeof o.settlementDateNote === "string" ? o.settlementDateNote : "",
    invoiceNote: typeof o.invoiceNote === "string" ? o.invoiceNote : "",
    depositDateNote: typeof o.depositDateNote === "string" ? o.depositDateNote : "",
    method: typeof o.method === "string" ? o.method : "",
    verifyMethod: typeof o.verifyMethod === "string" ? o.verifyMethod : "",
    monthlyTasks,
    ...(typeof o.notes === "string" && o.notes ? { notes: o.notes } : {}),
  };
}

export function normalizeSettlementProfile(raw: unknown): SettlementProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1) return null;
  const vendorsRaw = p.vendors;
  if (!Array.isArray(vendorsRaw)) return null;
  const vendors: SettlementVendor[] = [];
  vendorsRaw.forEach((v, i) => {
    const item = normalizeVendor(v, i);
    if (item) vendors.push(item);
  });
  vendors.sort((a, b) => a.order - b.order);
  return {
    version: 1,
    title: typeof p.title === "string" ? p.title : "플랫폼 정산",
    vendors,
  };
}

export function loadSettlementProfile(): SettlementProfile {
  if (typeof window === "undefined") return createDefaultSettlementProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSettlementProfile();
    return normalizeSettlementProfile(JSON.parse(raw) as unknown) ?? createDefaultSettlementProfile();
  } catch {
    return createDefaultSettlementProfile();
  }
}

export function saveSettlementProfile(profile: SettlementProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export type CalendarTaskEntry = {
  vendorId: string;
  vendorName: string;
  task: SettlementMonthlyTask;
  day: number;
};

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 선택한 연·월에 표시할 정산 할 일 */
export function collectCalendarTasks(
  vendors: SettlementVendor[],
  year: number,
  month: number,
): Map<number, CalendarTaskEntry[]> {
  const dim = daysInMonth(year, month);
  const map = new Map<number, CalendarTaskEntry[]>();

  const push = (day: number, entry: CalendarTaskEntry) => {
    if (day < 1 || day > dim) return;
    const list = map.get(day) ?? [];
    list.push(entry);
    map.set(day, list);
  };

  for (const v of vendors) {
    for (const t of v.monthlyTasks) {
      const base = {
        vendorId: v.id,
        vendorName: v.company || v.settlementName,
        task: t,
      };
      if (t.recurringWeekday !== undefined) {
        for (let d = 1; d <= dim; d++) {
          const dow = new Date(year, month - 1, d).getDay();
          if (dow === t.recurringWeekday) {
            push(d, { ...base, day: d });
          }
        }
        continue;
      }
      const end = Math.min(t.dayEnd ?? t.dayStart, dim);
      for (let d = Math.max(1, t.dayStart); d <= end; d++) {
        push(d, { ...base, day: d });
      }
    }
  }
  return map;
}

export function reorderVendors(vendors: SettlementVendor[], sourceId: string, targetId: string): SettlementVendor[] {
  if (sourceId === targetId) return vendors;
  const from = vendors.findIndex((v) => v.id === sourceId);
  const to = vendors.findIndex((v) => v.id === targetId);
  if (from < 0 || to < 0) return vendors;
  const next = [...vendors];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((v, i) => ({ ...v, order: i + 1 }));
}

export { newId as settlementNewId };
