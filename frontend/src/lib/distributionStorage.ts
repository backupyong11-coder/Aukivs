/**
 * 플랫폼 유통 — 업체별 단계·제반/수행 체크리스트
 */

export type DistributionCheckItem = {
  id: string;
  label: string;
  done?: boolean;
};

export type DistributionStep = {
  id: string;
  order: number;
  title: string;
  summary: string;
  prerequisiteItems: DistributionCheckItem[];
  actionItems: DistributionCheckItem[];
  done?: boolean;
};

export type DistributionPlatform = {
  id: string;
  order: number;
  platform: string;
  communication: string;
  overview: string;
  site: string;
  loginId: string;
  loginPassword: string;
  notes: string;
  steps: DistributionStep[];
};

export type DistributionProfile = {
  version: 1;
  title: string;
  platforms: DistributionPlatform[];
};

export type ProgressStats = {
  done: number;
  total: number;
  percent: number;
};

const STORAGE_KEY = "worksheet_distribution_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ci(label: string, done = false): DistributionCheckItem {
  return { id: newId("dchk"), label, done };
}

function step(
  order: number,
  title: string,
  summary: string,
  prerequisiteItems: DistributionCheckItem[],
  actionItems: DistributionCheckItem[],
): DistributionStep {
  return {
    id: newId("dstep"),
    order,
    title,
    summary,
    prerequisiteItems,
    actionItems,
    done: false,
  };
}

function platform(
  order: number,
  data: Omit<DistributionPlatform, "id" | "order" | "steps"> & { steps: DistributionStep[] },
): DistributionPlatform {
  return { id: newId("dplat"), order, ...data };
}

/** CSV「오키브스 시트 - 유통방법」기준 초기 데이터 */
export function createDefaultDistributionProfile(): DistributionProfile {
  return {
    version: 1,
    title: "플랫폼 유통",
    platforms: [
      platform(1, {
        platform: "왓챠",
        communication: "선 메일 소통",
        overview:
          "담당자에게 먼저 작품 리스트/입점 희망작을 메일로 공유하고, 왓챠 쪽에서 업로드·등록 방식 안내를 받는 흐름입니다. CMS는 아직 개발 중이며 정산도 메일로 진행하므로 현재는 담당자 메일 기반 진행이 맞습니다.",
        site: "메일",
        loginId: "",
        loginPassword: "",
        notes: "",
        steps: [
          step(
            1,
            "담당자 사전 소통",
            "입점 전 담당자와 메일로 작품·일정을 공유합니다.",
            [ci("추가 유통 작품 리스트 정리"), ci("입점 희망작·런칭 희망일 선정")],
            [ci("담당자에게 작품 리스트/입점 희망작 메일 공유")],
          ),
          step(
            2,
            "등록 방식 확인·진행",
            "왓챠 쪽 안내에 따라 업로드·등록을 진행합니다.",
            [ci("왓챠 업로드·등록 방식 안내 메일 수령"), ci("필요 자료(원고·서지 등) 준비")],
            [ci("안내에 따라 작품 등록 진행 (현재 CMS 미개발 → 메일 기반)")],
          ),
          step(
            3,
            "등록 후 확인",
            "등록 완료 및 정산 연계를 확인합니다.",
            [ci("등록 완료 회신 확인")],
            [ci("정산·후속 일정 담당자와 메일로 확인")],
          ),
        ],
      }),
      platform(2, {
        platform: "미툰 / 미소설",
        communication: "FTP 올리고 메일 통보",
        overview:
          "최소 2주 전에 작품 입점 가이드라인과 서지정보 샘플을 참고해 원고/썸네일/표지/배너/서지정보를 준비한 뒤, 미소설 운영팀을 참조해서 서비스 요청 메일을 보냅니다. FTP 업로드 + 서지정보 작성 + 서비스 요청 메일 발송 방식입니다.",
        site: "FTP + 메일",
        loginId: "",
        loginPassword: "",
        notes: "오픈예정일 기준 최소 2주 전에 자료 전달 필요",
        steps: [
          step(
            1,
            "자료 준비 (최소 2주 전)",
            "가이드라인·샘플을 참고해 등록에 필요한 모든 파일을 준비합니다.",
            [
              ci("입점 가이드라인·서지정보 샘플 확인"),
              ci("오픈 희망일 확정 (2주 이상 여유)"),
            ],
            [
              ci("원고 파일 준비"),
              ci("서지정보 파일 작성"),
              ci("썸네일 / 표지 / 배너 리소스 준비"),
            ],
          ),
          step(
            2,
            "FTP 업로드",
            "작품별 자료를 FTP에 업로드합니다.",
            [ci("FTP 접속 정보·폴더 구조 확인")],
            [ci("작품별 자료 FTP 업로드")],
          ),
          step(
            3,
            "서비스 요청 메일",
            "미소설 운영팀을 참조해 서비스 요청 메일을 발송합니다.",
            [ci("미소설 운영팀 메일 주소 확인")],
            [ci("서비스 요청 메일 발송"), ci("메일 참조에 미소설 운영팀 추가")],
          ),
        ],
      }),
      platform(3, {
        platform: "무툰 / 큐툰",
        communication: "선 메일 소통",
        overview:
          "별도 CP CMS는 없고, 핑거스토리 안내에 따라 작품 등록용 메일로 원고와 서지정보를 보내거나 필요 시 웹하드/업로드 방식을 협의합니다.",
        site: "메일 (또는 웹하드 협의)",
        loginId: "",
        loginPassword: "",
        notes: "핑거스토리(운영사) 쪽 일정 확인 후 조율",
        steps: [
          step(
            1,
            "작품·자료 준비",
            "추가 유통 작품 리스트와 등록 자료를 정리합니다.",
            [ci("추가 작품 리스트 정리"), ci("오픈 희망일 확정")],
            [
              ci("작품별 서지정보 작성"),
              ci("원고 / 썸네일 / 표지 자료 준비"),
            ],
          ),
          step(
            2,
            "등록 요청",
            "작품 등록 메일로 자료를 전달합니다.",
            [ci("작품 등록용 메일 주소 확인")],
            [ci("작품 등록 메일로 자료 전달 (오픈 희망일 기재)"), ci("필요 시 웹하드·업로드 방식 협의")],
          ),
          step(
            3,
            "일정 조율",
            "핑거스토리 쪽 일정을 확인합니다.",
            [ci("전달 자료·일정 회신 대기")],
            [ci("핑거스토리 일정 확인·조율")],
          ),
        ],
      }),
      platform(4, {
        platform: "리디북스",
        communication: "직접 등록",
        overview:
          "리디 CP 사이트에서 직접 등록합니다. 로그인 후 [전자책 등록]에서 서지정보 입력 및 이미지.zip 파일 등록. 대량 등록도 가능합니다.",
        site: "https://cp.ridibooks.com/cp/login",
        loginId: "803-87-02636",
        loginPassword: "aukivs8910",
        notes: "추가 등록 전 CP 사이트 하단 사용자 가이드/FAQ로 파일 규격 재확인",
        steps: [
          step(
            1,
            "사전 확인",
            "가이드 기준으로 파일 규격을 재확인합니다.",
            [
              ci("CP 사이트 사용자 가이드 / FAQ 확인"),
              ci("웹툰 원고 이미지.zip 규격 확인"),
            ],
            [ci("CP 사이트 로그인")],
          ),
          step(
            2,
            "전자책 등록",
            "서지정보와 원고를 CP 사이트에 등록합니다.",
            [ci("서지정보·UCI·이미지.zip 준비")],
            [
              ci("[전자책 등록] 메뉴 진입"),
              ci("서지정보 입력"),
              ci("웹툰 원고 이미지.zip 등록"),
              ci("UCI 입력"),
            ],
          ),
          step(
            3,
            "등록 후 확인",
            "오류 발생 시 운영팀에 문의합니다.",
            [ci("등록 결과·노출 상태 확인")],
            [ci("오류 시 리디웹툰운영팀 문의")],
          ),
        ],
      }),
      platform(5, {
        platform: "투믹스 국내",
        communication: "메일 송부",
        overview: "국내 투믹스는 작품 자료를 메일로 송부하는 방식입니다.",
        site: "메일",
        loginId: "",
        loginPassword: "",
        notes: "",
        steps: [
          step(
            1,
            "자료 준비",
            "유통에 필요한 원고·서지·이미지를 준비합니다.",
            [ci("투믹스 국내 담당자·메일 주소 확인"), ci("파일 규격·명명 규칙 확인")],
            [ci("원고 / 썸네일 / 서지정보 준비")],
          ),
          step(
            2,
            "메일 송부",
            "준비한 자료를 담당자에게 메일로 전달합니다.",
            [ci("오픈 희망일·작품 정보 정리")],
            [ci("작품 자료 메일 송부"), ci("수신·등록 일정 회신 확인")],
          ),
        ],
      }),
      platform(6, {
        platform: "투믹스 글로벌",
        communication: "NAS 업로드",
        overview: "글로벌 투믹스는 NAS 업로드 방식으로 유통합니다.",
        site: "NAS",
        loginId: "",
        loginPassword: "",
        notes: "국내(메일)와 방식이 다름 — 글로벌 전용 NAS 경로 확인",
        steps: [
          step(
            1,
            "자료 준비",
            "글로벌 규격에 맞춰 원고·서지·이미지를 준비합니다.",
            [ci("NAS 접속 정보·업로드 경로 확인"), ci("글로벌 파일 규격 확인")],
            [ci("원고 / 썸네일 / 서지정보 준비")],
          ),
          step(
            2,
            "NAS 업로드",
            "작품별 폴더에 자료를 업로드합니다.",
            [ci("작품별 폴더 구조 확인")],
            [ci("NAS에 작품 자료 업로드"), ci("업로드 완료·등록 일정 확인")],
          ),
        ],
      }),
    ],
  };
}

function normalizeCheckItem(raw: unknown): DistributionCheckItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.label !== "string") return null;
  return { id: o.id, label: o.label, done: o.done === true };
}

function normalizeStep(raw: unknown, i: number): DistributionStep | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const prereq: DistributionCheckItem[] = [];
  const actions: DistributionCheckItem[] = [];
  if (Array.isArray(o.prerequisiteItems)) {
    o.prerequisiteItems.forEach((item) => {
      const n = normalizeCheckItem(item);
      if (n) prereq.push(n);
    });
  }
  if (Array.isArray(o.actionItems)) {
    o.actionItems.forEach((item) => {
      const n = normalizeCheckItem(item);
      if (n) actions.push(n);
    });
  }
  return {
    id: o.id,
    order: typeof o.order === "number" ? o.order : i + 1,
    title: typeof o.title === "string" ? o.title : "",
    summary: typeof o.summary === "string" ? o.summary : "",
    prerequisiteItems: prereq,
    actionItems: actions,
    done: o.done === true,
  };
}

function normalizePlatform(raw: unknown, i: number): DistributionPlatform | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const steps: DistributionStep[] = [];
  if (Array.isArray(o.steps)) {
    o.steps.forEach((s, j) => {
      const n = normalizeStep(s, j);
      if (n) steps.push(n);
    });
  }
  steps.sort((a, b) => a.order - b.order);
  return {
    id: o.id,
    order: typeof o.order === "number" ? o.order : i + 1,
    platform: typeof o.platform === "string" ? o.platform : "",
    communication: typeof o.communication === "string" ? o.communication : "",
    overview: typeof o.overview === "string" ? o.overview : "",
    site: typeof o.site === "string" ? o.site : "",
    loginId: typeof o.loginId === "string" ? o.loginId : "",
    loginPassword: typeof o.loginPassword === "string" ? o.loginPassword : "",
    notes: typeof o.notes === "string" ? o.notes : "",
    steps,
  };
}

export function normalizeDistributionProfile(raw: unknown): DistributionProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1) return null;
  if (!Array.isArray(p.platforms)) return null;
  const platforms: DistributionPlatform[] = [];
  p.platforms.forEach((pl, i) => {
    const n = normalizePlatform(pl, i);
    if (n) platforms.push(n);
  });
  platforms.sort((a, b) => a.order - b.order);
  return {
    version: 1,
    title: typeof p.title === "string" ? p.title : "플랫폼 유통",
    platforms,
  };
}

export function loadDistributionProfile(): DistributionProfile {
  if (typeof window === "undefined") return createDefaultDistributionProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultDistributionProfile();
    return normalizeDistributionProfile(JSON.parse(raw) as unknown) ?? createDefaultDistributionProfile();
  } catch {
    return createDefaultDistributionProfile();
  }
}

export function saveDistributionProfile(profile: DistributionProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function stepProgress(step: DistributionStep): ProgressStats {
  const items = [...step.prerequisiteItems, ...step.actionItems];
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function platformProgress(platform: DistributionPlatform): ProgressStats {
  let done = 0;
  let total = 0;
  for (const s of platform.steps) {
    const p = stepProgress(s);
    done += p.done;
    total += p.total;
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function overallProgress(platforms: DistributionPlatform[]): ProgressStats {
  let done = 0;
  let total = 0;
  for (const pl of platforms) {
    const p = platformProgress(pl);
    done += p.done;
    total += p.total;
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function syncStepDone(step: DistributionStep): DistributionStep {
  const p = stepProgress(step);
  return { ...step, done: p.total > 0 && p.done === p.total };
}

export { newId as distributionNewId };
