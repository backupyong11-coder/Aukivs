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
import { userFacingListError } from "@/lib/userFacingErrors";

const SUGGESTED_QUERIES: { id: string; label: string }[] = [
  { id: "due_today", label: "?ㅻ뒛 留덇컧 萸먯빞" },
  { id: "week_upload", label: "?대쾲 二??낅줈???쇱젙 蹂댁뿬以? },
  { id: "incomplete_check", label: "誘몄셿猷?泥댄겕由ъ뒪?몃쭔 蹂댁뿬以? },
  { id: "upload_gaps", label: "?낅줈???꾨씫 ?먮즺 李얠븘以? },
  { id: "data_bad", label: "?곗씠???댁긽????ぉ 蹂댁뿬以? },
  { id: "dup_id", label: "以묐났 id ?덈뒗 ?낅줈??蹂댁뿬以? },
  { id: "platform_stub", label: "誘명댆 愿???먮즺留?蹂댁뿬以? },
  { id: "today_triage", label: "?ㅻ뒛 ?먮킄????寃껊쭔 ?뺣━?댁쨾" },
  { id: "memo_all", label: "硫붾え???꾩껜 蹂닿린" },
];

function uploadLooksIncomplete(status: string | null): boolean {
  if (!status || !status.trim()) return true;
  const s = status.trim().toLowerCase();
  const done = ["?꾨즺", "?꾨즺??, "??, "done", "complete", "ok"];
  return !done.some((x) => s === x || s.includes(x));
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMondayMs(): number {
  const d = new Date();
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseUploadDayMs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function isUploadToday(iso: string): boolean {
  const t = parseUploadDayMs(iso);
  if (t == null) return false;
  const start = startOfTodayMs();
  const end = start + 86400000;
  return t >= start && t < end;
}

function isUploadThisWeek(iso: string): boolean {
  const t = parseUploadDayMs(iso);
  if (t == null) return false;
  const start = startOfWeekMondayMs();
  const end = start + 7 * 86400000;
  return t >= start && t < end;
}

type HubLoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      briefing: BriefingTodayPayload;
      uploads: { items: UploadListItem[]; issues: UploadListIssue[] };
      memos: MemoItem[];
      memosError: string | null;
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

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const [hubRefreshKey, setHubRefreshKey] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setHub({ kind: "loading" });
      try {
        const [b, u, m] = await Promise.all([
          fetchBriefingToday({ signal: ac.signal }),
          fetchUploads({ signal: ac.signal }),
          fetchMemos({ signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        if (!b.ok) {
          setHub({ kind: "error", message: userFacingListError("briefing", b.message) });
          return;
        }
        if (!u.ok) {
          setHub({ kind: "error", message: userFacingListError("uploads", u.message) });
          return;
        }
        setHub({
          kind: "ready",
          briefing: b.payload,
          uploads: { items: u.items, issues: u.issues },
          memos: m.ok ? m.items : [],
          memosError: m.ok ? null : userFacingListError("memos", m.message),
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (ac.signal.aborted) return;
        setHub({
          kind: "error",
          message: e instanceof Error ? e.message : "?곗씠?곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??",
        });
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

  const runPreset = useCallback(
    async (id: string, labelForRecent?: string) => {
      const label = labelForRecent ?? SUGGESTED_QUERIES.find((x) => x.id === id)?.label ?? id;
      pushRecentQuery(label);
      refreshHistory();

      if (hub.kind !== "ready") {
        openPanel({
          kind: "error",
          message: hub.kind === "error" ? hub.message : "?꾩쭅 愿???곗씠?곕? 遺덈윭?ㅻ뒗 以묒엯?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?섏꽭??",
        });
        return;
      }

      const { briefing, uploads } = hub;

      if (id === "due_today") {
        const checklistUrgent = briefing.urgent_items.filter((x) => x.source === "checklist");
        openPanel({
          kind: "render",
          title: "?ㅻ뒛 留덇컧쨌?ㅻ뒛 泥섎━(釉뚮━??",
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
                ?ㅻ뒛 吏묎퀎??泥댄겕 嫄댁닔:{" "}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{briefing.summary.today_checklist_count}</span>嫄?
                ?섏젙? <Link href="/checklist" className="font-medium underline">泥댄겕 ?묒뾽</Link>?먯꽌 ?섏꽭??
              </p>
              {checklistUrgent.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">泥댄겕 異쒖쿂 湲닿툒 ?꾨낫媛 ?놁뒿?덈떎.</p>
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
        openPanel({
          kind: "render",
          title: "?ㅻ뒛 ?낅줈???쒓컖???≫엺 ??,
          node: <UploadPreviewList items={rows} empty="?ㅻ뒛 ?좎쭨(D??濡??≫엺 ?낅줈???됱씠 ?놁뒿?덈떎." actionHref="/uploads" actionLabel="?낅줈???묒뾽?먯꽌 ?꾩껜 蹂닿린" />,
        });
        return;
      }

      if (id === "week_upload") {
        const rows = uploads.items.filter((it) => isUploadThisWeek(it.uploaded_at));
        openPanel({
          kind: "render",
          title: "?대쾲 二??낅줈???쇱젙(紐⑸줉 湲곗?)",
          node: <UploadPreviewList items={rows} empty="?대쾲 二??낅줈???쒓컖(D???쇰줈 ?≫엺 ?됱씠 ?놁뒿?덈떎." actionHref="/uploads" actionLabel="?낅줈???묒뾽?먯꽌 ?꾩껜쨌?꾪꽣" />,
        });
        return;
      }

      if (id === "incomplete_check") {
        openPanel({ kind: "loading", label: "泥댄겕由ъ뒪??遺덈윭?ㅻ뒗 以묅? });
        try {
          const r = await fetchChecklist();
          if (!r.ok) { openPanel({ kind: "error", message: userFacingListError("checklist", r.message) }); return; }
          openPanel({
            kind: "render",
            title: "誘몄셿猷?泥댄겕由ъ뒪???쒖꽦 ??",
            node: <ChecklistPreviewList items={r.items.slice(0, 15)} total={r.items.length} />,
          });
        } catch (e: unknown) {
          openPanel({ kind: "error", message: e instanceof Error ? e.message : "泥댄겕由ъ뒪?몃? 遺덈윭?ㅼ? 紐삵뻽?듬땲??" });
        }
        return;
      }

      if (id === "upload_gaps") {
        const rows = uploads.items.filter((it) => uploadLooksIncomplete(it.status));
        openPanel({
          kind: "render",
          title: "誘몄셿猷??낅줈???곹깭 湲곗?)",
          node: <UploadPreviewList items={rows.slice(0, 20)} empty="?곹깭媛 鍮꾩뿀嫄곕굹 ?꾨즺濡?蹂댁씠吏 ?딅뒗 ?됱씠 ?놁뒿?덈떎." actionHref="/uploads" actionLabel="?낅줈???묒뾽?먯꽌 泥섎━" />,
        });
        return;
      }

      if (id === "data_bad") {
        const skipped = uploads.issues.filter((x) => x.kind === "row_skipped");
        const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
        openPanel({ kind: "render", title: "?곗씠???댁긽쨌吏묎퀎 ?쒖쇅", node: <IssueSummaryBody warnings={briefing.warnings} skipped={skipped} dup={dup} /> });
        return;
      }

      if (id === "dup_id") {
        const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
        const affected = duplicateUploadIdsFromIssues(uploads.issues);
        const rows = uploads.items.filter((it) => affected.has(it.id));
        openPanel({
          kind: "render",
          title: "以묐났 id ?낅줈??,
          node: (
            <div className="space-y-3 text-sm">
              {dup.length === 0 ? (
                <p className="text-zinc-600 dark:text-zinc-400">以묐났 id ?댁뒋媛 ?놁뒿?덈떎.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-200">
                  {dup.map((iss, i) => (
                    <li key={`${iss.id}-${i}`}><span className="font-mono text-xs">{iss.id}</span> ????{iss.sheet_rows.join(", ")}: {iss.message}</li>
                  ))}
                </ul>
              )}
              {rows.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">?대떦 id媛 遺숈? 紐⑸줉 ??/p>
                  <UploadPreviewList items={rows.slice(0, 12)} empty="" actionHref="/uploads" actionLabel="?낅줈???묒뾽?먯꽌 ?쒗듃 ?뺣━" />
                </div>
              ) : null}
            </div>
          ),
        });
        return;
      }

      if (id === "platform_stub") {
        openPanel({
          kind: "render",
          title: "?뚮옯?셋룹옉???쒖젙 議고쉶",
          node: <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">?뱀젙 ?뚮옯?셋룹옉?덈쭔 嫄몃윭 蹂대뒗 議고쉶???ㅼ쓬 ?댁뿉???쒗듃 ?는텮PI? ?곌껐?⑸땲?? 醫뚯륫 ?좏깮 ?곸옄媛 ?쒖꽦?붾릺硫??ш린???꾩껜?뺣낫瑜??꾩썎?덈떎.</p>,
        });
        return;
      }

      if (id === "upload_summary") {
        const inc = uploads.items.filter((it) => uploadLooksIncomplete(it.status)).length;
        const todayN = uploads.items.filter((it) => isUploadToday(it.uploaded_at)).length;
        const weekN = uploads.items.filter((it) => isUploadThisWeek(it.uploaded_at)).length;
        openPanel({
          kind: "render",
          title: "?낅줈???붿빟(紐⑸줉쨌釉뚮━??湲곗?)",
          node: (
            <ul className="list-inside list-disc space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
              <li>?쒗듃 ?뚯떛 ?깃났 ?? {uploads.items.length}嫄?/li>
              <li>誘몄셿猷??곹깭 ?대━?ㅽ떛): {inc}嫄?/li>
              <li>?ㅻ뒛 D?? {todayN}嫄?/ ?대쾲 二?????: {weekN}嫄?/li>
              <li>釉뚮━???ㅻ뒛 ?낅줈??吏묎퀎: {briefing.summary.today_upload_count}嫄?/li>
              <li>釉뚮━??吏?걔룻썑?? {briefing.summary.overdue_upload_count}嫄?/li>
            </ul>
          ),
        });
        return;
      }

      if (id === "urgent_only") {
        openPanel({
          kind: "render",
          title: "湲됲븳 ??湲닿툒 ?꾨낫)",
          node: briefing.urgent_items.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">湲닿툒 ?꾨낫媛 ?놁뒿?덈떎.</p>
          ) : (
            <ul className="space-y-2">
              {briefing.urgent_items.map((it) => (
                <li key={it.uid} className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <span className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">{it.source === "checklist" ? "泥댄겕" : "?낅줈??}</span>
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
        openPanel({
          kind: "render",
          title: "?쒗듃 諛깆뾽",
          node: <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Google ?ㅽ봽?덈뱶?쒗듃 硫붾돱?먯꽌 ?щ낯 留뚮뱾湲걔룸쾭??湲곕줉???ъ슜?섍굅?? ?ㅼ쓬 ?④퀎?먯꽌 ?쒕쾭 諛깆뾽 API瑜??곌껐?⑸땲??</p>,
        });
        return;
      }

      if (id === "today_triage") {
        openPanel({
          kind: "render",
          title: "?ㅻ뒛 釉뚮━???붿빟 + 湲닿툒)",
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">{briefing.briefing_text}</p>
              {briefing.urgent_items.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">湲닿툒 ?꾨낫 紐⑸줉??鍮꾩뼱 ?덉뒿?덈떎.</p>
              ) : (
                <ul className="space-y-2">
                  {briefing.urgent_items.slice(0, 10).map((it) => (
                    <li key={it.uid} className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                      <span className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">{it.source === "checklist" ? "泥댄겕" : "?낅줈??}</span>
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
          kind: "render",
          title: "硫붾え??(?쒗듃 ?꾩껜)",
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              {hub.memosError ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
                  硫붾え瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲?? {hub.memosError}
                </p>
              ) : null}
              <MemoPreviewList items={hub.memos} emptyHint="?쒖떆??硫붾え媛 ?놁뒿?덈떎. ?쇱そ ?ъ씠?쒕컮?먯꽌 硫붾え瑜?異붽??섍굅???쒗듃瑜??뺤씤?섏꽭??" />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">遺꾨쪟???쒗듃 ?뚮찓紐⑤텇瑜섅??댁뿉???낅젰?섎㈃, 吏덈Ц?섍린 寃?됱뿉 ?ы븿?⑸땲??</p>
            </div>
          ),
        });
        return;
      }
    },
    [hub, openPanel, refreshHistory],
  );

  const runQuestion = useCallback(
    (qRaw: string) => {
      const q = qRaw.trim();
      if (!q) return;
      pushRecentQuery(q);
      refreshHistory();
      if (hub.kind === "ready") {
        const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
        const matches = hub.memos.filter((m) => {
          const hay = `${m.content}\n${m.category ?? ""}`.toLowerCase();
          return tokens.every((t) => hay.includes(t));
        });
        openPanel({
          kind: "render",
          title: "吏덈Ц 쨌 硫붾え 寃??,
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              {hub.memosError ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
                  硫붾え 紐⑸줉??遺덈윭?ㅼ? 紐삵빐 寃?됱씠 ?쒗븳?⑸땲?? {hub.memosError}
                </p>
              ) : null}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">寃?됱뼱 ??q}????硫붾え?댁슜쨌硫붾え遺꾨쪟??怨듬갚?쇰줈 ?섎늿 ?ㅼ썙?쒓? 紐⑤몢 ?ㅼ뼱 ?덈뒗 ?됰쭔 ?쒖떆?⑸땲??</p>
              <MemoPreviewList items={matches} emptyHint="?쇱튂?섎뒗 硫붾え媛 ?놁뒿?덈떎. ?ㅼ썙?쒕? 以꾩씠嫄곕굹 ?쒗듃?먯꽌 遺꾨쪟瑜??낅젰?????곷떒?뚯쟾泥??덈줈怨좎묠?띿쓣 ?꾨Ⅴ?몄슂." />
              <p className="border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">泥댄겕쨌?낅줈?쑣룸툕由ы븨? ?곷떒 鍮좊Ⅸ 議고쉶 踰꾪듉???ъ슜?섏꽭??</p>
            </div>
          ),
        });
        return;
      }
      openPanel({ kind: "nl_stub", query: q });
    },
    [hub, openPanel, refreshHistory],
  );

  const submitQuestion = () => { runQuestion(queryDraft); };

  const copyResultPanel = useCallback(async () => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { window.alert("蹂듭궗???ㅽ뙣?덉뒿?덈떎. 釉뚮씪?곗? ?대┰蹂대뱶 沅뚰븳???뺤씤?섏꽭??"); }
  }, []);

  const saveResultTxt = useCallback(() => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `愿?쒓껐怨?${new Date().toISOString().slice(0, 10)}.txt`;
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
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">?ㅽ궎釉뚯뒪 愿?쒖떎</h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              PC??耳쒕몢怨?踰꾪듉?쇰줈 議고쉶 쨌 ?섏젙?{" "}
              <Link href="/checklist" className="font-medium underline">泥댄겕</Link>/<Link href="/uploads" className="font-medium underline">?낅줈??/Link>
            </p>
            <label htmlFor="control-query-input" className="sr-only">愿??吏덈Ц ?낅젰</label>
            <textarea
              id="control-query-input"
              rows={2}
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="?? ?대쾲 二??낅줈??/ ?ㅻ뒛 留덇컧 / 硫붾え 遺꾨쪟 ?ㅼ썙??
              className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={submitQuestion} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">吏덈Ц?섍린</button>
            <button type="button" onClick={() => void copyResultPanel()} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900">寃곌낵 蹂듭궗</button>
            <button type="button" onClick={saveResultTxt} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900">TXT ???/button>
            <button type="button" onClick={saveFavoriteFromInput} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">利먭꺼李얘린 ???/button>
          </div>
        </div>

        <div className="mx-auto mt-3 max-w-[1600px] border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quickBtn} onClick={() => void runPreset("today_upload", "?ㅻ뒛 ?낅줈??)}>?ㅻ뒛 ?낅줈??/button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("week_upload", "?대쾲 二??낅줈??)}>?대쾲 二??낅줈??/button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_gaps", "誘몄셿猷??낅줈??)}>誘몄셿猷??낅줈??/button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_summary", "?낅줈???붿빟")}>?낅줈???붿빟</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("today_triage", "?ㅻ뒛 釉뚮━??)}>?ㅻ뒛 釉뚮━??/button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("due_today", "?ㅻ뒛 留덇컧")}>?ㅻ뒛 留덇컧</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("incomplete_check", "誘몄셿猷??낅Т")}>誘몄셿猷??낅Т</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("urgent_only", "湲됲븳 ??)}>湲됲븳 ??/button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("data_bad", "?곗씠???먭?")}>?곗씠???먭?</button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("sheet_backup", "?쒗듃 諛깆뾽")}>?쒗듃 諛깆뾽</button>
            <button type="button" className={quickBtn} onClick={() => setHubRefreshKey((k) => k + 1)}>?꾩껜 ?덈줈怨좎묠</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-12">
        <aside className="space-y-3 lg:col-span-2">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase text-zinc-500">?뚮옯??/h2>
            <select disabled className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" aria-label="?뚮옯???좏깮">
              <option>?꾩껜 (?곕룞 ?덉젙)</option>
            </select>
            <h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">?묓뭹</h2>
            <select disabled className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900" aria-label="?묓뭹 ?좏깮">
              <option>?꾩껜 (?곕룞 ?덉젙)</option>
            </select>
            <button type="button" className="mt-3 w-full rounded-md border border-zinc-400 bg-zinc-100 py-2 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-800" onClick={() => void runPreset("platform_stub", "?꾩껜?뺣낫 蹂닿린")}>?꾩껜?뺣낫 蹂닿린</button>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <p className="font-semibold text-zinc-600 dark:text-zinc-400">理쒓렐 吏덈Ц</p>
            {recent.length === 0 ? <p className="mt-2 text-zinc-500">?놁쓬</p> : (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {recent.map((q) => (
                  <li key={q} className="flex gap-1">
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => { setQueryDraft(q); runQuestion(q); }}>{q}</button>
                    <button type="button" className="text-amber-600" title="利먭꺼李얘린" onClick={() => { toggleFavoriteQuery(q); refreshHistory(); }}>{favorites.includes(q) ? "?? : "??}</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 font-semibold text-zinc-600 dark:text-zinc-400">利먭꺼李얘린</p>
            {favorites.length === 0 ? <p className="mt-2 text-zinc-500">?놁쓬</p> : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {favorites.map((q) => (
                  <li key={q}>
                    <button type="button" className="w-full truncate text-left hover:underline" onClick={() => { setQueryDraft(q); const preset = SUGGESTED_QUERIES.find((s) => s.label === q); if (preset) void runPreset(preset.id, q); else runQuestion(q); }}>??{q}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
            <p className="font-medium">異붽? 吏덈Ц 移?/p>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTED_QUERIES.map((c) => (
                <button key={c.id} type="button" onClick={() => void runPreset(c.id, c.label)} className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-left hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700">{c.label}</button>
              ))}
            </div>
          </section>
        </aside>

        <main className="space-y-4 lg:col-span-7">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950" aria-label="罹섎┛??>
            <CalendarSection hub={hub} onDayClick={(d, y, m) => {
              if (hub.kind !== "ready") return;
              const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const uploads = hub.uploads.items.filter((it) => {
                const t = Date.parse(it.uploaded_at);
                if (!Number.isFinite(t)) return false;
                const dt = new Date(t);
                return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
              });
              const memos = hub.memos.filter((memo) => {
                const s = memo.memo_date?.trim().replace(/\./g, "-").replace(/\//g, "-");
                const match = s?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (!match) return false;
                return `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}` === ymd;
              });
              openPanel({
                kind: "render",
                title: `${ymd} ?쇱젙`,
                node: (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">?낅줈??({uploads.length}嫄?</p>
                      {uploads.length === 0 ? <p className="text-zinc-500">?놁쓬</p> : (
                        <ul className="mt-1 space-y-1">
                          {uploads.map((it) => <li key={it.uid} className="rounded border border-zinc-200 px-2 py-1 text-xs">{it.title} {it.status ? `[${it.status}]` : ""}</li>)}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-500">硫붾え ({memos.length}嫄?</p>
                      {memos.length === 0 ? <p className="text-zinc-500">?놁쓬</p> : (
                        <ul className="mt-1 space-y-1">
                          {memos.map((memo) => <li key={memo.sheet_row} className="rounded border border-zinc-200 px-2 py-1 text-xs">{memo.content}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                ),
              });
            }} />
          </section>

          {hub.kind === "loading" ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm dark:border-zinc-700 dark:bg-zinc-900" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
              釉뚮━?뫢룹뾽濡쒕뱶쨌硫붾え 遺덈윭?ㅻ뒗 以묅?            </div>
          ) : null}

          {hub.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/50 dark:bg-red-950/40" role="alert">
              <p className="font-medium text-red-800 dark:text-red-200">?곗씠??濡쒕뱶 ?ㅽ뙣</p>
              <p className="mt-1 text-red-700 dark:text-red-300">{hub.message}</p>
            </div>
          ) : null}

          <section id="control-result-panel" className="scroll-mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" aria-label="寃곌낵 ?⑤꼸">
            <h2 className="text-sm font-semibold">寃곌낵</h2>
            <div className="mt-3 min-h-[160px] text-sm">
              {panel.kind === "welcome" ? <p className="text-zinc-600 dark:text-zinc-400">?곷떒 鍮좊Ⅸ 議고쉶 踰꾪듉???꾨Ⅴ硫??ш린???듭씠 梨꾩썙吏묐땲??</p> : null}
              {panel.kind === "nl_stub" ? (
                <div className="space-y-2">
                  <p className="font-medium">吏덈Ц 湲곕줉(?곗씠??濡쒕뵫 ??</p>
                  <p className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-900">??panel.query}??/p>
                  <p className="text-xs text-zinc-500">愿???곗씠?곌? 以鍮꾨릺硫?媛숈? 吏덈Ц? 硫붾え 寃?됱뿉 ?ъ슜?⑸땲??</p>
                </div>
              ) : null}
              {panel.kind === "loading" ? <p className="text-zinc-500">{panel.label}</p> : null}
              {panel.kind === "error" ? <p className="text-red-800 dark:text-red-200" role="alert">{panel.message}</p> : null}
              {panel.kind === "render" ? (
                <div>
                  <p className="text-xs font-medium uppercase text-zinc-500">{panel.title}</p>
                  <div className="mt-3">{panel.node}</div>
                </div>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="lg:col-span-3">
          {metrics ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-xs font-semibold uppercase text-zinc-500">??쒕낫???붿빟</h2>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                <SidebarStat label="?ㅻ뒛 留덇컧(泥댄겕)" value={metrics.dueTodayCheck} onClick={() => void runPreset("due_today")} />
                <SidebarStat label="誘몄셿猷??낅줈?? value={metrics.incompleteUploads} onClick={() => void runPreset("upload_gaps")} />
                <SidebarStat label="?곗씠??二쇱쓽" value={metrics.dataOdd} onClick={() => void runPreset("data_bad")} />
                <SidebarStat label="以묐났 id" value={metrics.dupIdGroups} onClick={() => void runPreset("dup_id")} />
                <SidebarStat label="湲닿툒 ?꾨낫" value={metrics.urgent} onClick={() => void runPreset("urgent_only")} />
                <SidebarStat label="?ㅻ뒛 ?낅줈??吏묎퀎)" value={metrics.todayUploadBriefing} onClick={() => void runPreset("today_upload")} />
                <SidebarStat label="吏?걔룻썑??吏묎퀎)" value={metrics.overdueUploadBriefing} onClick={() => void runPreset("upload_summary")} />
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function CalendarSection({ hub, onDayClick }: { hub: HubLoadState; onDayClick: (d: number, y: number, m: number) => void }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const ready = hub.kind === "ready";

  const activityMap = useMemo(() => {
    if (hub.kind !== "ready") return new Map<string, { uploads: number; memos: number }>();
    const map = new Map<string, { uploads: number; memos: number }>();
    for (const it of hub.uploads.items) {
      const t = Date.parse(it.uploaded_at);
      if (!Number.isFinite(t)) continue;
      const dt = new Date(t);
      const key = `${dt.getFullYear()}-${dt.getMonth()+1}-${dt.getDate()}`;
      const cur = map.get(key) ?? { uploads: 0, memos: 0 };
      map.set(key, { ...cur, uploads: cur.uploads + 1 });
    }
    for (const memo of hub.memos) {
      const s = memo.memo_date?.trim().replace(/\./g, "-").replace(/\//g, "-");
      const match = s?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!match) continue;
      const key = `${match[1]}-${Number(match[2])}-${Number(match[3])}`;
      const cur = map.get(key) ?? { uploads: 0, memos: 0 };
      map.set(key, { ...cur, memos: cur.memos + 1 });
    }
    return map;
  }, [hub]);

  const first = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const d = new Date(viewYear, viewMonth - 2, 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth() + 1); }} className="rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">{"<"}</button>
          <p className="text-sm font-semibold">{viewYear}??{viewMonth}??/p>
          <button type="button" onClick={() => { const d = new Date(viewYear, viewMonth, 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth() + 1); }} className="rounded px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">{">"}</button>
        </div>
        <span className="text-[10px] text-zinc-500">?쒗듃 ?쇱젙 ?곕룞 ?덉젙</span>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
        {["??, "??, "??, "??, "紐?, "湲?, "??].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = `${viewYear}-${viewMonth}-${d}`;
          const act = activityMap.get(key);
          const hasDot = (act?.uploads ?? 0) + (act?.memos ?? 0) > 0;
          const isToday = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth && today.getDate() === d;
          return (
            <button
              key={`${key}-${i}`}
              type="button"
              disabled={!ready}
              onClick={() => onDayClick(d, viewYear, viewMonth)}
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
            ??{m.sheet_row} 쨌 {m.memo_date}
            {m.category ? <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">{m.category}</span> : <span className="ml-2 text-zinc-400">遺꾨쪟 ?놁쓬</span>}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-900 dark:text-zinc-50">{m.content}</p>
        </li>
      ))}
    </ul>
  );
}

function SidebarStat(props: { label: string; value: number; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{props.value}</span>
      <span className="mt-0.5 block text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">{props.label}</span>
    </>
  );
  if (props.onClick) {
    return (
      <li>
        <button type="button" onClick={props.onClick} className="flex w-full flex-col rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800">{body}</button>
      </li>
    );
  }
  return <li className="rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">{body}</li>;
}

function UploadPreviewList(props: { items: UploadListItem[]; empty: string; actionHref: string; actionLabel: string }) {
  if (props.items.length === 0 && props.empty) {
    return (
      <div className="space-y-2">
        <p className="text-zinc-600 dark:text-zinc-400">{props.empty}</p>
        <Link href={props.actionHref} className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">{props.actionLabel} ??/Link>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => (
          <li key={it.uid} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{it.title}</p>
            <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">{it.status ? `?곹깭 ${it.status} 쨌 ` : ""}{it.uploaded_at}</p>
          </li>
        ))}
      </ul>
      <Link href={props.actionHref} className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">{props.actionLabel} ??/Link>
    </div>
  );
}

function ChecklistPreviewList(props: { items: ChecklistItem[]; total: number }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">?쒖꽦 ??{props.total}嫄?以?{props.items.length}嫄?誘몃━蹂닿린</p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => (
          <li key={it.id} className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{it.title}</p>
            {it.note ? <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{it.note}</p> : null}
          </li>
        ))}
      </ul>
      <Link href="/checklist" className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100">泥댄겕 ?묒뾽?먯꽌 ?섏젙쨌?꾨즺 ??/Link>
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
      {props.warnings.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">釉뚮━??寃쎄퀬</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-200">{props.warnings.map((w, i) => <li key={`w-${i}`}>{w}</li>)}</ul>
        </div>
      ) : null}
      {props.skipped.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">紐⑸줉?먯꽌 ?쒖쇅????/p>
          <ul className="mt-1 space-y-1 text-zinc-800 dark:text-zinc-200">{props.skipped.map((s, i) => <li key={`s-${s.sheet_row}-${i}`}>??{s.sheet_row}: {s.message}</li>)}</ul>
        </div>
      ) : null}
      {props.dup.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-rose-900 dark:text-rose-100">以묐났 id</p>
          <ul className="mt-1 space-y-1 text-zinc-800 dark:text-zinc-200">{props.dup.map((d, i) => <li key={`d-${d.id}-${i}`}><span className="font-mono text-xs">{d.id}</span> ????{d.sheet_rows.join(", ")}</li>)}</ul>
        </div>
      ) : null}
      {props.warnings.length === 0 && props.skipped.length === 0 && props.dup.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">?쒖떆???댁긽 吏뺥썑媛 ?놁뒿?덈떎.</p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">?쒗듃瑜?怨좎튇 ???묒뾽 ?붾㈃?먯꽌 ?덈줈怨좎묠?섏꽭??</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/uploads" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100">?낅줈???묒뾽 ??/Link>
        <Link href="/checklist" className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100">泥댄겕 ?묒뾽 ??/Link>
      </div>
    </div>
  );
}
