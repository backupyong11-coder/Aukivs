import type { WorksMasterItem } from "@/lib/worksMaster";
import type { PlatformMasterItem } from "@/lib/platformMaster";

/** 셀 상태: 참고 UI — 활성(체크) / 진행(톱니) / 초기(봉투) */
export type MatrixCellKind = "active" | "progress" | "early" | "none";

export type PlatformColumn = {
  label: string;
  footerNote: string;
};

export type WorkMatrixRow = {
  title: string;
  cells: MatrixCellKind[];
};

export type PlatformWorkMatrixModel = {
  columns: PlatformColumn[];
  rows: WorkMatrixRow[];
};

function normCompact(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

/** 괄호 앞 별칭 등 */
function primaryNameToken(s: string): string {
  const t = s.trim();
  const cut = t.split(/[(\[（]/)[0]?.trim() ?? t;
  return cut;
}

export function tokenizeSites(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,，|/\n·、]+/)
    .map((t) => primaryNameToken(t))
    .filter(Boolean);
}

export function fieldMentionsPlatform(fieldValue: string, platformLabel: string): boolean {
  const pl = normCompact(platformLabel);
  const pv = normCompact(fieldValue);
  if (!pl) return false;
  if (!pv) return false;
  if (pv.includes(pl) || pl.includes(pv)) return true;
  for (const tok of tokenizeSites(fieldValue)) {
    const nt = normCompact(tok);
    if (!nt) continue;
    if (nt === pl || nt.includes(pl) || pl.includes(nt)) return true;
  }
  return false;
}

function workGet(w: WorksMasterItem, ...keys: string[]): string {
  for (const k of keys) {
    const v = w[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export function cellKindForWorkPlatform(
  w: WorksMasterItem,
  platformLabel: string,
): MatrixCellKind {
  const launched = workGet(w, "런칭된 사이트", "launched_sites");
  const activeSites = workGet(w, "연재중인 사이트", "active_sites");
  const uploadSites = workGet(w, "업로드해야 하는 사이트", "sites_to_upload");
  const pending = workGet(w, "대기중 사이트", "pending_sites");
  const contracted = workGet(w, "계약된 사이트", "contracted_sites");

  if (fieldMentionsPlatform(launched, platformLabel) || fieldMentionsPlatform(activeSites, platformLabel)) {
    return "active";
  }
  if (fieldMentionsPlatform(uploadSites, platformLabel)) {
    return "progress";
  }
  if (fieldMentionsPlatform(pending, platformLabel) || fieldMentionsPlatform(contracted, platformLabel)) {
    return "early";
  }
  return "none";
}

function platformDisplayName(p: PlatformMasterItem): string {
  return (p["플랫폼명"] ?? p["회사명"] ?? "").trim();
}

function footerNoteForPlatform(p: PlatformMasterItem): string {
  const parts = [
    p["마지막상황"],
    p["마지막 상황"],
    p["다음액션"],
    p["대기사유"],
    p["현재단계"],
  ]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  return parts[0] ?? "";
}

/** 작품×플랫폼 교차표 모델 */
export function buildPlatformWorkMatrix(
  works: WorksMasterItem[],
  platforms: PlatformMasterItem[],
): PlatformWorkMatrixModel {
  const platformLabels = [...new Set(platforms.map(platformDisplayName).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );

  const workRows = works.filter((w) => (w["작품명"] ?? "").trim());

  const noteByLabel = new Map<string, string>();
  for (const p of platforms) {
    const name = platformDisplayName(p);
    if (!name) continue;
    const note = footerNoteForPlatform(p);
    if (note && !noteByLabel.has(name)) noteByLabel.set(name, note);
  }

  const columns: PlatformColumn[] = platformLabels.map((label) => ({
    label,
    footerNote: noteByLabel.get(label) ?? "",
  }));

  const rows: WorkMatrixRow[] = workRows.map((w) => {
    const title = (w["작품명"] ?? "").trim();
    const cells = platformLabels.map((pl) => cellKindForWorkPlatform(w, pl));
    return { title, cells };
  });

  if (columns.length > 0) {
    return { columns, rows };
  }

  /* 플랫폼 마스터가 비었을 때: 작품 시트 열에서만 유추 */
  const inferred = new Set<string>();
  for (const w of workRows) {
    for (const raw of [
      workGet(w, "런칭된 사이트", "launched_sites"),
      workGet(w, "연재중인 사이트", "active_sites"),
      workGet(w, "업로드해야 하는 사이트", "sites_to_upload"),
      workGet(w, "대기중 사이트", "pending_sites"),
      workGet(w, "계약된 사이트", "contracted_sites"),
    ]) {
      for (const t of tokenizeSites(raw)) inferred.add(t);
    }
  }
  const fallbackCols = [...inferred].sort((a, b) => a.localeCompare(b, "ko"));
  const fbColumns: PlatformColumn[] = fallbackCols.map((label) => ({ label, footerNote: "" }));
  const fbRows: WorkMatrixRow[] = workRows.map((w) => ({
    title: (w["작품명"] ?? "").trim(),
    cells: fallbackCols.map((pl) => cellKindForWorkPlatform(w, pl)),
  }));

  return { columns: fbColumns, rows: fbRows };
}
