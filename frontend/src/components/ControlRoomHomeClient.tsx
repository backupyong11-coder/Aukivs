"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchBriefingToday, type BriefingTodayPayload } from "@/lib/briefing";
import { getApiBaseUrl } from "@/lib/apiBase";
import {
  loadFavoriteQueries,
  loadRecentQueries,
  pushRecentQuery,
  toggleFavoriteQuery,
} from "@/lib/controlRoomQueryHistory";
import { fetchChecklist, type ChecklistItem } from "@/lib/checklist";
import { fetchTasks, type TaskSheetRow } from "@/lib/tasks";
import {
  duplicateUploadIdsFromIssues,
  fetchUploads,
  type UploadListIssue,
  type UploadListItem,
} from "@/lib/uploads";
import { fetchMemos, type MemoItem } from "@/lib/memos";
import { fetchPlatformMaster, type PlatformMasterItem } from "@/lib/platformMaster";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";
import { userFacingListError } from "@/lib/userFacingErrors";

function formatSeoulYmd(date: Date): string {
  const seoul = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = String(seoul.getMonth() + 1).padStart(2, "0");
  const d = String(seoul.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function seoulCalendarYearMonthNow(): { year: number; month: number } {
  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return { year: seoul.getFullYear(), month: seoul.getMonth() + 1 };
}

function isUploadOnSeoulDay(iso: string, ymd: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return formatSeoulYmd(new Date(t)) === ymd;
}

function isUploadThisSeoulWeek(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const seoulNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = seoulNow.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(seoulNow);
  monday.setDate(seoulNow.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return t >= monday.getTime() && t < sunday.getTime();
}

function isUploadToday(iso: string): boolean {
  return isUploadOnSeoulDay(iso, formatSeoulYmd(new Date()));
}

function normalizeSheetDateYmd(raw: string): string | null {
  const s = raw.trim().replace(/\./g, "-").replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function uploadLooksIncomplete(status: string | null): boolean {
  if (!status || !status.trim()) return true;
  const s = status.trim().toLowerCase();
  const done = ["업로드 완료", "완료", "완료됨", "완", "done", "complete", "ok"];
  return !done.some((x) => s === x || s.includes(x));
}

function isTrue(v: unknown): boolean {
  return v === true || String(v).trim().toUpperCase() === "TRUE";
}

/** 플랫폼정리 시트: G(진행중) 또는 H(완료) 체크된 행만 */
function platformRowGhChecked(p: PlatformMasterItem): boolean {
  return isTrue(p["진행중"]) || isTrue(p["완료"]);
}

/** D열 성인웹툰(구 헤더명 일반계약) 체크 + G|H — 시트 헤더 변경 전후 모두 허용 */
function platformAdultWebtoonRow(p: PlatformMasterItem): boolean {
  const dChecked = isTrue(p["성인웹툰"]) || isTrue(p["일반계약"]);
  return dChecked && platformRowGhChecked(p);
}

/** C열 지원사업 체크 + G|H */
function platformSubsidyBizRow(p: PlatformMasterItem): boolean {
  return isTrue(p["지원사업"]) && platformRowGhChecked(p);
}

/** 업무정리 D열(분류) 값으로 탭 구분 — '전체'는 필터 없음, 나머지는 '나머지업무' 등으로 귀속 */
type TaskFilterTab =
  | "전체"
  | "유통관련"
  | "작품제작"
  | "업무미팅"
  | "지원사업"
  | "협력제작"
  | "작품수정"
  | "컬러판형"
  | "작품업로드"
  | "나머지업무";

const TASK_CATEGORY_TABS: { id: TaskFilterTab; label: string }[] = [
  { id: "전체", label: "전체" },
  { id: "유통관련", label: "유통관련" },
  { id: "작품업로드", label: "작품업로드" },
  { id: "작품제작", label: "작품제작" },
  { id: "업무미팅", label: "업무미팅" },
  { id: "지원사업", label: "지원사업" },
  { id: "협력제작", label: "협력제작" },
  { id: "작품수정", label: "작품수정" },
  { id: "컬러판형", label: "컬러판형" },
  { id: "나머지업무", label: "나머지업무" },
];

function bucketFromClassification(d: string): Exclude<TaskFilterTab, "전체"> {
  const t = d.trim();
  if (t.includes("유통관련")) return "유통관련";
  if (t.includes("작품제작")) return "작품제작";
  if (t.includes("업무미팅")) return "업무미팅";
  if (t.includes("지원사업")) return "지원사업";
  if (t.includes("협력제작")) return "협력제작";
  if (t.includes("작품수정")) return "작품수정";
  if (t.includes("컬러판형")) return "컬러판형";
  if (t.includes("작품업로드")) return "작품업로드";
  return "나머지업무";
}

/** 시트 E→D→C→G→H→I→J */
function taskRowSubLines(t: TaskSheetRow): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, key: string) => {
    const v = (t[key] ?? "").trim();
    if (v) rows.push({ label, value: v });
  };
  push("우선순위", "우선순위");
  push("분류", "분류");
  push("관련플랫폼", "관련플랫폼");
  push("정량화", "정량화");
  push("난이도", "난이도");
  push("피로도", "피로도");
  push("상태", "상태");
  return rows;
}

function RemainingTasksPanel(props: {
  items: TaskSheetRow[];
  /** 남은 일(미완료) / 오늘 할 일(마감일=오늘) */
  variant?: "remaining" | "today";
  todayYmd?: string;
}) {
  const [tab, setTab] = useState<TaskFilterTab>("전체");
  const filtered = useMemo(() => {
    if (tab === "전체") return props.items;
    return props.items.filter(
      (row) => bucketFromClassification(row["분류"] ?? "") === tab,
    );
  }, [props.items, tab]);

  const tabBtn =
    "shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors";
  const tabOn = "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900";
  const tabOff =
    "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

  const summaryLine =
    props.variant === "today" && props.todayYmd
      ? (
          <>
            마감일 <span className="font-mono">{props.todayYmd}</span>
            {" "}
            · <span className="font-semibold text-zinc-700 dark:text-zinc-300">{props.items.length}</span>
            건 · D열 분류로 필터
          </>
        )
      : (
          <>
            미완료 <span className="font-semibold text-zinc-700 dark:text-zinc-300">{props.items.length}</span>
            건 · D열 분류로 필터
          </>
        );

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{summaryLine}</p>
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TASK_CATEGORY_TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`${tabBtn} ${tab === x.id ? tabOn : tabOff}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <ul className="grid max-h-[min(70vh,26rem)] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <li className="col-span-full text-sm text-zinc-500 dark:text-zinc-400">
            {tab === "전체" ? "표시할 항목이 없습니다." : "이 분류에 해당하는 항목이 없습니다."}
          </li>
        ) : (
          filtered.map((row, i) => {
            const title = (row["업무명"] ?? "").trim() || "(제목 없음)";
            const subs = taskRowSubLines(row);
            const key = row["id"] ? String(row["id"]) : `task-${tab}-${i}`;
            return (
              <li
                key={key}
                className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                <p className="font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{title}</p>
                {subs.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                    {subs.map((s, j) => (
                      <li key={`${s.label}-${j}`}>
                        <span className="text-zinc-500 dark:text-zinc-500">{s.label}</span>
                        {" "}
                        <span className="text-zinc-700 dark:text-zinc-300">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      <Link
        href="/tasks"
        className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
      >
        업무정리 시트 →
      </Link>
    </div>
  );
}

/** K열 우선, 비어 있으면 회사명 */
function platformOngoingMainTitle(p: PlatformMasterItem): string {
  const stage = (p["현재단계"] ?? "").trim();
  if (stage) return stage;
  return (p["회사명"] ?? "").trim();
}

/** I → L → M → N → O (계약, 마지막업데이트, 마지막 상황, 대기사유, 다음액션) */
function platformOngoingProjectSubLines(p: PlatformMasterItem): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, raw: string | undefined) => {
    const v = (raw ?? "").trim();
    if (v) rows.push({ label, value: v });
  };
  push("계약", p["계약"]);
  push(
    "마지막업데이트",
    p["마지막업데이트날짜"] ?? p["마지막업데이트"],
  );
  push("마지막 상황", p["마지막상황"] ?? p["마지막 상황"]);
  push("대기사유", p["대기사유"]);
  push("다음액션", p["다음액션"]);
  return rows;
}

function PlatformOngoingProjectPanel(props: {
  adultRows: PlatformMasterItem[];
  subsidyRows: PlatformMasterItem[];
}) {
  const [tab, setTab] = useState<"adult" | "subsidy">("adult");
  const rows = tab === "adult" ? props.adultRows : props.subsidyRows;
  const tabBtn =
    "flex-1 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition-colors";
  const tabActive = "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50";
  const tabIdle =
    "border-transparent bg-zinc-100/80 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-800";
  const emptyHint =
    tab === "adult"
      ? "성인웹툰(D)·진행중/완료(G·H) 조건에 맞는 행이 없습니다."
      : "지원사업(C)·진행중/완료(G·H) 조건에 맞는 행이 없습니다.";

  return (
    <div className="space-y-2">
      <div className="flex gap-0">
        <button
          type="button"
          className={`${tabBtn} ${tab === "adult" ? tabActive : tabIdle}`}
          onClick={() => setTab("adult")}
        >
          성인웹툰
        </button>
        <button
          type="button"
          className={`${tabBtn} ${tab === "subsidy" ? tabActive : tabIdle}`}
          onClick={() => setTab("subsidy")}
        >
          지원사업
        </button>
      </div>
      <ul className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto border border-t-0 border-zinc-200 bg-white p-2 sm:grid-cols-2 dark:border-zinc-700 dark:bg-zinc-950">
        {rows.length === 0 ? (
          <li className="col-span-full text-sm text-zinc-500 dark:text-zinc-400">{emptyHint}</li>
        ) : (
          rows.map((p, i) => {
            const main = platformOngoingMainTitle(p);
            const subs = platformOngoingProjectSubLines(p);
            return (
              <li
                key={p["id"] ? String(p["id"]) : `pf-${tab}-${i}`}
                className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{main || "(제목 없음)"}</p>
                {subs.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                    {subs.map((s) => (
                      <li key={s.label}>
                        <span className="text-zinc-500 dark:text-zinc-500">{s.label}</span>
                        {" "}
                        <span className="text-zinc-700 dark:text-zinc-300">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function safeInt(v: unknown): number {
  try {
    const s = String(v ?? "").trim();
    if (!s || s === "-") return 0;
    return Math.floor(parseFloat(s)) || 0;
  } catch { return 0; }
}

const SUGGESTED_QUERIES: { id: string; label: string }[] = [
  { id: "due_today", label: "오늘 마감 뭐야" },
  { id: "week_upload", label: "이번 주 업로드 일정 보여줘" },
  { id: "incomplete_check", label: "미완료 체크리스트만 보여줘" },
  { id: "upload_gaps", label: "업로드 누락 자료 찾아줘" },
  { id: "data_bad", label: "데이터 이상한 항목 보여줘" },
  { id: "dup_id", label: "중복 id 있는 업로드 보여줘" },
  { id: "platform_stub", label: "미툰 관련 자료만 보여줘" },
  { id: "today_triage", label: "오늘 손봐야 할 것만 정리해줘" },
  { id: "memo_all", label: "메모장 전체 보기" },
];

type HubLoadState =
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

type PanelState =
  | { kind: "welcome" }
  | { kind: "nl_stub"; query: string }
  | { kind: "loading"; label: string }
  | { kind: "error"; message: string }
  | { kind: "render"; title: string; node: ReactNode };

export function ControlRoomHomeClient() {
  const [hub, setHub] = useState<HubLoadState>({ kind: "loading" });
  const [panel, setPanel] = useState<PanelState>({ kind: "welcome" });
  const [queryDraft, setQueryDraft] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const refreshHistory = useCallback(() => {
    setRecent(loadRecentQueries());
    setFavorites(loadFavoriteQueries());
  }, []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  const [hubRefreshKey, setHubRefreshKey] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setHub({ kind: "loading" });
      try {
        const [b, u, m, c, pm, wm, tasksRaw, uploadRowsRaw, platformRowsRaw] = await Promise.all([
          fetchBriefingToday({ signal: ac.signal }),
          fetchUploads({ signal: ac.signal }),
          fetchMemos({ signal: ac.signal }),
          fetchChecklist().catch(() => ({ ok: false as const, message: "체크리스트 로드 실패", items: [] })),
          fetchPlatformMaster().catch(() => ({ ok: false as const, items: [] as PlatformMasterItem[] })),
          fetchWorksMaster().catch(() => ({ ok: false as const, items: [] as WorksMasterItem[] })),
          fetch(`${getApiBaseUrl()}/tasks`).then(r => r.json()).catch(() => []) as Promise<Record<string, string>[]>,
          fetch(`${getApiBaseUrl()}/upload-rows`).then(r => r.json()).catch(() => []) as Promise<Record<string, string>[]>,
          fetch(`${getApiBaseUrl()}/platform-rows`).then(r => r.json()).catch(() => []) as Promise<Record<string, string>[]>,
        ]);
        if (ac.signal.aborted) return;
        if (!b.ok) { setHub({ kind: "error", message: userFacingListError("briefing", b.message) }); return; }
        if (!u.ok) { setHub({ kind: "error", message: userFacingListError("uploads", u.message) }); return; }
        setHub({
          kind: "ready",
          briefing: b.payload,
          uploads: { items: u.items, issues: u.issues },
          memos: m.ok ? m.items : [],
          memosError: m.ok ? null : userFacingListError("memos", m.message),
          checklist: c.ok ? c.items : [],
          checklistError: c.ok ? null : c.message,
          platformMaster: pm.ok ? pm.items : [],
          worksMaster: wm.ok ? wm.items : [],
          allTasks: Array.isArray(tasksRaw) ? tasksRaw : [],
          uploadRows: Array.isArray(uploadRowsRaw) ? uploadRowsRaw : [],
          platformRows: Array.isArray(platformRowsRaw) ? platformRowsRaw : [],
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (ac.signal.aborted) return;
        setHub({ kind: "error", message: e instanceof Error ? e.message : "데이터를 불러오지 못했습니다." });
      }
    })();
    return () => ac.abort();
  }, [hubRefreshKey]);

  const quickStats = useMemo(() => {
    if (hub.kind !== "ready") return null;
    const { briefing, uploads } = hub;
    const dupIssues = uploads.issues.filter((x) => x.kind === "duplicate_id");
    const skipped = uploads.issues.filter((x) => x.kind === "row_skipped");
    const dataOdd = skipped.length + briefing.warnings.length + dupIssues.length;
    return {
      overdueUploadBriefing: briefing.summary.overdue_upload_count,
      dataOdd,
      dupIdGroups: dupIssues.length,
    };
  }, [hub]);

  const dashStats = useMemo(() => {
    if (hub.kind !== "ready") return null;
    const todayYmd = formatSeoulYmd(new Date());

    // 오늘 기준 (마감일 B열 = 오늘인 것)
    const today_tasks = hub.allTasks.filter(t => normalizeSheetDateYmd(t["마감일"] ?? "") === todayYmd);
    const today_total = today_tasks.length;
    const today_done = today_tasks.filter(t => isTrue(t["완료"])).length;
    const today_undone = today_tasks.filter(t => !isTrue(t["완료"])).length;

    // 전체 업무
    const total_done_tasks = hub.allTasks.filter(t => isTrue(t["완료"])).length;
    const total_undone_tasks = hub.allTasks.filter(t => !isTrue(t["완료"])).length;

    // 긴급/끝내고 (완료 안 된 것 중)
    const urgent = hub.allTasks.filter(t => !isTrue(t["완료"]) && (t["우선순위"] ?? "").trim() === "높음").length;
    const normal = hub.allTasks.filter(t => !isTrue(t["완료"]) && ["보통", "낮음"].includes((t["우선순위"] ?? "").trim())).length;

    // 업로드 — A열 완료 체크된 행의 E열(업로드화수) 합계
    const doneUploadRows = hub.uploadRows.filter(r => isTrue(r["완료"]));
    const uploaded_episodes = doneUploadRows.reduce((s, r) => s + safeInt(r["업로드화수"]), 0);
    // 오늘 업로드 — B열 업로드일 기준
    const today_uploads = hub.uploadRows.filter(r => normalizeSheetDateYmd(r["업로드일"] ?? "") === todayYmd).length;
    // 남은 업로드화수 — 완료 안 된 행의 F열 합계
    const remaining_episodes = hub.uploadRows.filter(r => !isTrue(r["완료"])).reduce((s, r) => s + safeInt(r["남은업로드화수"]), 0);

    // 계약
    const contracts_done = hub.platformRows.filter(p => (p["계약"] ?? "").trim() === "계약완료").length;
    const sign_pending = hub.platformRows.filter(p => (p["계약"] ?? "").trim() === "사인만 남음").length;

    // 미팅
    const total_meetings = hub.allTasks.filter(t => (t["분류"] ?? "").trim() === "[업무미팅]").length;
    const planned_meetings = hub.platformRows.filter(p => (p["미팅"] ?? "").includes("미팅예정")).length;

    // 지원사업
    const subsidy = hub.platformRows.filter(p => isTrue(p["지원사업"]));
    const subsidy_planned = subsidy.filter(p => isTrue(p["예정"])).length;
    const subsidy_waiting = subsidy.filter(p => isTrue(p["진행중"])).length;
    const subsidy_done = subsidy.filter(p => isTrue(p["완료"])).length;

    return {
      today_total, today_done, today_undone,
      total_done_tasks, total_undone_tasks,
      urgent, normal,
      uploaded_episodes, today_uploads, remaining_episodes,
      contracts_done, sign_pending,
      total_meetings, planned_meetings,
      subsidy_total: subsidy.length, subsidy_planned, subsidy_waiting, subsidy_done,
      // 클릭용
      _allTasks: hub.allTasks,
      _todayTasks: today_tasks,
      _doneUploadRows: doneUploadRows,
      _platformRows: hub.platformRows,
      _subsidy: subsidy,
      _uploadRows: hub.uploadRows,
      _todayYmd: todayYmd,
    };
  }, [hub]);

  const openPanel = useCallback((next: PanelState) => {
    setPanel(next);
    requestAnimationFrame(() => {
      document.getElementById("control-result-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const openDashPanel = useCallback((id: string) => {
    if (!dashStats) return;

    if (id === "today_total") {
      openPanel({
        kind: "render", title: `오늘 총 일 ${dashStats.today_total}개`,
        node: <TaskList items={dashStats._todayTasks} />
      }); return;
    }
    if (id === "today_done") {
      openPanel({
        kind: "render", title: `오늘 한 일 ${dashStats.today_done}개`,
        node: <TaskList items={dashStats._todayTasks.filter(t => isTrue(t["완료"]))} />
      }); return;
    }
    if (id === "today_undone") {
      openPanel({
        kind: "render", title: `오늘 남은 일 ${dashStats.today_undone}개`,
        node: <TaskList items={dashStats._todayTasks.filter(t => !isTrue(t["완료"]))} color="amber" />
      }); return;
    }
    if (id === "urgent") {
      openPanel({
        kind: "render", title: `긴급한 일 ${dashStats.urgent}개`,
        node: <TaskList items={dashStats._allTasks.filter(t => !isTrue(t["완료"]) && (t["우선순위"] ?? "").trim() === "높음")} color="red" />
      }); return;
    }
    if (id === "normal") {
      openPanel({
        kind: "render", title: `끝내고 할 일 ${dashStats.normal}개`,
        node: <TaskList items={dashStats._allTasks.filter(t => !isTrue(t["완료"]) && ["보통", "낮음"].includes((t["우선순위"] ?? "").trim()))} />
      }); return;
    }
    if (id === "total_done_tasks") {
      openPanel({
        kind: "render", title: `완료한 업무 총 ${dashStats.total_done_tasks}개`,
        node: <TaskList items={dashStats._allTasks.filter(t => isTrue(t["완료"]))} />
      }); return;
    }
    if (id === "total_undone_tasks") {
      openPanel({
        kind: "render", title: `남은 업무 총 ${dashStats.total_undone_tasks}개`,
        node: <TaskList items={dashStats._allTasks.filter(t => !isTrue(t["완료"]))} color="amber" />
      }); return;
    }
    if (id === "uploaded_episodes") {
      openPanel({
        kind: "render", title: `업로드한 화수 총 ${dashStats.uploaded_episodes}화`,
        node: (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {dashStats._doneUploadRows.map((r, i) => (
              <li key={i} className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs dark:border-sky-900/40 dark:bg-sky-950/30">
                <span className="font-medium">{r["작품명"] ?? ""}</span>
                {r["플랫폼명"] ? <span className="ml-1 text-zinc-500">({r["플랫폼명"]})</span> : null}
                <span className="ml-2 text-sky-700 dark:text-sky-300">{safeInt(r["업로드화수"])}화</span>
              </li>
            ))}
          </ul>
        ),
      }); return;
    }
    if (id === "today_uploads") {
      const rows = dashStats._uploadRows.filter(r => normalizeSheetDateYmd(r["업로드일"] ?? "") === dashStats._todayYmd);
      openPanel({
        kind: "render", title: `오늘 업로드 ${dashStats.today_uploads}건`,
        node: (
          <ul className="space-y-1">
            {rows.length === 0 ? <li className="text-zinc-500 text-sm">없음</li> : rows.map((r, i) => (
              <li key={i} className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                <span className="font-medium">{r["작품명"] ?? ""}</span>
                {r["플랫폼명"] ? <span className="ml-1 text-zinc-500">({r["플랫폼명"]})</span> : null}
              </li>
            ))}
          </ul>
        ),
      }); return;
    }
    if (id === "contracts_done") {
      const rows = dashStats._platformRows.filter(p => (p["계약"] ?? "").trim() === "계약완료");
      openPanel({
        kind: "render", title: "계약 완료",
        node: <ul className="space-y-1">{rows.map((p, i) => <li key={i} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/30"><span className="font-medium">{p["회사명"] ?? ""}</span>{p["플랫폼명"] ? <span className="ml-1 text-zinc-500">({p["플랫폼명"]})</span> : null}</li>)}</ul>
      }); return;
    }
    if (id === "sign_pending") {
      const rows = dashStats._platformRows.filter(p => (p["계약"] ?? "").trim() === "사인만 남음");
      openPanel({
        kind: "render", title: "사인만 남음",
        node: <ul className="space-y-1">{rows.map((p, i) => <li key={i} className="rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs dark:border-yellow-900/40 dark:bg-yellow-950/30"><span className="font-medium">{p["회사명"] ?? ""}</span>{p["플랫폼명"] ? <span className="ml-1 text-zinc-500">({p["플랫폼명"]})</span> : null}</li>)}</ul>
      }); return;
    }
    if (id === "total_meetings") {
      openPanel({
        kind: "render", title: `총 미팅 ${dashStats.total_meetings}회`,
        node: <TaskList items={dashStats._allTasks.filter(t => (t["분류"] ?? "").trim() === "[업무미팅]")} />
      }); return;
    }
    if (id === "planned_meetings") {
      const rows = dashStats._platformRows.filter(p => (p["미팅"] ?? "").includes("미팅예정"));
      openPanel({
        kind: "render", title: "예정된 미팅",
        node: <ul className="space-y-1">{rows.map((p, i) => <li key={i} className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-xs dark:border-purple-900/40 dark:bg-purple-950/30"><span className="font-medium">{p["회사명"] ?? ""}</span>{p["플랫폼명"] ? <span className="ml-1 text-zinc-500">({p["플랫폼명"]})</span> : null}<span className="ml-2 text-purple-700 dark:text-purple-300">{p["미팅"] ?? ""}</span></li>)}</ul>
      }); return;
    }
    if (id === "subsidy_planned") {
      openPanel({
        kind: "render", title: "지원사업 — 쓸 예정",
        node: <ul className="space-y-1">{dashStats._subsidy.filter(p => isTrue(p["예정"])).map((p, i) => <li key={i} className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs"><span className="font-medium">{p["회사명"] ?? ""}</span></li>)}</ul>
      }); return;
    }
    if (id === "subsidy_waiting") {
      openPanel({
        kind: "render", title: "지원사업 — 결과 대기",
        node: <ul className="space-y-1">{dashStats._subsidy.filter(p => isTrue(p["진행중"])).map((p, i) => <li key={i} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs"><span className="font-medium">{p["회사명"] ?? ""}</span>{p["대기사유"] ? <p className="mt-0.5 text-zinc-500">{p["대기사유"]}</p> : null}</li>)}</ul>
      }); return;
    }
    if (id === "subsidy_done") {
      openPanel({
        kind: "render", title: "지원사업 — 완료",
        node: <ul className="space-y-1">{dashStats._subsidy.filter(p => isTrue(p["완료"])).map((p, i) => <li key={i} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs"><span className="font-medium">{p["회사명"] ?? ""}</span></li>)}</ul>
      }); return;
    }
  }, [dashStats, openPanel]);

  const runPreset = useCallback(async (id: string, labelForRecent?: string) => {
    const label = labelForRecent ?? SUGGESTED_QUERIES.find((x) => x.id === id)?.label ?? id;
    pushRecentQuery(label);
    refreshHistory();

    /* GET /tasks 만 사용 — hub 로딩과 무관하게 동작 */
    if (id === "due_today") {
      openPanel({ kind: "loading", label: "오늘 할 일 불러오는 중…" });
      try {
        const r = await fetchTasks();
        if (!r.ok) {
          openPanel({ kind: "error", message: r.message });
          return;
        }
        const todayYmd = formatSeoulYmd(new Date());
        const todayRows = r.items.filter(
          (row) => normalizeSheetDateYmd(row["마감일"] ?? "") === todayYmd,
        );
        openPanel({
          kind: "render",
          title: "오늘 할 일",
          node: (
            <RemainingTasksPanel items={todayRows} variant="today" todayYmd={todayYmd} />
          ),
        });
      } catch (e: unknown) {
        openPanel({ kind: "error", message: e instanceof Error ? e.message : "오류" });
      }
      return;
    }
    if (id === "incomplete_check") {
      openPanel({ kind: "loading", label: "남은 일 불러오는 중…" });
      try {
        const r = await fetchTasks();
        if (!r.ok) {
          openPanel({ kind: "error", message: r.message });
          return;
        }
        const undone = r.items.filter((row) => !isTrue(row["완료"]));
        openPanel({
          kind: "render",
          title: "남은 일",
          node: <RemainingTasksPanel items={undone} variant="remaining" />,
        });
      } catch (e: unknown) {
        openPanel({ kind: "error", message: e instanceof Error ? e.message : "오류" });
      }
      return;
    }

    if (hub.kind !== "ready") {
      openPanel({ kind: "error", message: hub.kind === "error" ? hub.message : "아직 데이터를 불러오는 중입니다." });
      return;
    }

    const { briefing, uploads } = hub;

    if (id === "today_upload") {
      const rows = uploads.items.filter((it) => isUploadToday(it.uploaded_at));
      openPanel({ kind: "render", title: "오늘 업로드", node: <UploadPreviewList items={rows} empty="오늘 업로드 없음" actionHref="/uploads" actionLabel="업로드 작업" /> }); return;
    }
    if (id === "week_upload") {
      const rows = uploads.items.filter((it) => isUploadThisSeoulWeek(it.uploaded_at));
      openPanel({ kind: "render", title: "이번 주 업로드", node: <UploadPreviewList items={rows} empty="이번 주 업로드 없음" actionHref="/uploads" actionLabel="업로드 작업" /> }); return;
    }
    if (id === "upload_gaps") {
      const rows = uploads.items.filter((it) => uploadLooksIncomplete(it.status));
      openPanel({ kind: "render", title: "남은 업로드", node: <UploadPreviewList items={rows.slice(0, 20)} empty="없음" actionHref="/uploads" actionLabel="업로드 작업" /> }); return;
    }
    if (id === "data_bad") {
      const skipped = uploads.issues.filter((x) => x.kind === "row_skipped");
      const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
      openPanel({ kind: "render", title: "데이터 이상", node: <IssueSummaryBody warnings={briefing.warnings} skipped={skipped} dup={dup} /> }); return;
    }
    if (id === "dup_id") {
      const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
      const affected = duplicateUploadIdsFromIssues(uploads.issues);
      const rows = uploads.items.filter((it) => affected.has(it.id));
      openPanel({
        kind: "render", title: "중복 id",
        node: (
          <div className="space-y-3 text-sm">
            {dup.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="list-inside list-disc space-y-1">{dup.map((iss, i) => <li key={i}><span className="font-mono text-xs">{iss.id}</span> — 행 {iss.sheet_rows.join(", ")}</li>)}</ul>}
            {rows.length > 0 ? <UploadPreviewList items={rows.slice(0, 12)} empty="" actionHref="/uploads" actionLabel="업로드 작업" /> : null}
          </div>
        ),
      }); return;
    }
    if (id === "upload_summary") {
      openPanel({
        kind: "render", title: "업로드 요약",
        node: (
          <ul className="list-inside list-disc space-y-1 text-sm">
            <li>미완료: {uploads.items.filter(it => uploadLooksIncomplete(it.status)).length}건</li>
            <li>오늘: {uploads.items.filter(it => isUploadToday(it.uploaded_at)).length}건</li>
            <li>브리핑 지연·후속: {briefing.summary.overdue_upload_count}건</li>
          </ul>
        ),
      }); return;
    }
    if (id === "urgent_only") {
      if (!dashStats) {
        openPanel({ kind: "error", message: "대시보드 데이터를 불러오는 중입니다." });
        return;
      }
      const urgentItems = dashStats._allTasks.filter(
        (t) => !isTrue(t["완료"]) && (t["우선순위"] ?? "").trim() === "높음",
      );
      openPanel({
        kind: "render",
        title: `긴급한 일 ${dashStats.urgent}개`,
        node: <TaskList items={urgentItems} color="red" />,
      });
      return;
    }
    if (id === "today_triage") {
      openPanel({
        kind: "render", title: "오늘 브리핑",
        node: (
          <div className="space-y-3 text-sm">
            <p className="text-zinc-600">{briefing.briefing_text}</p>
            {briefing.urgent_items.slice(0, 10).map((it) => (
              <div key={it.uid} className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2">
                <p className="font-medium">{it.title}</p>
                {it.note ? <p className="mt-1 text-xs text-zinc-600">{it.note}</p> : null}
              </div>
            ))}
          </div>
        ),
      }); return;
    }
    if (id === "platform_stage") {
      const adultRows = hub.platformMaster.filter(platformAdultWebtoonRow);
      const subsidyRows = hub.platformMaster.filter(platformSubsidyBizRow);
      openPanel({
        kind: "render",
        title: "현재 진행 프로젝트",
        node: (
          <PlatformOngoingProjectPanel adultRows={adultRows} subsidyRows={subsidyRows} />
        ),
      }); return;
    }
    if (id === "platform_status") {
      openPanel({
        kind: "render", title: "플랫폼 마지막상황", node: (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">{hub.platformMaster.filter(p => p["마지막상황"] || p["마지막 상황"]).map((p, i) => (
            <li key={i} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs">
              <span className="font-semibold">{p["회사명"] ?? ""}</span>
              <p className="mt-0.5 text-zinc-600">{p["마지막상황"] || p["마지막 상황"] || ""}</p>
            </li>
          ))}</ul>
        )
      }); return;
    }
    if (id === "platform_waiting") {
      openPanel({
        kind: "render", title: "플랫폼 대기사유", node: (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">{hub.platformMaster.filter(p => p["대기사유"] && p["대기사유"] !== "아직 없음").map((p, i) => (
            <li key={i} className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs">
              <span className="font-semibold">{p["회사명"] ?? ""}</span>
              <p className="mt-0.5 text-zinc-600">{p["대기사유"]}</p>
            </li>
          ))}</ul>
        )
      }); return;
    }
    if (id === "platform_action") {
      openPanel({
        kind: "render", title: "플랫폼 다음액션", node: (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">{hub.platformMaster.filter(p => p["다음액션"] && p["다음액션"] !== "아직 없음").map((p, i) => (
            <li key={i} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs">
              <span className="font-semibold">{p["회사명"] ?? ""}</span>
              <p className="mt-0.5 font-medium">{p["다음액션"]}</p>
            </li>
          ))}</ul>
        )
      }); return;
    }
    if (id === "memo_all") {
      openPanel({
        kind: "render", title: "메모장", node: (
          <div className="space-y-3 text-sm">
            {hub.memosError ? <p className="text-xs text-amber-900">{hub.memosError}</p> : null}
            <MemoPreviewList items={hub.memos} emptyHint="메모 없음" />
          </div>
        )
      }); return;
    }
    if (id === "platform_stub") {
      openPanel({ kind: "render", title: "플랫폼·작품 조회", node: <p className="text-sm text-zinc-500">좌측 선택 상자를 이용하세요.</p> }); return;
    }
  }, [hub, openPanel, refreshHistory, dashStats]);

  const runQuestion = useCallback(async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q) return;
    pushRecentQuery(q);
    refreshHistory();
    if (hub.kind !== "ready") { openPanel({ kind: "error", message: "데이터 로딩 중" }); return; }
    openPanel({ kind: "loading", label: "AI가 분석 중입니다…" });
    try {
      const trimPlatform = hub.platformMaster.slice(0, 50).map(p => ({
        회사명: p["회사명"], 플랫폼명: p["플랫폼명"], 현재단계: p["현재단계"],
        마지막상황: p["마지막상황"] || p["마지막 상황"],
        담당자명: p["담당자명"], 담당자이메일: p["담당자이메일"],
        연락수단연락처: p["연락수단/연락처"] || p["연락수단연락처"],
        우선순위: p["우선순위"], 다음액션: p["다음액션"],
      }));
      const trimWorks = hub.worksMaster.slice(0, 50).map(w => ({ 작품명: w["작품명"] }));
      const trimMemos = hub.memos.slice(0, 30).map(m => ({ content: m.content, category: m.category }));
      const res = await fetch("/api/ops/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, platformMaster: trimPlatform, worksMaster: trimWorks, memos: trimMemos }),
      });
      const data = await res.json();
      if (data.error) {
        const errType = data.error?.error?.type ?? "";
        const msg = errType === "overloaded_error"
          ? "AI 서버가 일시적으로 과부하 상태예요. 잠시 후 다시 시도해주세요."
          : errType === "invalid_request_error"
          ? "요청 데이터가 너무 커요. 질문을 더 구체적으로 해주세요."
          : "AI 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
        openPanel({ kind: "error", message: msg }); return;
      }
      openPanel({ kind: "render", title: "AI 답변", node: <div className="whitespace-pre-wrap text-sm leading-relaxed">{data.answer}</div> });
    } catch (e) {
      openPanel({ kind: "error", message: e instanceof Error ? e.message : "오류" });
    }
  }, [hub, openPanel, refreshHistory]);

  const submitQuestion = () => { void runQuestion(queryDraft); };

  const copyResultPanel = useCallback(async () => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { window.alert("복사 실패"); }
  }, []);

  const saveResultTxt = useCallback(() => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `관제결과-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const saveFavoriteFromInput = () => {
    const q = queryDraft.trim();
    if (!q) return;
    toggleFavoriteQuery(q);
    refreshHistory();
  };

  const quickBtn = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

  return (
    <div className="min-h-full bg-zinc-100/90 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">오키브스 관제실</h1>
            <label htmlFor="control-query-input" className="sr-only">관제 질문 입력</label>
            <textarea id="control-query-input" rows={2} value={queryDraft} onChange={(e) => setQueryDraft(e.target.value)} placeholder="예: 이번 주 업로드 / 오늘 마감 / 메모 분류 키워드" className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={submitQuestion} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">질문하기</button>
            <button type="button" onClick={() => void copyResultPanel()} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900">결과 복사</button>
            <button type="button" onClick={saveResultTxt} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900">TXT 저장</button>
            <button type="button" onClick={saveFavoriteFromInput} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">즐겨찾기 저장</button>
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-[1600px] border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quickBtn} onClick={() => void runPreset("platform_stage", "현재 진행 프로젝트")}>현재 진행 프로젝트</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("urgent_only", "긴급한 일")}>긴급한 일</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("due_today", "오늘 할 일")}>오늘 할 일</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("incomplete_check", "남은 일")}>남은 일</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_gaps", "남은 업로드")}>남은 업로드</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("platform_status", "마지막상황")}>마지막상황</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("platform_waiting", "대기사유")}>대기사유</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("platform_action", "다음액션")}>다음액션</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-12">
        <aside className="space-y-3 lg:col-span-2">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase text-zinc-500">플랫폼</h2>
            <select className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" aria-label="플랫폼 선택" defaultValue=""
              onChange={(e) => { const v = e.target.value; if (!v) return; const q = `${v} 전체정보`; setQueryDraft(q); void runQuestion(q); }}>
              <option value="">플랫폼 선택…</option>
              {hub.kind === "ready" && Array.from(new Set(hub.platformMaster.map((r) => r["플랫폼명"] ?? r["회사명"] ?? "").filter(Boolean))).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">작품</h2>
            <select className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" aria-label="작품 선택" defaultValue=""
              onChange={(e) => { const v = e.target.value; if (!v) return; const q = `${v} 전체정보`; setQueryDraft(q); void runQuestion(q); }}>
              <option value="">작품 선택…</option>
              {hub.kind === "ready" && Array.from(new Set(hub.worksMaster.map((r) => r["작품명"] ?? "").filter(Boolean))).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button type="button" className="mt-3 w-full rounded-md border border-zinc-400 bg-zinc-100 py-2 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-800"
              onClick={() => { const q = "전체 플랫폼 목록과 담당자 요약"; setQueryDraft(q); void runQuestion(q); }}>전체정보 보기</button>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <p className="font-semibold text-zinc-600 dark:text-zinc-400">최근 질문</p>
            {recent.length === 0 ? <p className="mt-2 text-zinc-500">없음</p> : (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {recent.map((q) => (
                  <li key={q} className="flex gap-1">
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => { setQueryDraft(q); void runQuestion(q); }}>{q}</button>
                    <button type="button" className="text-amber-600" onClick={() => { toggleFavoriteQuery(q); refreshHistory(); }}>{favorites.includes(q) ? "★" : "☆"}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 font-semibold text-zinc-600 dark:text-zinc-400">즐겨찾기</p>
            {favorites.length === 0 ? <p className="mt-2 text-zinc-500">없음</p> : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {favorites.map((q) => (
                  <li key={q}>
                    <button type="button" className="w-full truncate text-left hover:underline"
                      onClick={() => { setQueryDraft(q); const preset = SUGGESTED_QUERIES.find((s) => s.label === q); if (preset) void runPreset(preset.id, q); else void runQuestion(q); }}>★ {q}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
            <p className="font-medium">추가 질문 칩</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTED_QUERIES.map((c) => (
                <button key={c.id} type="button" onClick={() => void runPreset(c.id, c.label)} className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-left hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700">{c.label}</button>
              ))}
            </div>
          </section>
        </aside>

        <main className="space-y-4 lg:col-span-7">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <CalendarSection hub={hub} onDayClick={(ymd) => {
              if (hub.kind !== "ready") return;
              const [y, m, d] = ymd.split("-").map(Number);
              const uploads = hub.uploads.items.filter((it) => isUploadOnSeoulDay(it.uploaded_at, ymd));
              const memos = hub.memos.filter((memo) => normalizeSheetDateYmd(memo.memo_date ?? "") === ymd);
              const allTasksOnDay = hub.allTasks.filter((it) => normalizeSheetDateYmd(it["마감일"] ?? "") === ymd);
              const launchesOnDay = hub.uploadRows.filter((it) => normalizeSheetDateYmd(it["런칭일"] ?? "") === ymd);
              openPanel({
                kind: "render", title: `${y}년 ${m}월 ${d}일 일정`,
                node: (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">업무 ({allTasksOnDay.length}건)</p>
                      {allTasksOnDay.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="mt-1 space-y-1">{allTasksOnDay.map((it, i) => (
                        <li key={i} className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950">
                          {it["분류"] ? <span className="mr-1 font-medium text-zinc-700">[{it["분류"]}]</span> : null}
                          {it["관련플랫폼"] ? <span className="mr-1 text-zinc-500">[{it["관련플랫폼"]}]</span> : null}
                          <span>{it["업무명"] ?? ""}</span>
                        </li>
                      ))}</ul>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">업로드 ({uploads.length}건)</p>
                      {uploads.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="mt-1 space-y-1">{uploads.map((it) => {
                        const statusLabel = it.status ?? "업로드 예정";
                        const isComplete = statusLabel === "업로드 완료";
                        return (
                          <li key={it.uid} className={`rounded border px-2 py-1 text-xs ${isComplete ? "border-sky-200 bg-sky-50" : "border-amber-200 bg-amber-50"}`}>
                            <span className={`font-medium ${isComplete ? "text-sky-700" : "text-amber-700"}`}>[{statusLabel}]</span>
                            {it.file_name && it.file_name !== "(파일명 미입력)" ? <span className="mx-1 text-zinc-500">[{it.file_name}]</span> : " "}
                            <span>{it.title}</span>
                          </li>
                        );
                      })}</ul>}
                    </div>
                    {launchesOnDay.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-500">🚀 런칭일 ({launchesOnDay.length}건)</p>
                        <ul className="mt-1 space-y-1">{launchesOnDay.map((it, i) => (
                          <li key={i} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs">
                            {it["플랫폼명"] ? <span className="mr-1 font-medium text-red-700">[{it["플랫폼명"]}]</span> : null}
                            <span>{it["작품명"] ?? ""}</span>
                          </li>
                        ))}</ul>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">메모 ({memos.length}건)</p>
                      {memos.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="mt-1 space-y-1">{memos.map((memo) => <li key={memo.sheet_row} className="rounded border border-zinc-200 px-2 py-1 text-xs">{memo.content}</li>)}</ul>}
                    </div>
                  </div>
                ),
              });
            }} />
          </section>

          {hub.kind === "loading" && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm dark:border-zinc-700 dark:bg-zinc-900" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
              데이터 불러오는 중…
            </div>
          )}
          {hub.kind === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm" role="alert">
              <p className="font-medium text-red-800">데이터 로드 실패</p>
              <p className="mt-1 text-red-700">{hub.message}</p>
            </div>
          )}

          <section id="control-result-panel" className="scroll-mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold">결과</h2>
            <div className="mt-3 min-h-[160px] text-sm">
              {panel.kind === "welcome" && <p className="text-zinc-600 dark:text-zinc-400">상단 빠른 조회 버튼을 누르면 여기에 답이 채워집니다.</p>}
              {panel.kind === "loading" && <p className="text-zinc-500">{panel.label}</p>}
              {panel.kind === "error" && <p className="text-red-800 dark:text-red-200" role="alert">{panel.message}</p>}
              {panel.kind === "render" && <div><p className="text-xs font-medium uppercase text-zinc-500">{panel.title}</p><div className="mt-3">{panel.node}</div></div>}
            </div>
          </section>
        </main>

        <aside className="space-y-3 lg:col-span-3">
          {dashStats && (
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-xs font-semibold uppercase text-zinc-500">대시보드</h2>
              <div className="mt-2 space-y-3">

                {/* 오늘: 총 / 한 일 / 남은 일 (3단) */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">오늘</p>
                  <ul className="grid grid-cols-3 gap-2">
                    <SidebarStat label="총 일" value={dashStats.today_total} onClick={() => openDashPanel("today_total")} />
                    <SidebarStat label="한 일" value={dashStats.today_done} onClick={() => openDashPanel("today_done")} />
                    <SidebarStat label="남은 일" value={dashStats.today_undone} onClick={() => openDashPanel("today_undone")} />
                  </ul>
                </div>

                {/* 긴급한 일 / 끝내고 할 일 (2단) */}
                <ul className="grid grid-cols-2 gap-2">
                  <SidebarStat label="긴급한 일" value={dashStats.urgent} onClick={() => openDashPanel("urgent")} />
                  <SidebarStat label="끝내고 할 일" value={dashStats.normal} onClick={() => openDashPanel("normal")} />
                </ul>

                {/* 완료한 업무 총 개수 / 남은 업무 총 개수 (2단) */}
                <ul className="grid grid-cols-2 gap-2">
                  <SidebarStat label="완료한 업무 총 개수" value={dashStats.total_done_tasks} onClick={() => openDashPanel("total_done_tasks")} />
                  <SidebarStat label="남은 업무 총 개수" value={dashStats.total_undone_tasks} onClick={() => openDashPanel("total_undone_tasks")} />
                </ul>

                {/* 업로드한 화수 / 오늘 업로드 / 남은 업로드화수 (3단) */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">업로드</p>
                  <ul className="grid grid-cols-3 gap-2">
                    <SidebarStat label="업로드한 화수" value={dashStats.uploaded_episodes} onClick={() => openDashPanel("uploaded_episodes")} />
                    <SidebarStat label="오늘 업로드" value={dashStats.today_uploads} onClick={() => openDashPanel("today_uploads")} />
                    <SidebarStat label="남은 화수" value={dashStats.remaining_episodes} />
                  </ul>
                </div>

                {/* 계약 완료 / 사인만 남음 (2단) */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">계약</p>
                  <ul className="grid grid-cols-2 gap-2">
                    <SidebarStat label="계약 완료" value={dashStats.contracts_done} onClick={() => openDashPanel("contracts_done")} />
                    <SidebarStat label="사인만 남음" value={dashStats.sign_pending} onClick={() => openDashPanel("sign_pending")} />
                  </ul>
                </div>

                {/* 총 미팅 횟수 / 예정 미팅 (2단) */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">미팅</p>
                  <ul className="grid grid-cols-2 gap-2">
                    <SidebarStat label="총 미팅 횟수" value={dashStats.total_meetings} onClick={() => openDashPanel("total_meetings")} />
                    <SidebarStat label="예정 미팅" value={dashStats.planned_meetings} onClick={() => openDashPanel("planned_meetings")} />
                  </ul>
                </div>

                {/* 지원사업 (3단) */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                    지원사업 ({dashStats.subsidy_total}개)
                  </p>
                  <ul className="grid grid-cols-3 gap-2">
                    <SidebarStat label="쓸 예정" value={dashStats.subsidy_planned} onClick={() => openDashPanel("subsidy_planned")} />
                    <SidebarStat label="결과 대기" value={dashStats.subsidy_waiting} onClick={() => openDashPanel("subsidy_waiting")} />
                    <SidebarStat label="완료" value={dashStats.subsidy_done} onClick={() => openDashPanel("subsidy_done")} />
                  </ul>
                </div>

              </div>
            </section>
          )}

          {/* 빠른 요약 */}
          {quickStats && (
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-xs font-semibold uppercase text-zinc-500">빠른 요약</h2>
              <ul className="mt-2 grid grid-cols-3 gap-2">
                <SidebarStat label="지연·후속" value={quickStats.overdueUploadBriefing} onClick={() => void runPreset("upload_summary")} />
                <SidebarStat label="데이터 주의" value={quickStats.dataOdd} onClick={() => void runPreset("data_bad")} />
                <SidebarStat label="중복 id" value={quickStats.dupIdGroups} onClick={() => void runPreset("dup_id")} />
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function TaskList({ items, color = "zinc" }: { items: Record<string, string>[]; color?: string }) {
  const cls = color === "red" ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30"
    : color === "amber" ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
      : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto">
      {items.length === 0 ? <li className="text-zinc-500 text-sm">없음</li> : items.map((t, i) => (
        <li key={i} className={`rounded border px-2 py-1 text-xs ${cls}`}>
          {t["마감일"] ? <span className="mr-1 text-zinc-400">{t["마감일"]}</span> : null}
          {t["분류"] ? <span className="mr-1 text-zinc-500">[{t["분류"]}]</span> : null}
          <span className="font-medium">{t["업무명"] ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}

function CalendarSection({ hub, onDayClick }: { hub: HubLoadState; onDayClick: (ymd: string) => void }) {
  const { year: initYear, month: initMonth } = seoulCalendarYearMonthNow();
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const ready = hub.kind === "ready";
  const todayYmd = formatSeoulYmd(new Date());

  const activityMap = useMemo(() => {
    if (hub.kind !== "ready") return new Map<string, { uploads: number; tasks: number; launches: number }>();
    const map = new Map<string, { uploads: number; tasks: number; launches: number }>();
    const def = () => ({ uploads: 0, tasks: 0, launches: 0 });
    for (const it of hub.uploads.items) {
      const ymd = formatSeoulYmd(new Date(Date.parse(it.uploaded_at)));
      if (!ymd) continue;
      const cur = map.get(ymd) ?? def();
      map.set(ymd, { ...cur, uploads: cur.uploads + 1 });
    }
    for (const it of hub.allTasks) {
      const ymd = normalizeSheetDateYmd(it["마감일"] ?? "");
      if (!ymd) continue;
      const cur = map.get(ymd) ?? def();
      map.set(ymd, { ...cur, tasks: cur.tasks + 1 });
    }
    for (const it of hub.uploadRows) {
      const ymd = normalizeSheetDateYmd(it["런칭일"] ?? "");
      if (!ymd) continue;
      const cur = map.get(ymd) ?? def();
      map.set(ymd, { ...cur, launches: cur.launches + 1 });
    }
    return map;
  }, [hub]);

  const first = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { const d = new Date(viewYear, viewMonth - 2, 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth() + 1); }} className="rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">{"<"}</button>
        <p className="text-sm font-semibold">{viewYear}년 {viewMonth}월</p>
        <button type="button" onClick={() => { const d = new Date(viewYear, viewMonth, 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth() + 1); }} className="rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">{">"}</button>
        <button type="button" onClick={() => { const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })); setViewYear(seoul.getFullYear()); setViewMonth(seoul.getMonth() + 1); }} className="ml-1 rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800">오늘</button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ymd = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const act = activityMap.get(ymd);
          const hasUpload = (act?.uploads ?? 0) > 0;
          const hasTask = (act?.tasks ?? 0) > 0;
          const hasLaunch = (act?.launches ?? 0) > 0;
          const isToday = ymd === todayYmd;
          return (
            <button key={`${ymd}-${i}`} type="button" disabled={!ready} onClick={() => onDayClick(ymd)}
              className={`relative min-h-[2rem] rounded py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isToday ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>
              <span>{d}</span>
              {(hasUpload || hasTask || hasLaunch) && (
                <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5" aria-hidden>
                  {hasTask && <span className="h-1 w-1 rounded-full bg-zinc-800 dark:bg-zinc-200" />}
                  {hasUpload && <span className="h-1 w-1 rounded-full bg-sky-500" />}
                  {hasLaunch && <span className="h-1 w-1 rounded-full bg-red-500" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SidebarStat(props: { label: string; value: number; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{props.value}</span>
      <span className="mt-0.5 block text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">{props.label}</span>
    </>
  );
  if (props.onClick) return <li><button type="button" onClick={props.onClick} className="flex w-full flex-col rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800">{body}</button></li>;
  return <li className="rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">{body}</li>;
}

function MemoPreviewList(props: { items: MemoItem[]; emptyHint: string }) {
  if (props.items.length === 0) return <p className="text-sm text-zinc-600 dark:text-zinc-400">{props.emptyHint}</p>;
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto">
      {props.items.map((m) => (
        <li key={m.sheet_row} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            행 {m.sheet_row} · {m.memo_date}
            {m.category ? <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">{m.category}</span> : <span className="ml-2 text-zinc-400">분류 없음</span>}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-900 dark:text-zinc-50">{m.content}</p>
        </li>
      ))}
    </ul>
  );
}

function UploadPreviewList(props: { items: UploadListItem[]; empty: string; actionHref: string; actionLabel: string }) {
  if (props.items.length === 0 && props.empty) return <div className="space-y-2"><p className="text-zinc-600 dark:text-zinc-400">{props.empty}</p><Link href={props.actionHref} className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">{props.actionLabel} →</Link></div>;
  return (
    <div className="space-y-2">
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => {
          const statusLabel = it.status ?? "업로드 예정";
          const isComplete = statusLabel === "업로드 완료";
          const platform = it.file_name && it.file_name !== "(파일명 미입력)" ? it.file_name : null;
          return (
            <li key={it.uid} className={`rounded-lg border px-3 py-2 text-xs ${isComplete ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"}`}>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                <span className={`mr-1 ${isComplete ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>[{statusLabel}]</span>
                {platform ? <span className="mr-1 text-zinc-500 dark:text-zinc-400">[{platform}]</span> : null}
                {it.title}
              </p>
            </li>
          );
        })}
      </ul>
      <Link href={props.actionHref} className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">{props.actionLabel} →</Link>
    </div>
  );
}

function IssueSummaryBody(props: {
  warnings: string[];
  skipped: Extract<UploadListIssue, { kind: "row_skipped" }>[];
  dup: Extract<UploadListIssue, { kind: "duplicate_id" }>[];
}) {
  return (
    <div className="space-y-4 text-sm">
      {props.warnings.length > 0 && <div><p className="text-xs font-semibold text-amber-900 dark:text-amber-100">경고</p><ul className="mt-1 list-inside list-disc space-y-1">{props.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      {props.skipped.length > 0 && <div><p className="text-xs font-semibold text-amber-900 dark:text-amber-100">제외된 행</p><ul className="mt-1 space-y-1">{props.skipped.map((s, i) => <li key={i}>행 {s.sheet_row}: {s.message}</li>)}</ul></div>}
      {props.dup.length > 0 && <div><p className="text-xs font-semibold text-rose-900 dark:text-rose-100">중복 id</p><ul className="mt-1 space-y-1">{props.dup.map((d, i) => <li key={i}><span className="font-mono text-xs">{d.id}</span> — 행 {d.sheet_rows.join(", ")}</li>)}</ul></div>}
      {props.warnings.length === 0 && props.skipped.length === 0 && props.dup.length === 0 && <p className="text-zinc-600">이상 없음</p>}
      <p className="text-xs text-zinc-500">시트를 고친 뒤 새로고침하세요.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/uploads" className="text-sm font-medium underline">업로드 작업 →</Link>
        <Link href="/checklist" className="text-sm font-medium underline">체크 작업 →</Link>
      </div>
    </div>
  );
}
