import { fetchBriefingToday, type BriefingTodayPayload } from "@/lib/briefing";
import { getApiBaseUrl } from "@/lib/apiBase";
import { fetchChecklist, type ChecklistItem } from "@/lib/checklist";
import { fetchTasks, type TaskSheetRow } from "@/lib/tasks";
import { fetchUploads, type UploadListIssue, type UploadListItem } from "@/lib/uploads";
import { fetchMemos, type MemoItem } from "@/lib/memos";
import { fetchPlatformMaster, type PlatformMasterItem } from "@/lib/platformMaster";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";
import { userFacingListError } from "@/lib/userFacingErrors";

export type HubLoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      briefing: BriefingTodayPayload;
      uploads: { items: UploadListItem[]; issues: UploadListIssue[] };
      memos: MemoItem[];
      memosError: string | null;
      checklist: ChecklistItem[];
      checklistError: string | null;
      platformMaster: PlatformMasterItem[];
      worksMaster: WorksMasterItem[];
      allTasks: Record<string, string>[];
      uploadRows: Record<string, string>[];
      platformRows: Record<string, string>[];
    }
  | { kind: "error"; message: string };

/** GET /tasks → 허브 state용: 값 trim */
function normalizeTaskSheetRow(row: TaskSheetRow): TaskSheetRow {
  const out: TaskSheetRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = (v ?? "").trim();
  }
  return out;
}

/** GET /upload-rows 한 행: 키·값 문자열 trim */
function normalizeUploadRowFromApi(row: unknown): Record<string, string> {
  if (!row || typeof row !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v).trim();
  }
  return out;
}

export async function fetchControlRoomHub(signal: AbortSignal): Promise<HubLoadState> {
  try {
    const [b, u, m, c, pm, wm, tr, uploadRowsRaw, platformRowsRaw] = await Promise.all([
      fetchBriefingToday({ signal }),
      fetchUploads({ signal }),
      fetchMemos({ signal }),
      fetchChecklist().catch(() => ({ ok: false as const, message: "체크리스트 로드 실패", items: [] })),
      fetchPlatformMaster().catch(() => ({ ok: false as const, items: [] as PlatformMasterItem[] })),
      fetchWorksMaster().catch(() => ({ ok: false as const, items: [] as WorksMasterItem[] })),
      fetchTasks(),
      fetch(`${getApiBaseUrl()}/upload-rows`).then((r) => r.json()).catch(() => []) as Promise<unknown[]>,
      fetch(`${getApiBaseUrl()}/platform-rows`).then((r) => r.json()).catch(() => []) as Promise<
        Record<string, string>[]
      >,
    ]);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!b.ok) {
      return { kind: "error", message: userFacingListError("briefing", b.message) };
    }
    return {
      kind: "ready",
      briefing: b.payload,
      uploads: u.ok ? { items: u.items, issues: u.issues } : { items: [], issues: [] },
      memos: m.ok ? m.items : [],
      memosError: m.ok ? null : userFacingListError("memos", m.message),
      checklist: c.ok ? c.items : [],
      checklistError: c.ok ? null : c.message,
      platformMaster: pm.ok ? pm.items : [],
      worksMaster: wm.ok ? wm.items : [],
      allTasks: tr.ok ? tr.items.map(normalizeTaskSheetRow) : [],
      uploadRows: Array.isArray(uploadRowsRaw) ? uploadRowsRaw.map(normalizeUploadRowFromApi) : [],
      platformRows: Array.isArray(platformRowsRaw) ? platformRowsRaw : [],
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return {
      kind: "error",
      message: e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.",
    };
  }
}
