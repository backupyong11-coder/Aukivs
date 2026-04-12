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
import {
  loadFavoriteQueries,
  loadRecentQueries,
  pushRecentQuery,
  removeRecentQuery,
  toggleFavoriteQuery,
} from "@/lib/controlRoomQueryHistory";
import { fetchChecklist, type ChecklistItem } from "@/lib/checklist";
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

// 서울 시간대 기준 날짜 유틸
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
  const done = ["완료", "완료됨", "완", "done", "complete", "ok"];
  return !done.some((x) => s === x || s.includes(x));
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
        const [b, u, m, c, pm, wm] = await Promise.all([
          fetchBriefingToday({ signal: ac.signal }),
          fetchUploads({ signal: ac.signal }),
          fetchMemos({ signal: ac.signal }),
          fetchChecklist().catch(() => ({ ok: false as const, message: "체크리스트 로드 실패", items: [] })),
          fetchPlatformMaster().catch(() => ({ ok: false as const, items: [] as PlatformMasterItem[] })),
          fetchWorksMaster().catch(() => ({ ok: false as const, items: [] as WorksMasterItem[] })),
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
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (ac.signal.aborted) return;
        setHub({ kind: "error", message: e instanceof Error ? e.message : "데이터를 불러오지 못했습니다." });
      }
    })();
    return () => ac.abort();
  }, [hubRefreshKey]);

  const metrics = useMemo(() => {
    if (hub.kind !== "ready") return null;
    const { briefing, uploads } = hub;
    const dupIssues = uploads.issues.filter((x) => x.kind === "duplicate_id");
    const skipped = uploads.issues.filter((x) => x.kind === "row_skipped");
    const incompleteUploads = uploads.items.filter((it) => uploadLooksIncomplete(it.status)).length;
    const dataOdd = skipped.length + briefing.warnings.length + dupIssues.length;
    return {
      dueTodayCheck: briefing.summary.today_checklist_count,
      incompleteUploads,
      todayUploadBriefing: briefing.summary.today_upload_count,
      dataOdd,
      dupIdGroups: dupIssues.length,
      urgent: briefing.urgent_items.length,
      overdueUploadBriefing: briefing.summary.overdue_upload_count,
    };
  }, [hub]);

  const openPanel = useCallback((next: PanelState) => {
    setPanel(next);
    requestAnimationFrame(() => {
      document.getElementById("control-result-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const runPreset = useCallback(async (id: string, labelForRecent?: string) => {
    const label = labelForRecent ?? SUGGESTED_QUERIES.find((x) => x.id === id)?.label ?? id;
    pushRecentQuery(label);
    refreshHistory();

    if (hub.kind !== "ready") {
      openPanel({ kind: "error", message: hub.kind === "error" ? hub.message : "아직 관제 데이터를 불러오는 중입니다. 잠시 후 다시 시도하세요." });
      return;
    }

    const { briefing, uploads } = hub;

    if (id === "due_today") {
      const checklistUrgent = briefing.urgent_items.filter((x) => x.source === "checklist");
      openPanel({
        kind: "render", title: "오늘 마감·오늘 처리(브리핑)",
        node: (
          <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
            <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
              오늘 집계된 체크 건수:{" "}
              <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{briefing.summary.today_checklist_count}</span>건.
              수정은 <Link href="/checklist" className="font-medium underline">체크 작업</Link>에서 하세요.
            </p>
            {checklistUrgent.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400">체크 출처 긴급 후보가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {checklistUrgent.map((it) => (
                  <li key={it.uid} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <p className="font-medium">{it.title}</p>
                    {it.note ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{it.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      });
      return;
    }

    if (id === "today_upload") {
      const rows = uploads.items.filter((it) => isUploadToday(it.uploaded_at));
      openPanel({ kind: "render", title: "오늘 업로드 시각이 잡힌 행", node: <UploadPreviewList items={rows} empty="오늘 날짜(D열)로 잡힌 업로드 행이 없습니다." actionHref="/uploads" actionLabel="업로드 작업에서 전체 보기" /> });
      return;
    }

    if (id === "week_upload") {
      const rows = uploads.items.filter((it) => isUploadThisSeoulWeek(it.uploaded_at));
      openPanel({ kind: "render", title: "이번 주 업로드 일정(목록 기준)", node: <UploadPreviewList items={rows} empty="이번 주 업로드 시각(D열)으로 잡힌 행이 없습니다." actionHref="/uploads" actionLabel="업로드 작업에서 전체·필터" /> });
      return;
    }

    if (id === "incomplete_check") {
      openPanel({ kind: "loading", label: "체크리스트 불러오는 중…" });
      try {
        const r = await fetchChecklist();
        if (!r.ok) { openPanel({ kind: "error", message: userFacingListError("checklist", r.message) }); return; }
        openPanel({ kind: "render", title: "미완료 체크리스트(활성 행)", node: <ChecklistPreviewList items={r.items.slice(0, 15)} total={r.items.length} /> });
      } catch (e: unknown) {
        openPanel({ kind: "error", message: e instanceof Error ? e.message : "체크리스트를 불러오지 못했습니다." });
      }
      return;
    }

    if (id === "upload_gaps") {
      const rows = uploads.items.filter((it) => uploadLooksIncomplete(it.status));
      openPanel({ kind: "render", title: "미완료 업로드(상태 기준)", node: <UploadPreviewList items={rows.slice(0, 20)} empty="상태가 비었거나 완료로 보이지 않는 행이 없습니다." actionHref="/uploads" actionLabel="업로드 작업에서 처리" /> });
      return;
    }

    if (id === "data_bad") {
      const skipped = uploads.issues.filter((x) => x.kind === "row_skipped");
      const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
      openPanel({ kind: "render", title: "데이터 이상·집계 제외", node: <IssueSummaryBody warnings={briefing.warnings} skipped={skipped} dup={dup} /> });
      return;
    }

    if (id === "dup_id") {
      const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
      const affected = duplicateUploadIdsFromIssues(uploads.issues);
      const rows = uploads.items.filter((it) => affected.has(it.id));
      openPanel({
        kind: "render", title: "중복 id 업로드",
        node: (
          <div className="space-y-3 text-sm">
            {dup.length === 0 ? <p className="text-zinc-600 dark:text-zinc-400">중복 id 이슈가 없습니다.</p> : (
              <ul className="list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-200">
                {dup.map((iss, i) => <li key={`${iss.id}-${i}`}><span className="font-mono text-xs">{iss.id}</span> — 행 {iss.sheet_rows.join(", ")}: {iss.message}</li>)}
              </ul>
            )}
            {rows.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">해당 id가 붙은 목록 행</p>
                <UploadPreviewList items={rows.slice(0, 12)} empty="" actionHref="/uploads" actionLabel="업로드 작업에서 시트 정리" />
              </div>
            ) : null}
          </div>
        ),
      });
      return;
    }

    if (id === "platform_stub") {
      openPanel({ kind: "render", title: "플랫폼·작품 한정 조회", node: <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">특정 플랫폼·작품만 걸러 보는 조회는 다음 턴에서 시트 열·API와 연결합니다. 좌측 선택 상자가 활성화되면 여기서 전체정보를 띄웁니다.</p> });
      return;
    }

    if (id === "upload_summary") {
      const inc = uploads.items.filter((it) => uploadLooksIncomplete(it.status)).length;
      const todayN = uploads.items.filter((it) => isUploadToday(it.uploaded_at)).length;
      const weekN = uploads.items.filter((it) => isUploadThisSeoulWeek(it.uploaded_at)).length;
      openPanel({
        kind: "render", title: "업로드 요약(목록·브리핑 기준)",
        node: (
          <ul className="list-inside list-disc space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
            <li>시트 파싱 성공 행: {uploads.items.length}건</li>
            <li>미완료(상태 휴리스틱): {inc}건</li>
            <li>오늘 D열: {todayN}건 / 이번 주(월~일): {weekN}건</li>
            <li>브리핑 오늘 업로드 집계: {briefing.summary.today_upload_count}건</li>
            <li>브리핑 지연·후속: {briefing.summary.overdue_upload_count}건</li>
          </ul>
        ),
      });
      return;
    }

    if (id === "urgent_only") {
      openPanel({
        kind: "render", title: "급한 일(긴급 후보)",
        node: briefing.urgent_items.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">긴급 후보가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {briefing.urgent_items.map((it) => (
              <li key={it.uid} className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                <span className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">{it.source === "checklist" ? "체크" : "업로드"}</span>
                <p className="mt-1 font-medium">{it.title}</p>
                {it.note ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{it.note}</p> : null}
              </li>
            ))}
          </ul>
        ),
      });
      return;
    }

    if (id === "sheet_backup") {
      openPanel({ kind: "render", title: "시트 백업", node: <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Google 스프레드시트 메뉴에서 사본 만들기·버전 기록을 사용하거나, 다음 단계에서 서버 백업 API를 연결합니다.</p> });
      return;
    }

    if (id === "today_triage") {
      openPanel({
        kind: "render", title: "오늘 브리핑(요약 + 긴급)",
        node: (
          <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
            <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">{briefing.briefing_text}</p>
            {briefing.urgent_items.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400">긴급 후보 목록이 비어 있습니다.</p>
            ) : (
              <ul className="space-y-2">
                {briefing.urgent_items.slice(0, 10).map((it) => (
                  <li key={it.uid} className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <span className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">{it.source === "checklist" ? "체크" : "업로드"}</span>
                    <p className="mt-1 font-medium">{it.title}</p>
                    {it.note ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{it.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      });
      return;
    }

    if (id === "memo_all") {
      openPanel({
        kind: "render", title: "메모장 (시트 전체)",
        node: (
          <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
            {hub.memosError ? <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100" role="alert">메모를 불러오지 못했습니다: {hub.memosError}</p> : null}
            <MemoPreviewList items={hub.memos} emptyHint="표시할 메모가 없습니다. 왼쪽 사이드바에서 메모를 추가하거나 시트를 확인하세요." />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">분류는 시트 「메모분류」 열에서 입력하면, 질문하기 검색에 포함됩니다.</p>
          </div>
        ),
      });
      return;
    }
  }, [hub, openPanel, refreshHistory]);

  const runQuestion = useCallback(async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q) return;
    pushRecentQuery(q);
    refreshHistory();

    if (hub.kind !== "ready") {
      openPanel({ kind: "error", message: "데이터 로딩 중입니다. 잠시 후 다시 시도하세요." });
      return;
    }

    openPanel({ kind: "loading", label: "AI가 분석 중입니다…" });

    try {
      const res = await fetch("/api/ops/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          platformMaster: hub.platformMaster,
          worksMaster: hub.worksMaster,
          memos: hub.memos,
        }),
      });
      const data = await res.json();
      if (data.error) {
        openPanel({ kind: "error", message: data.error });
        return;
      }
      openPanel({
        kind: "render", title: "AI 답변",
        node: (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {data.answer}
          </div>
        ),
      });
    } catch (e) {
      openPanel({ kind: "error", message: e instanceof Error ? e.message : "오류가 발생했습니다." });
    }
  }, [hub, openPanel, refreshHistory]);
  const submitQuestion = () => { void runQuestion(queryDraft); };

  const copyResultPanel = useCallback(async () => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { window.alert("복사에 실패했습니다."); }
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
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              PC에 켜두고 버튼으로 조회 · 수정은{" "}
              <Link href="/checklist" className="font-medium underline">체크</Link>/<Link href="/uploads" className="font-medium underline">업로드</Link>
            </p>
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
            <button type="button" className={quickBtn} onClick={() => void runPreset("today_upload", "오늘 업로드")}>오늘 업로드</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("week_upload", "이번 주 업로드")}>이번 주 업로드</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_gaps", "미완료 업로드")}>미완료 업로드</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_summary", "업로드 요약")}>업로드 요약</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("today_triage", "오늘 브리핑")}>오늘 브리핑</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("due_today", "오늘 마감")}>오늘 마감</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("incomplete_check", "미완료 업무")}>미완료 업무</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("urgent_only", "급한 일")}>급한 일</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("data_bad", "데이터 점검")}>데이터 점검</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("sheet_backup", "시트 백업")}>시트 백업</button>
            <button type="button" className={quickBtn} onClick={() => setHubRefreshKey((k) => k + 1)}>전체 새로고침</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-12">
        <aside className="space-y-3 lg:col-span-2">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase text-zinc-500">플랫폼</h2>
            <select
              className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              aria-label="플랫폼 선택"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const q = `${v} 전체정보`;
                setQueryDraft(q);
                void runQuestion(q);
              }}
            >
              <option value="">플랫폼 선택…</option>
              {hub.kind === "ready" && Array.from(new Set(hub.platformMaster.map((r) => r["플랫폼명"] ?? r["회사명"] ?? "").filter(Boolean))).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">작품</h2>
            <select
              className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              aria-label="작품 선택"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const q = `${v} 전체정보`;
                setQueryDraft(q);
                void runQuestion(q);
              }}
            >
              <option value="">작품 선택…</option>
              {hub.kind === "ready" && Array.from(new Set(hub.worksMaster.map((r) => r["작품명"] ?? "").filter(Boolean))).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button type="button" className="mt-3 w-full rounded-md border border-zinc-400 bg-zinc-100 py-2 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-800" onClick={() => { const q = "전체 플랫폼 목록과 담당자 요약"; setQueryDraft(q); void runQuestion(q); }}>전체정보 보기</button>
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
                    <button type="button" className="w-full truncate text-left hover:underline" onClick={() => { setQueryDraft(q); const preset = SUGGESTED_QUERIES.find((s) => s.label === q); if (preset) void runPreset(preset.id, q); else void runQuestion(q); }}>★ {q}</button>
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
              const checklist = hub.checklist.filter((it) => {
                const due = it.due_date ?? it.id ?? "";
                return normalizeSheetDateYmd(due) === ymd;
              });
              openPanel({
                kind: "render", title: `${y}년 ${m}월 ${d}일 일정`,
                node: (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">업무 내용 ({checklist.length}건)</p>
                      {checklist.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="mt-1 space-y-1">{checklist.map((it) => <li key={it.id} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs">{(it.category || it.platform) ? <span className="text-zinc-500">{[it.category, it.platform].filter(Boolean).join(" / ")} · </span> : null}<span className="font-medium">{it.title}</span></li>)}</ul>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">업로드 ({uploads.length}건)</p>
                      {uploads.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="mt-1 space-y-1">{uploads.map((it) => <li key={it.uid} className="rounded border border-zinc-200 px-2 py-1 text-xs">{it.title}{it.status ? ` [${it.status}]` : ""}</li>)}</ul>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">메모 ({memos.length}건)</p>
                      {memos.length === 0 ? <p className="text-zinc-500">없음</p> : <ul className="mt-1 space-y-1">{memos.map((memo) => <li key={memo.sheet_row} className="rounded border border-zinc-200 px-2 py-1 text-xs">{memo.content}</li>)}</ul>}
                    </div>
                  </div>
                ),
              });
            }} />
          </section>

          {hub.kind === "loading" ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm dark:border-zinc-700 dark:bg-zinc-900" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
              브리핑·업로드·메모·체크리스트 불러오는 중…
            </div>
          ) : null}

          {hub.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm" role="alert">
              <p className="font-medium text-red-800">데이터 로드 실패</p>
              <p className="mt-1 text-red-700">{hub.message}</p>
            </div>
          ) : null}

          <section id="control-result-panel" className="scroll-mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold">결과</h2>
            <div className="mt-3 min-h-[160px] text-sm">
              {panel.kind === "welcome" ? <p className="text-zinc-600 dark:text-zinc-400">상단 빠른 조회 버튼을 누르면 여기에 답이 채워집니다.</p> : null}
              {panel.kind === "nl_stub" ? <div className="space-y-2"><p className="font-medium">질문 기록</p><p className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-900">「{panel.query}」</p></div> : null}
              {panel.kind === "loading" ? <p className="text-zinc-500">{panel.label}</p> : null}
              {panel.kind === "error" ? <p className="text-red-800 dark:text-red-200" role="alert">{panel.message}</p> : null}
              {panel.kind === "render" ? <div><p className="text-xs font-medium uppercase text-zinc-500">{panel.title}</p><div className="mt-3">{panel.node}</div></div> : null}
            </div>
          </section>
        </main>

        <aside className="lg:col-span-3">
          {metrics ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-xs font-semibold uppercase text-zinc-500">대시보드 요약</h2>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                <SidebarStat label="오늘 마감(체크)" value={metrics.dueTodayCheck} onClick={() => void runPreset("due_today")} />
                <SidebarStat label="미완료 업로드" value={metrics.incompleteUploads} onClick={() => void runPreset("upload_gaps")} />
                <SidebarStat label="데이터 주의" value={metrics.dataOdd} onClick={() => void runPreset("data_bad")} />
                <SidebarStat label="중복 id" value={metrics.dupIdGroups} onClick={() => void runPreset("dup_id")} />
                <SidebarStat label="긴급 후보" value={metrics.urgent} onClick={() => void runPreset("urgent_only")} />
                <SidebarStat label="오늘 업로드(집계)" value={metrics.todayUploadBriefing} onClick={() => void runPreset("today_upload")} />
                <SidebarStat label="지연·후속(집계)" value={metrics.overdueUploadBriefing} onClick={() => void runPreset("upload_summary")} />
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function CalendarSection({ hub, onDayClick }: { hub: HubLoadState; onDayClick: (ymd: string) => void }) {
  const { year: initYear, month: initMonth } = seoulCalendarYearMonthNow();
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const ready = hub.kind === "ready";
  const todayYmd = formatSeoulYmd(new Date());

  const activityMap = useMemo(() => {
    if (hub.kind !== "ready") return new Map<string, { uploads: number; memos: number; checklist: number }>();
    const map = new Map<string, { uploads: number; memos: number; checklist: number }>();
    for (const it of hub.uploads.items) {
      const ymd = formatSeoulYmd(new Date(Date.parse(it.uploaded_at)));
      if (!ymd) continue;
      const cur = map.get(ymd) ?? { uploads: 0, memos: 0, checklist: 0 };
      map.set(ymd, { ...cur, uploads: cur.uploads + 1 });
    }
    for (const memo of hub.memos) {
      const ymd = normalizeSheetDateYmd(memo.memo_date ?? "");
      if (!ymd) continue;
      const cur = map.get(ymd) ?? { uploads: 0, memos: 0, checklist: 0 };
      map.set(ymd, { ...cur, memos: cur.memos + 1 });
    }
    for (const it of hub.checklist) {
      const due = it.due_date ?? it.id ?? "";
      const ymd = normalizeSheetDateYmd(due);
      if (!ymd) continue;
      const cur = map.get(ymd) ?? { uploads: 0, memos: 0, checklist: 0 };
      map.set(ymd, { ...cur, checklist: cur.checklist + 1 });
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
          const hasDot = (act?.uploads ?? 0) + (act?.memos ?? 0) + (act?.checklist ?? 0) > 0;
          const isToday = ymd === todayYmd;
          return (
            <button key={`${ymd}-${i}`} type="button" disabled={!ready} onClick={() => onDayClick(ymd)}
              className={`relative min-h-[2rem] rounded py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isToday ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
            >
              <span>{d}</span>
              {hasDot ? <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-500" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
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

function SidebarStat(props: { label: string; value: number; onClick?: () => void }) {
  const body = (<><span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{props.value}</span><span className="mt-0.5 block text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">{props.label}</span></>);
  if (props.onClick) return <li><button type="button" onClick={props.onClick} className="flex w-full flex-col rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800">{body}</button></li>;
  return <li className="rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">{body}</li>;
}

function UploadPreviewList(props: { items: UploadListItem[]; empty: string; actionHref: string; actionLabel: string }) {
  if (props.items.length === 0 && props.empty) return <div className="space-y-2"><p className="text-zinc-600 dark:text-zinc-400">{props.empty}</p><Link href={props.actionHref} className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">{props.actionLabel} →</Link></div>;
  return (
    <div className="space-y-2">
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => (
          <li key={it.uid} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{it.title}</p>
            <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">{it.status ? `상태 ${it.status} · ` : ""}{it.uploaded_at}</p>
          </li>
        ))}
      </ul>
      <Link href={props.actionHref} className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">{props.actionLabel} →</Link>
    </div>
  );
}

function ChecklistPreviewList(props: { items: ChecklistItem[]; total: number }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">활성 행 {props.total}건 중 {props.items.length}건 미리보기</p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => (
          <li key={it.id} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{it.title}</p>
            {it.note ? <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{it.note}</p> : null}
          </li>
        ))}
      </ul>
      <Link href="/checklist" className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">체크 작업에서 수정·완료 →</Link>
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
      {props.warnings.length > 0 ? <div><p className="text-xs font-semibold text-amber-900 dark:text-amber-100">브리핑 경고</p><ul className="mt-1 list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-200">{props.warnings.map((w, i) => <li key={`w-${i}`}>{w}</li>)}</ul></div> : null}
      {props.skipped.length > 0 ? <div><p className="text-xs font-semibold text-amber-900 dark:text-amber-100">목록에서 제외된 행</p><ul className="mt-1 space-y-1 text-zinc-800 dark:text-zinc-200">{props.skipped.map((s, i) => <li key={`s-${s.sheet_row}-${i}`}>행 {s.sheet_row}: {s.message}</li>)}</ul></div> : null}
      {props.dup.length > 0 ? <div><p className="text-xs font-semibold text-rose-900 dark:text-rose-100">중복 id</p><ul className="mt-1 space-y-1 text-zinc-800 dark:text-zinc-200">{props.dup.map((d, i) => <li key={`d-${d.id}-${i}`}><span className="font-mono text-xs">{d.id}</span> — 행 {d.sheet_rows.join(", ")}</li>)}</ul></div> : null}
      {props.warnings.length === 0 && props.skipped.length === 0 && props.dup.length === 0 ? <p className="text-zinc-600 dark:text-zinc-400">표시할 이상 징후가 없습니다.</p> : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">시트를 고친 뒤 작업 화면에서 새로고침하세요.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/uploads" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100">업로드 작업 →</Link>
        <Link href="/checklist" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100">체크 작업 →</Link>
      </div>
    </div>
  );
}
