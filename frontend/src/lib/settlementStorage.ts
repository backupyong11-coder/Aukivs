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
  /** 세금계산서 발행 메일 (해당 시) */
  invoiceEmail: string;
  method: string;
  verifyMethod: string;
  monthlyTasks: SettlementMonthlyTask[];
  /** 업체별 자유 메모 */
  memo: string;
  notes?: string;
};

export type SettlementProfile = {
  version: 1;
  title: string;
  vendors: SettlementVendor[];
  /** 시드 데이터 갱신 버전 — 올리면 알려진 업체 본문만 병합 */
  seedRevision?: number;
};

export const SETTLEMENT_SEED_REVISION = 2;

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
    seedRevision: SETTLEMENT_SEED_REVISION,
    vendors: [
      vendor(1, {
        company: "무툰",
        settlementName: "무툰/큐툰/핑거스토리",
        launchDate: "5.7",
        flow:
          "5월 판매분 → 6월 10일까지 무툰/핑거스토리 정산자료(메일·서면) 대기 → 금액 확인 후 우리가 세금계산서 발행 → 6월 말 입금",
        verifyFrequency: "CP 실시간 확인 불가 — 정산자료를 메일/서면으로 수령·확인",
        site: "메일 (핑거스토리/무툰)",
        loginId: "",
        loginPassword: "",
        settlementDateNote: "익월 10일까지 정산자료",
        invoiceNote: "정산자료 수령 후 10일 이내 우리가 세금계산서 발행",
        depositDateNote: "계산서 정상 접수 시 해당 월 말일",
        invoiceEmail: "",
        method:
          "운영: 핑거스토리 / 무툰·큐툰 · 매월 1~말일 판매분 · 익월 10일까지 이메일/서면 정산자료 · 우리가 계산서 발행 · 월말 입금. CP 신청 구조 아님 — 자료 올 때까지 대기.",
        verifyMethod: "정산자료 메일/서면 수령 → 금액 확인 → 이상 없으면 세금계산서 발행",
        memo: "",
        notes:
          "관련: 2026.4.2 강지윤/핑거스토리 계약서 메일 · 2026.4.6 회사정보 회신. 무툰 사업자등록증 단독 첨부 메일은 미확인 — 계약서 참고.",
        monthlyTasks: [
          task(10, "정산자료 메일/서면 수령 (전월 1~말 판매분)", "receive"),
          task(11, "세금계산서 발행 (수령 후 10일 이내)", "invoice", 20),
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
        invoiceEmail: "",
        method: "매주 월요일 정산 메일 → 매월 20일 합산 정산서",
        verifyMethod: "매주 월요일 정산 메일 확인",
        memo: "",
        monthlyTasks: [
          task(1, "매주 월요일 정산 메일 확인", "verify", undefined, 1),
          task(20, "월간 정산서 수령", "receive"),
          task(25, "세금계산서 발행", "invoice", 31),
        ],
      }),
      vendor(3, {
        company: "리디",
        settlementName: "리디북스 CP",
        launchDate: "",
        flow:
          "5월 매출 → 6월 25일경 정산보고 메일 대기 → 약 2주 후 리디 역발행 계산서 + 입금 (우리 발행 아님, 확인·승인)",
        verifyFrequency: "CP [정산]·[통계] 탭 수시 확인 가능",
        site: "https://cp.ridibooks.com/cp/login",
        loginId: "803-87-02636",
        loginPassword: "aukivs8910",
        settlementDateNote: "익월 25일경 정산보고",
        invoiceNote: "역발행 — 리디가 계산서 발행, 우리 확인/승인",
        depositDateNote: "정산보고 약 2주 후",
        invoiceEmail: "",
        method:
          "익월 25일경 정산보고 메일 → 약 2주 뒤 역발행 세금계산서 + 입금. 우리가 먼저 계산서 발행하는 구조 아님.",
        verifyMethod: "CP [정산] 판매/정산 · [통계] · 하단 [정산 가이드]",
        memo: "",
        notes: "관련: 2026.5.11 리디웹툰운영팀 메일 · 우리 사업자등록증 2026.5.4 발송.",
        monthlyTasks: [
          task(25, "정산보고 메일 확인 (전월 매출)", "receive"),
          task(1, "역발행 계산서·입금 확인 (전월 보고 후 ~2주)", "deposit", 14),
          task(1, "CP [정산]·[통계] 탭 수시 확인", "verify", 31),
        ],
      }),
      vendor(4, {
        company: "미툰앤노벨",
        settlementName: "CP 페이지",
        launchDate: "4.23",
        flow: "5월 수익 → 6월 1~4일 CMS 출금신청 + 세금계산서 → 6월 25일 입금",
        verifyFrequency: "CMS 실시간 · 수익금 매일 새벽 3~4시 갱신",
        site: "http://cp.me.co.kr/login.php",
        loginId: "Studioaukivs",
        loginPassword: "123456",
        settlementDateNote: "매월 1~4일 신청 → 25일 입금",
        invoiceNote: "과세/면세 구분 · 매월 4일까지 세금계산서 발행",
        depositDateNote: "신청월 25일 (비영업일 다음 영업일)",
        invoiceEmail: "meent.manager@me.co.kr",
        method:
          "자사 플랫폼 익월(M+1) · 타 플랫폼 유통 익익월(M+2) 정산. 1~4일 출금신청(0원 이상, 마이너스는 이월). 4일까지 세금계산서(과세/면세·사업자등록증). 25일 입금. 신청금액=전월까지 수익−기지급(당월 제외).",
        verifyMethod: "CMS [정산신청] > [월별 정산금액] · [출금신청]",
        memo: "",
        notes:
          "계산서: ㈜미툰앤노벨 / 정현준 / 272-81-00259 / meent.manager@me.co.kr · 계좌 변경 시 서류 재제출.",
        monthlyTasks: [
          task(1, "CMS 출금신청 + 세금계산서 (과세/면세)", "withdraw", 4),
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
        invoiceEmail: "",
        method: "계약상 통계 보고서 또는 관리자 사이트",
        verifyMethod: "본문에서 위치 미확인",
        memo: "",
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
        invoiceEmail: "",
        method: "국내와 동일 주기, 2개월 후 정산",
        verifyMethod: "본문에서 위치 미확인",
        memo: "",
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
    invoiceEmail: typeof o.invoiceEmail === "string" ? o.invoiceEmail : "",
    method: typeof o.method === "string" ? o.method : "",
    verifyMethod: typeof o.verifyMethod === "string" ? o.verifyMethod : "",
    memo: typeof o.memo === "string" ? o.memo : "",
    monthlyTasks,
    ...(typeof o.notes === "string" && o.notes ? { notes: o.notes } : {}),
  };
}

const MERGE_BY_COMPANY = new Set(["무툰", "리디", "미툰앤노벨"]);

/** 알려진 업체 본문·일정을 시드로 병합 (memo·완료 체크는 유지) */
export function mergeSettlementSeedContent(profile: SettlementProfile): SettlementProfile {
  const rev = profile.seedRevision ?? 0;
  if (rev >= SETTLEMENT_SEED_REVISION) return profile;
  const defaults = createDefaultSettlementProfile();
  const byCompany = new Map(defaults.vendors.map((v) => [v.company, v]));
  return {
    ...profile,
    seedRevision: SETTLEMENT_SEED_REVISION,
    vendors: profile.vendors.map((v) => {
      const seed = byCompany.get(v.company);
      if (!seed || !MERGE_BY_COMPANY.has(v.company)) {
        return { ...v, memo: v.memo ?? "", invoiceEmail: v.invoiceEmail ?? "" };
      }
      const doneByLabel = new Map(v.monthlyTasks.map((t) => [t.label, t.done]));
      return {
        ...v,
        settlementName: seed.settlementName,
        flow: seed.flow,
        verifyFrequency: seed.verifyFrequency,
        settlementDateNote: seed.settlementDateNote,
        invoiceNote: seed.invoiceNote,
        depositDateNote: seed.depositDateNote,
        invoiceEmail: seed.invoiceEmail,
        method: seed.method,
        verifyMethod: seed.verifyMethod,
        notes: seed.notes,
        memo: v.memo ?? "",
        monthlyTasks: seed.monthlyTasks.map((t) => ({
          ...t,
          id: newId("stask"),
          done: doneByLabel.get(t.label) === true,
        })),
      };
    }),
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
  return mergeSettlementSeedContent({
    version: 1,
    title: typeof p.title === "string" ? p.title : "플랫폼 정산",
    seedRevision: typeof p.seedRevision === "number" ? p.seedRevision : 0,
    vendors,
  });
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
