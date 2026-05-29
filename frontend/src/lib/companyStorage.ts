/**
 * 회사(오키브스) 대시보드 — 편집 가능 표 + localStorage
 */

export type CompanyColumn = { id: string; label: string };
export type CompanyRow = { id: string; cells: Record<string, string> };

export type CompanyTableSection = {
  id: string;
  title: string;
  columns: CompanyColumn[];
  rows: CompanyRow[];
};

export type CompanyProfile = {
  version: 1;
  companyName: string;
  subtitle: string;
  sections: CompanyTableSection[];
};

const STORAGE_KEY = "worksheet_company_profile_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function col(label: string): CompanyColumn {
  return { id: newId("col"), label };
}

function makeRow(columnIds: string[], values: string[]): CompanyRow {
  const cells: Record<string, string> = {};
  columnIds.forEach((cid, i) => {
    cells[cid] = values[i] ?? "";
  });
  return { id: newId("row"), cells };
}

function section(
  title: string,
  labels: string[],
  data: string[][],
): CompanyTableSection {
  const columns = labels.map((label) => col(label));
  const ids = columns.map((c) => c.id);
  return {
    id: newId("sec"),
    title,
    columns,
    rows: data.map((vals) => makeRow(ids, vals)),
  };
}

/** CSV(오키브스 시트) 기준 초기 데이터 */
export function createDefaultCompanyProfile(): CompanyProfile {
  return {
    version: 1,
    companyName: "주식회사 스튜디오오키브스",
    subtitle: "오키브스 · 회사 정보 · 매출 · 연락처",
    sections: [
      section("링크 · 시스템", ["항목", "URL / 값", "비고"], [
        ["오키브스", "https://studioaukivs.web.app/", ""],
        ["오키브스 공유 드라이브", "https://drive.google.com/drive/folders/0AC5Iw-vN_rvOUk9PVA", ""],
        ["문테크 내부 서버 ID", "aukivs", ""],
        ["문테크 내부 서버 PW", "#Richardk89", ""],
        ["QuickConnect 주소", "http://QuickConnect.to/cjswowjstkanswpdyd900228", ""],
        [
          "오키브스 프로젝트 매니저",
          "https://aukivs-project-manager.web.app/#projects/2f17149c-a2cd-44d4-bb6a-02a925a52324",
          "",
        ],
      ]),
      section("기업 개요", ["항목", "내용", "비고"], [
        ["기업명", "주식회사 스튜디오오키브스", ""],
        ["대표자", "김영화", ""],
        ["홈페이지", "https://studioaukivs.web.app/", ""],
        [
          "소재지 주소",
          "본점: 세종특별자치시 아름서1길 13-4, 202호 F 21호(아름동, 영토빌딩) / 우편번호 30100\n서울: 서울특별시 서초대로 23길 18, B동 102호 (우편번호 06573)",
          "",
        ],
        [
          "기업유형",
          "정보통신업 / (종목: 방송 프로그램 제작업, 음악 및 기타 오디오물 출판업)",
          "",
        ],
        ["사업자 등록번호", "사업자등록번호 803-87-02636 / 법인등록번호 110111-8459277", ""],
        ["설립일", "2022년 11월 01일", ""],
        ["통장", "우리은행", "우리은행 (세종시 지원금용)"],
        ["계좌번호", "1005-604-431973", "1005-604-499385"],
        ["2025년 매출액", "3천만원", ""],
        ["총 종사자 수", "2명", ""],
        ["신규채용계획", "2명", ""],
        ["가양사무실 주소", "서울특별시 강서구 화곡로68길 15 301호", ""],
        ["세종시 우편", "세종특별자치시 조치원읍 군청로 95 세종테크노파크 1층 111호 김세정 (010-9218-4062) 우편번호 30033", ""],
      ]),
      section("연도별 매출", ["년도", "매출액", "한글 표기"], [
        ["2022년", "₩ -", "0원"],
        ["2023년", "₩ 2,000,000", "2백만원"],
        ["2024년", "₩ 151,000,000", "1억5천백만원"],
        ["2025년", "₩ 41,000,000", "4천백만원"],
        ["2026년", "", ""],
        ["합계", "₩ 194,000,000", "1억9천4백만원"],
      ]),
      section("담당자 · 연락처", ["구분", "성명", "직급", "내선", "휴대폰", "E-mail"], [
        ["대표자", "김영화", "", "", "010-2278-3561", "young.kim@studioaukivs.com"],
        ["대표자", "김영화", "", "", "", "생년월일 1970.10.26"],
        ["근로자", "", "", "", "", "hyunok@studioaukivs.com"],
        ["근로자", "", "", "", "", "jabin0730@studioaukivs.com"],
        ["책임자", "황승현", "과장", "", "010-3018-9186", "hyunok@studioaukivs.com"],
        ["책임자", "문자빈", "대리", "", "010-4341-3781", "jabin0730@studioaukivs.com"],
        ["문제용 대표", "", "", "", "010-3649-5351", "mjymjwzlzl@gmail.com"],
      ]),
    ],
  };
}

function normalizeSection(raw: unknown): CompanyTableSection | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || typeof s.title !== "string") return null;
  const colsRaw = s.columns;
  const rowsRaw = s.rows;
  if (!Array.isArray(colsRaw) || !Array.isArray(rowsRaw)) return null;
  const columns: CompanyColumn[] = [];
  for (const c of colsRaw) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    columns.push({ id: o.id, label: typeof o.label === "string" ? o.label : "열" });
  }
  if (columns.length === 0) return null;
  const rows: CompanyRow[] = [];
  for (const r of rowsRaw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    const cellsRaw = o.cells;
    const cells: Record<string, string> = {};
    if (cellsRaw && typeof cellsRaw === "object") {
      for (const [k, v] of Object.entries(cellsRaw as Record<string, unknown>)) {
        cells[k] = v == null ? "" : String(v);
      }
    }
    rows.push({ id: o.id, cells });
  }
  return { id: s.id, title: s.title, columns, rows };
}

export function normalizeCompanyProfile(raw: unknown): CompanyProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.version !== 1) return null;
  const sectionsRaw = p.sections;
  if (!Array.isArray(sectionsRaw)) return null;
  const sections: CompanyTableSection[] = [];
  for (const s of sectionsRaw) {
    const sec = normalizeSection(s);
    if (sec) sections.push(sec);
  }
  if (sections.length === 0) return null;
  return {
    version: 1,
    companyName: typeof p.companyName === "string" ? p.companyName : "회사",
    subtitle: typeof p.subtitle === "string" ? p.subtitle : "",
    sections,
  };
}

export function loadCompanyProfile(): CompanyProfile {
  if (typeof window === "undefined") return createDefaultCompanyProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultCompanyProfile();
    const parsed = normalizeCompanyProfile(JSON.parse(raw) as unknown);
    return parsed ?? createDefaultCompanyProfile();
  } catch {
    return createDefaultCompanyProfile();
  }
}

export function saveCompanyProfile(profile: CompanyProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function parseRevenueNumber(raw: string): number {
  const s = raw.replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function computeCompanyKpis(profile: CompanyProfile) {
  const revenueSec = profile.sections.find((s) => s.title.includes("매출"));
  let totalRevenue = 0;
  let latestYear = "";
  let latestAmount = "";
  let employeeCount = "—";
  let founded = "—";

  for (const sec of profile.sections) {
    for (const row of sec.rows) {
      const vals = Object.values(row.cells).join(" ");
      const labels = sec.columns.map((c) => c.label);
      const firstCol = sec.columns[0]?.id;
      const key = firstCol ? (row.cells[firstCol] ?? "").trim() : "";
      if (key.includes("종사자")) {
        const vCol = sec.columns[1]?.id;
        if (vCol) employeeCount = row.cells[vCol]?.trim() || employeeCount;
      }
      if (key.includes("설립")) {
        const vCol = sec.columns[1]?.id;
        if (vCol) founded = row.cells[vCol]?.trim() || founded;
      }
    }
  }

  if (revenueSec) {
    const yearCol = revenueSec.columns[0]?.id;
    const amtCol = revenueSec.columns[1]?.id;
    for (const row of revenueSec.rows) {
      const year = yearCol ? (row.cells[yearCol] ?? "").trim() : "";
      const amt = amtCol ? (row.cells[amtCol] ?? "").trim() : "";
      if (year === "합계") {
        totalRevenue = parseRevenueNumber(amt);
      } else if (/^\d{4}/.test(year) && amt && !year.includes("합계")) {
        latestYear = year;
        latestAmount = amt;
      }
    }
  }

  return {
    totalRevenue,
    totalRevenueLabel: totalRevenue > 0 ? `₩ ${totalRevenue.toLocaleString("ko-KR")}` : "—",
    latestYear,
    latestAmount,
    employeeCount,
    founded,
    linkCount: profile.sections[0]?.rows.length ?? 0,
  };
}

export function revenueChartSlices(profile: CompanyProfile): { label: string; value: number }[] {
  const revenueSec = profile.sections.find((s) => s.title.includes("매출"));
  if (!revenueSec) return [];
  const yearCol = revenueSec.columns[0]?.id;
  const amtCol = revenueSec.columns[1]?.id;
  if (!yearCol || !amtCol) return [];
  const out: { label: string; value: number }[] = [];
  for (const row of revenueSec.rows) {
    const year = (row.cells[yearCol] ?? "").trim();
    if (!/^\d{4}/.test(year) || year.includes("합계")) continue;
    const val = parseRevenueNumber(row.cells[amtCol] ?? "");
    if (val > 0) out.push({ label: year.replace("년", ""), value: val });
  }
  return out;
}

export { newId as companyNewId };
