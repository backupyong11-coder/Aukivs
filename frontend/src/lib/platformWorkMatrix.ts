import type { WorksMasterItem } from "@/lib/worksMaster";
import type { PlatformMasterItem } from "@/lib/platformMaster";

/** 셀 상태: 참고 UI — 활성(체크) / 진행(톱니) / 초기(봉투) */
export type MatrixCellKind = "active" | "progress" | "early" | "none" | "blocked";

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

/** 플랫폼 연동 매트릭스(/platform-matrix) 열(플랫폼명) 사용자 순서 */
export const PLATFORM_MATRIX_COL_ORDER_STORAGE_KEY = "platform_work_matrix_col_labels_v1";

/** 플랫폼 연동 매트릭스(/platform-matrix) 셀별 UI 오버라이드(로컬 전용) */
export const PLATFORM_MATRIX_CELL_OVERRIDE_STORAGE_KEY = "platform_work_matrix_cell_overrides_v1";

export type MatrixCellOverride = "blocked";

function cellOverrideKey(workTitle: string, platformLabel: string): string {
  // human-readable + stable enough for local use
  return `${workTitle.trim()}||${platformLabel.trim()}`;
}

export function loadMatrixCellOverrides(): Record<string, MatrixCellOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PLATFORM_MATRIX_CELL_OVERRIDE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const obj = parsed as Record<string, unknown>;
    const out: Record<string, MatrixCellOverride> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (v === "blocked") out[k] = "blocked";
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMatrixCellOverrides(overrides: Record<string, MatrixCellOverride>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLATFORM_MATRIX_CELL_OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

export function getMatrixCellOverride(
  overrides: Record<string, MatrixCellOverride>,
  workTitle: string,
  platformLabel: string,
): MatrixCellOverride | null {
  const k = cellOverrideKey(workTitle, platformLabel);
  return overrides[k] ?? null;
}

export function setMatrixCellOverride(
  overrides: Record<string, MatrixCellOverride>,
  workTitle: string,
  platformLabel: string,
  next: MatrixCellOverride | null,
): Record<string, MatrixCellOverride> {
  const k = cellOverrideKey(workTitle, platformLabel);
  const out = { ...overrides };
  if (next) out[k] = next;
  else delete out[k];
  saveMatrixCellOverrides(out);
  return out;
}

export function loadMatrixColumnOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLATFORM_MATRIX_COL_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveMatrixColumnOrder(labels: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLATFORM_MATRIX_COL_ORDER_STORAGE_KEY, JSON.stringify(labels));
}

export function clearMatrixColumnOrder() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PLATFORM_MATRIX_COL_ORDER_STORAGE_KEY);
}

/** 저장된 플랫폼명 순서를 반영하고, 빠진 열·신규 열은 기본 모델 순서로 이어붙입니다. */
export function reorderPlatformWorkMatrix(
  model: PlatformWorkMatrixModel,
  preferredLabels: string[],
): PlatformWorkMatrixModel {
  if (preferredLabels.length === 0) return model;

  const labelSet = new Set(model.columns.map((c) => c.label));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const l of preferredLabels) {
    if (labelSet.has(l) && !seen.has(l)) {
      ordered.push(l);
      seen.add(l);
    }
  }
  for (const c of model.columns) {
    if (!seen.has(c.label)) {
      ordered.push(c.label);
      seen.add(c.label);
    }
  }

  const colByLabel = new Map(model.columns.map((c) => [c.label, c]));
  const columns = ordered.map((l) => colByLabel.get(l)!);
  const oldIndex = new Map(model.columns.map((c, i) => [c.label, i]));
  const rows = model.rows.map((r) => ({
    title: r.title,
    cells: ordered.map((l) => r.cells[oldIndex.get(l)!]),
  }));

  return { columns, rows };
}

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
