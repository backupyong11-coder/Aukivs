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
  { id: "due_today", label: "?¤ëŠ˜ ë§ˆê° ë­ì•¼" },
  { id: "week_upload", label: "?´ë²ˆ ì£??…ë¡œ???¼ì • ë³´ì—¬ì¤? },
  { id: "incomplete_check", label: "ë¯¸ì™„ë£?ì²´í¬ë¦¬ìŠ¤?¸ë§Œ ë³´ì—¬ì¤? },
  { id: "upload_gaps", label: "?…ë¡œ???„ë½ ?ë£Œ ì°¾ì•„ì¤? },
  { id: "data_bad", label: "?°ì´???´ìƒ????ª© ë³´ì—¬ì¤? },
  { id: "dup_id", label: "ì¤‘ë³µ id ?ˆëŠ” ?…ë¡œ??ë³´ì—¬ì¤? },
  { id: "platform_stub", label: "ë¯¸íˆ° ê´€???ë£Œë§?ë³´ì—¬ì¤? },
  { id: "today_triage", label: "?¤ëŠ˜ ?ë´????ê²ƒë§Œ ?•ë¦¬?´ì¤˜" },
  { id: "memo_all", label: "ë©”ëª¨???„ì²´ ë³´ê¸°" },
];

function uploadLooksIncomplete(status: string | null): boolean {
  if (!status || !status.trim()) return true;
  const s = status.trim().toLowerCase();
  const done = ["?„ë£Œ", "?„ë£Œ??, "??, "done", "complete", "ok"];
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
          setHub({
            kind: "error",
            message: userFacingListError("briefing", b.message),
          });
          return;
        }
        if (!u.ok) {
          setHub({
            kind: "error",
            message: userFacingListError("uploads", u.message),
          });
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
          message:
            e instanceof Error
              ? e.message
              : "?°ì´?°ë? ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??",
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
    const incompleteUploads = uploads.items.filter((it) =>
      uploadLooksIncomplete(it.status),
    ).length;
    const dataOdd =
      skipped.length + briefing.warnings.length + dupIssues.length;
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

  const openPanel = useCallback(
    (next: PanelState) => {
      setPanel(next);
      requestAnimationFrame(() => {
        document.getElementById("control-result-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    },
    [],
  );

  const runPreset = useCallback(
    async (id: string, labelForRecent?: string) => {
      const label = labelForRecent ?? SUGGESTED_QUERIES.find((x) => x.id === id)?.label ?? id;
      pushRecentQuery(label);
      refreshHistory();

      if (hub.kind !== "ready") {
        openPanel({
          kind: "error",
          message:
            hub.kind === "error"
              ? hub.message
              : "?„ì§ ê´€???°ì´?°ë? ë¶ˆëŸ¬?¤ëŠ” ì¤‘ì…?ˆë‹¤. ? ì‹œ ???¤ì‹œ ?œë„?˜ì„¸??",
        });
        return;
      }

      const { briefing, uploads } = hub;

      if (id === "due_today") {
        const checklistUrgent = briefing.urgent_items.filter(
          (x) => x.source === "checklist",
        );
        openPanel({
          kind: "render",
          title: "?¤ëŠ˜ ë§ˆê°Â·?¤ëŠ˜ ì²˜ë¦¬(ë¸Œë¦¬??",
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
                ?¤ëŠ˜ ì§‘ê³„??ì²´í¬ ê±´ìˆ˜:{" "}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {briefing.summary.today_checklist_count}
                </span>
                ê±? ê¸´ê¸‰ ?„ë³´ ì¤?ì²´í¬ ì¶œì²˜???„ë˜??ë¯¸ë¦¬ ë³´ì—¬ ì¤ë‹ˆ?? ?˜ì •?€{" "}
                <Link href="/checklist" className="font-medium underline">
                  ì²´í¬ ?‘ì—…
                </Link>
                ?ì„œ ?˜ì„¸??
              </p>
              {checklistUrgent.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  ì²´í¬ ì¶œì²˜ ê¸´ê¸‰ ?„ë³´ê°€ ?†ìŠµ?ˆë‹¤.
                </p>
              ) : (
                <ul className="space-y-2">
                  {checklistUrgent.map((it) => (
                    <li
                      key={it.uid}
                      className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                    >
                      <p className="font-medium">{it.title}</p>
                      {it.note ? (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {it.note}
                        </p>
                      ) : null}
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
          title: "?¤ëŠ˜ ?…ë¡œ???œê°???¡íŒ ??,
          node: (
            <UploadPreviewList
              items={rows}
              empty="?¤ëŠ˜ ? ì§œ(D??ë¡??¡íŒ ?…ë¡œ???‰ì´ ?†ìŠµ?ˆë‹¤."
              actionHref="/uploads"
              actionLabel="?…ë¡œ???‘ì—…?ì„œ ?„ì²´ ë³´ê¸°"
            />
          ),
        });
        return;
      }

      if (id === "week_upload") {
        const rows = uploads.items.filter((it) => isUploadThisWeek(it.uploaded_at));
        openPanel({
          kind: "render",
          title: "?´ë²ˆ ì£??…ë¡œ???¼ì •(ëª©ë¡ ê¸°ì?)",
          node: (
            <UploadPreviewList
              items={rows}
              empty="?´ë²ˆ ì£??…ë¡œ???œê°(D???¼ë¡œ ?¡íŒ ?‰ì´ ?†ìŠµ?ˆë‹¤."
              actionHref="/uploads"
              actionLabel="?…ë¡œ???‘ì—…?ì„œ ?„ì²´Â·?„í„°"
            />
          ),
        });
        return;
      }

      if (id === "incomplete_check") {
        openPanel({ kind: "loading", label: "ì²´í¬ë¦¬ìŠ¤??ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€? });
        try {
          const r = await fetchChecklist();
          if (!r.ok) {
            openPanel({
              kind: "error",
              message: userFacingListError("checklist", r.message),
            });
            return;
          }
          openPanel({
            kind: "render",
            title: "ë¯¸ì™„ë£?ì²´í¬ë¦¬ìŠ¤???œì„± ??",
            node: (
              <ChecklistPreviewList
                items={r.items.slice(0, 15)}
                total={r.items.length}
              />
            ),
          });
        } catch (e: unknown) {
          openPanel({
            kind: "error",
            message:
              e instanceof Error
                ? e.message
                : "ì²´í¬ë¦¬ìŠ¤?¸ë? ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ??",
          });
        }
        return;
      }

      if (id === "upload_gaps") {
        const rows = uploads.items.filter((it) => uploadLooksIncomplete(it.status));
        openPanel({
          kind: "render",
          title: "ë¯¸ì™„ë£??…ë¡œ???íƒœ ê¸°ì?)",
          node: (
            <UploadPreviewList
              items={rows.slice(0, 20)}
              empty="?íƒœê°€ ë¹„ì—ˆê±°ë‚˜ ?„ë£Œë¡?ë³´ì´ì§€ ?ŠëŠ” ?‰ì´ ?†ìŠµ?ˆë‹¤."
              actionHref="/uploads"
              actionLabel="?…ë¡œ???‘ì—…?ì„œ ì²˜ë¦¬"
            />
          ),
        });
        return;
      }

      if (id === "data_bad") {
        const skipped = uploads.issues.filter((x) => x.kind === "row_skipped");
        const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
        openPanel({
          kind: "render",
          title: "?°ì´???´ìƒÂ·ì§‘ê³„ ?œì™¸",
          node: (
            <IssueSummaryBody
              warnings={briefing.warnings}
              skipped={skipped}
              dup={dup}
            />
          ),
        });
        return;
      }

      if (id === "dup_id") {
        const dup = uploads.issues.filter((x) => x.kind === "duplicate_id");
        const affected = duplicateUploadIdsFromIssues(uploads.issues);
        const rows = uploads.items.filter((it) => affected.has(it.id));
        openPanel({
          kind: "render",
          title: "ì¤‘ë³µ id ?…ë¡œ??,
          node: (
            <div className="space-y-3 text-sm">
              {dup.length === 0 ? (
                <p className="text-zinc-600 dark:text-zinc-400">
                  ì¤‘ë³µ id ?´ìŠˆê°€ ?†ìŠµ?ˆë‹¤.
                </p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-200">
                  {dup.map((iss, i) => (
                    <li key={`${iss.id}-${i}`}>
                      <span className="font-mono text-xs">{iss.id}</span> ????" "}
                      {iss.sheet_rows.join(", ")}: {iss.message}
                    </li>
                  ))}
                </ul>
              )}
              {rows.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    ?´ë‹¹ idê°€ ë¶™ì? ëª©ë¡ ??                  </p>
                  <UploadPreviewList
                    items={rows.slice(0, 12)}
                    empty=""
                    actionHref="/uploads"
                    actionLabel="?…ë¡œ???‘ì—…?ì„œ ?œíŠ¸ ?•ë¦¬"
                  />
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
          title: "?Œë«?¼Â·ì‘???œì • ì¡°íšŒ",
          node: (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              ?¹ì • ?Œë«?¼Â·ì‘?ˆë§Œ ê±¸ëŸ¬ ë³´ëŠ” ì¡°íšŒ???¤ìŒ ?´ì—???œíŠ¸ ?´Â·API?€ ?°ê²°?©ë‹ˆ??
              ì¢Œì¸¡ ? íƒ ?ìê°€ ?œì„±?”ë˜ë©??¬ê¸°???„ì²´?•ë³´ë¥??„ì›?ˆë‹¤.
            </p>
          ),
        });
        return;
      }

      if (id === "upload_summary") {
        const inc = uploads.items.filter((it) =>
          uploadLooksIncomplete(it.status),
        ).length;
        const todayN = uploads.items.filter((it) =>
          isUploadToday(it.uploaded_at),
        ).length;
        const weekN = uploads.items.filter((it) =>
          isUploadThisWeek(it.uploaded_at),
        ).length;
        openPanel({
          kind: "render",
          title: "?…ë¡œ???”ì•½(ëª©ë¡Â·ë¸Œë¦¬??ê¸°ì?)",
          node: (
            <ul className="list-inside list-disc space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
              <li>?œíŠ¸ ?Œì‹± ?±ê³µ ?? {uploads.items.length}ê±?/li>
              <li>ë¯¸ì™„ë£??íƒœ ?´ë¦¬?¤í‹±): {inc}ê±?/li>
              <li>?¤ëŠ˜ D?? {todayN}ê±?/ ?´ë²ˆ ì£?????: {weekN}ê±?/li>
              <li>ë¸Œë¦¬???¤ëŠ˜ ?…ë¡œ??ì§‘ê³„: {briefing.summary.today_upload_count}ê±?/li>
              <li>ë¸Œë¦¬??ì§€?°Â·í›„?? {briefing.summary.overdue_upload_count}ê±?/li>
            </ul>
          ),
        });
        return;
      }

      if (id === "urgent_only") {
        openPanel({
          kind: "render",
          title: "ê¸‰í•œ ??ê¸´ê¸‰ ?„ë³´)",
          node:
            briefing.urgent_items.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                ê¸´ê¸‰ ?„ë³´ê°€ ?†ìŠµ?ˆë‹¤.
              </p>
            ) : (
              <ul className="space-y-2">
                {briefing.urgent_items.map((it) => (
                  <li
                    key={it.uid}
                    className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30"
                  >
                    <span className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">
                      {it.source === "checklist" ? "ì²´í¬" : "?…ë¡œ??}
                    </span>
                    <p className="mt-1 font-medium">{it.title}</p>
                    {it.note ? (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {it.note}
                      </p>
                    ) : null}
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
          title: "?œíŠ¸ ë°±ì—…",
          node: (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Google ?¤í”„?ˆë“œ?œíŠ¸ ë©”ë‰´?ì„œ ?¬ë³¸ ë§Œë“¤ê¸°Â·ë²„??ê¸°ë¡???¬ìš©?˜ê±°?? ?¤ìŒ ?¨ê³„?ì„œ
              ?œë²„ ë°±ì—… APIë¥??°ê²°?©ë‹ˆ??
            </p>
          ),
        });
        return;
      }

      if (id === "today_triage") {
        openPanel({
          kind: "render",
          title: "?¤ëŠ˜ ë¸Œë¦¬???”ì•½ + ê¸´ê¸‰)",
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
                {briefing.briefing_text}
              </p>
              {briefing.urgent_items.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  ê¸´ê¸‰ ?„ë³´ ëª©ë¡??ë¹„ì–´ ?ˆìŠµ?ˆë‹¤.
                </p>
              ) : (
                <ul className="space-y-2">
                  {briefing.urgent_items.slice(0, 10).map((it) => (
                    <li
                      key={it.uid}
                      className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30"
                    >
                      <span className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">
                        {it.source === "checklist" ? "ì²´í¬" : "?…ë¡œ??}
                      </span>
                      <p className="mt-1 font-medium">{it.title}</p>
                      {it.note ? (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {it.note}
                        </p>
                      ) : null}
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
          title: "ë©”ëª¨??(?œíŠ¸ ?„ì²´)",
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              {hub.memosError ? (
                <p
                  className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
                  role="alert"
                >
                  ë©”ëª¨ë¥?ë¶ˆëŸ¬?¤ì? ëª»í–ˆ?µë‹ˆ?? {hub.memosError}
                </p>
              ) : null}
              <MemoPreviewList
                items={hub.memos}
                emptyHint="?œì‹œ??ë©”ëª¨ê°€ ?†ìŠµ?ˆë‹¤. ?¼ìª½ ?¬ì´?œë°”?ì„œ ë©”ëª¨ë¥?ì¶”ê??˜ê±°???œíŠ¸ë¥??•ì¸?˜ì„¸??"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ë¶„ë¥˜???œíŠ¸ ?Œë©”ëª¨ë¶„ë¥˜ã€??´ì—???…ë ¥?˜ë©´, ì§ˆë¬¸?˜ê¸° ê²€?‰ì—
                ?¬í•¨?©ë‹ˆ??
              </p>
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
          title: "ì§ˆë¬¸ Â· ë©”ëª¨ ê²€??,
          node: (
            <div className="space-y-3 text-sm text-zinc-800 dark:text-zinc-200">
              {hub.memosError ? (
                <p
                  className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
                  role="alert"
                >
                  ë©”ëª¨ ëª©ë¡??ë¶ˆëŸ¬?¤ì? ëª»í•´ ê²€?‰ì´ ?œí•œ?©ë‹ˆ?? {hub.memosError}
                </p>
              ) : null}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ê²€?‰ì–´ ??q}????ë©”ëª¨?´ìš©Â·ë©”ëª¨ë¶„ë¥˜??ê³µë°±?¼ë¡œ ?˜ëˆˆ ?¤ì›Œ?œê? ëª¨ë‘
                ?¤ì–´ ?ˆëŠ” ?‰ë§Œ ?œì‹œ?©ë‹ˆ??
              </p>
              <MemoPreviewList
                items={matches}
                emptyHint="?¼ì¹˜?˜ëŠ” ë©”ëª¨ê°€ ?†ìŠµ?ˆë‹¤. ?¤ì›Œ?œë? ì¤„ì´ê±°ë‚˜ ?œíŠ¸?ì„œ ë¶„ë¥˜ë¥??…ë ¥?????ë‹¨?Œì „ì²??ˆë¡œê³ ì¹¨?ì„ ?„ë¥´?¸ìš”."
              />
              <p className="border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                ì²´í¬Â·?…ë¡œ?œÂ·ë¸Œë¦¬í•‘?€ ?ë‹¨ ë¹ ë¥¸ ì¡°íšŒ ë²„íŠ¼???¬ìš©?˜ì„¸??
              </p>
            </div>
          ),
        });
        return;
      }
      openPanel({
        kind: "nl_stub",
        query: q,
      });
    },
    [hub, openPanel, refreshHistory],
  );

  const submitQuestion = () => {
    runQuestion(queryDraft);
  };

  const copyResultPanel = useCallback(async () => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert("ë³µì‚¬???¤íŒ¨?ˆìŠµ?ˆë‹¤. ë¸Œë¼?°ì? ?´ë¦½ë³´ë“œ ê¶Œí•œ???•ì¸?˜ì„¸??");
    }
  }, []);

  const saveResultTxt = useCallback(() => {
    const el = document.getElementById("control-result-panel");
    const text = el?.innerText?.trim() ?? "";
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ê´€?œê²°ê³?${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const saveFavoriteFromInput = () => {
    const q = queryDraft.trim();
    if (!q) return;
    toggleFavoriteQuery(q);
    refreshHistory();
  };

  const quickBtn =
    "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

  return (
    <div className="min-h-full bg-zinc-100/90 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">
              ?¹íˆ° ?´ì˜ ê´€?œì‹¤
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              PC??ì¼œë‘ê³?ë²„íŠ¼?¼ë¡œ ì¡°íšŒ Â· ?˜ì •?€{" "}
              <Link href="/checklist" className="font-medium underline">
                ì²´í¬
              </Link>
              /
              <Link href="/uploads" className="font-medium underline">
                ?…ë¡œ??              </Link>
            </p>
            <label htmlFor="control-query-input" className="sr-only">
              ê´€??ì§ˆë¬¸ ?…ë ¥
            </label>
            <textarea
              id="control-query-input"
              rows={2}
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="?? ?´ë²ˆ ì£??…ë¡œ??/ ?¤ëŠ˜ ë§ˆê° / ë©”ëª¨ ë¶„ë¥˜ ?¤ì›Œ??
              className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submitQuestion}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              ì§ˆë¬¸?˜ê¸°
            </button>
            <button
              type="button"
              onClick={() => void copyResultPanel()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900"
            >
              ê²°ê³¼ ë³µì‚¬
            </button>
            <button
              type="button"
              onClick={saveResultTxt}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900"
            >
              TXT ?€??            </button>
            <button
              type="button"
              onClick={saveFavoriteFromInput}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
            >
              ì¦ê²¨ì°¾ê¸° ?€??            </button>
          </div>
        </div>

        <div className="mx-auto mt-3 max-w-[1600px] space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            ë¹ ë¥¸ ì¡°íšŒ (?…ë¡œ??
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quickBtn} onClick={() => void runPreset("today_upload", "?¤ëŠ˜ ?…ë¡œ??)}>
              ?¤ëŠ˜ ?…ë¡œ??            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("week_upload", "?´ë²ˆ ì£??…ë¡œ??)}>
              ?´ë²ˆ ì£??…ë¡œ??            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_gaps", "ë¯¸ì™„ë£??…ë¡œ??)}>
              ë¯¸ì™„ë£??…ë¡œ??            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("upload_summary", "?…ë¡œ???”ì•½")}>
              ?…ë¡œ???”ì•½
            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("today_triage", "?¤ëŠ˜ ë¸Œë¦¬??)}>
              ?¤ëŠ˜ ë¸Œë¦¬??            </button>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            ë¹ ë¥¸ ì¡°íšŒ (?…ë¬´)
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quickBtn} onClick={() => void runPreset("due_today", "?¤ëŠ˜ ë§ˆê°")}>
              ?¤ëŠ˜ ë§ˆê°
            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("incomplete_check", "ë¯¸ì™„ë£??…ë¬´")}>
              ë¯¸ì™„ë£??…ë¬´
            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("urgent_only", "ê¸‰í•œ ??)}>
              ê¸‰í•œ ??            </button>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            ?„êµ¬
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quickBtn} onClick={() => void runPreset("data_bad", "?°ì´???ê?")}>
              ?°ì´???ê?
            </button>
            <button type="button" className={quickBtn} onClick={() => void runPreset("sheet_backup", "?œíŠ¸ ë°±ì—…")}>
              ?œíŠ¸ ë°±ì—…
            </button>
            <button
              type="button"
              className={quickBtn}
              onClick={() => setHubRefreshKey((k) => k + 1)}
            >
              ?„ì²´ ?ˆë¡œê³ ì¹¨
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-12">
        <aside className="space-y-3 lg:col-span-2">
          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-xs font-semibold uppercase text-zinc-500">
              ?Œë«??            </h2>
            <select
              disabled
              className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              aria-label="?Œë«??? íƒ"
            >
              <option>?„ì²´ (?°ë™ ?ˆì •)</option>
            </select>
            <h2 className="mt-3 text-xs font-semibold uppercase text-zinc-500">
              ?‘í’ˆ
            </h2>
            <select
              disabled
              className="mt-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              aria-label="?‘í’ˆ ? íƒ"
            >
              <option>?„ì²´ (?°ë™ ?ˆì •)</option>
            </select>
            <button
              type="button"
              className="mt-3 w-full rounded-md border border-zinc-400 bg-zinc-100 py-2 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-800"
              onClick={() => void runPreset("platform_stub", "?„ì²´?•ë³´ ë³´ê¸°")}
            >
              ?„ì²´?•ë³´ ë³´ê¸°
            </button>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <p className="font-semibold text-zinc-600 dark:text-zinc-400">ìµœê·¼ ì§ˆë¬¸</p>
            {recent.length === 0 ? (
              <p className="mt-2 text-zinc-500">?†ìŒ</p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {recent.map((q) => (
                  <li key={q} className="flex gap-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      onClick={() => {
                        setQueryDraft(q);
                        runQuestion(q);
                      }}
                    >
                      {q}
                    </button>
                    <button type="button" className="text-amber-600" title="ì¦ê²¨ì°¾ê¸°" onClick={() => { toggleFavoriteQuery(q); refreshHistory(); }}>
                      {favorites.includes(q) ? "?? : "??}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 font-semibold text-zinc-600 dark:text-zinc-400">ì¦ê²¨ì°¾ê¸°</p>
            {favorites.length === 0 ? (
              <p className="mt-2 text-zinc-500">?†ìŒ</p>
            ) : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {favorites.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      className="w-full truncate text-left hover:underline"
                      onClick={() => {
                        setQueryDraft(q);
                        const preset = SUGGESTED_QUERIES.find((s) => s.label === q);
                        if (preset) void runPreset(preset.id, q);
                        else runQuestion(q);
                      }}
                    >
                      ??{q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
            <p className="font-medium">ì¶”ê? ì§ˆë¬¸ ì¹?/p>
            <div className="mt-2 flex flex-wrap gap-1">
              {SUGGESTED_QUERIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void runPreset(c.id, c.label)}
                  className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-left hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="space-y-4 lg:col-span-7">
          <section
            className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
            aria-label="ìº˜ë¦°???ë¦¬)"
          >
            <CalendarPlaceholder />
          </section>

          {hub.kind === "loading" ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm dark:border-zinc-700 dark:bg-zinc-900" role="status">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
              ë¸Œë¦¬?‘Â·ì—…ë¡œë“œÂ·ë©”ëª¨ ë¶ˆëŸ¬?¤ëŠ” ì¤‘â€?            </div>
          ) : null}

          {hub.kind === "error" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-900/50 dark:bg-red-950/40" role="alert">
              <p className="font-medium text-red-800 dark:text-red-200">?°ì´??ë¡œë“œ ?¤íŒ¨</p>
              <p className="mt-1 text-red-700 dark:text-red-300">{hub.message}</p>
            </div>
          ) : null}

          <section
            id="control-result-panel"
            className="scroll-mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            aria-label="ê²°ê³¼ ?¨ë„"
          >
            <h2 className="text-sm font-semibold">ê²°ê³¼</h2>
            <div className="mt-3 min-h-[160px] text-sm">
              {panel.kind === "welcome" ? (
                <p className="text-zinc-600 dark:text-zinc-400">
                  ?ë‹¨ ë¹ ë¥¸ ì¡°íšŒ ë²„íŠ¼???„ë¥´ë©??¬ê¸°???µì´ ì±„ì›Œì§‘ë‹ˆ??
                </p>
              ) : null}
              {panel.kind === "nl_stub" ? (
                <div className="space-y-2">
                  <p className="font-medium">ì§ˆë¬¸ ê¸°ë¡(?°ì´??ë¡œë”© ??</p>
                  <p className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-900">??panel.query}??/p>
                  <p className="text-xs text-zinc-500">
                    ê´€???°ì´?°ê? ì¤€ë¹„ë˜ë©?ê°™ì? ì§ˆë¬¸?€ ë©”ëª¨ ê²€?‰ì— ?¬ìš©?©ë‹ˆ?? ì§€ê¸ˆì?
                    ?ë‹¨ ë¹ ë¥¸ ì¡°íšŒë¥??´ìš©?˜ì„¸??
                  </p>
                </div>
              ) : null}
              {panel.kind === "loading" ? <p className="text-zinc-500">{panel.label}</p> : null}
              {panel.kind === "error" ? (
                <p className="text-red-800 dark:text-red-200" role="alert">{panel.message}</p>
              ) : null}
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
              <h2 className="text-xs font-semibold uppercase text-zinc-500">?€?œë³´???”ì•½</h2>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                <SidebarStat label="?¤ëŠ˜ ë§ˆê°(ì²´í¬)" value={metrics.dueTodayCheck} onClick={() => void runPreset("due_today")} />
                <SidebarStat label="ë¯¸ì™„ë£??…ë¡œ?? value={metrics.incompleteUploads} onClick={() => void runPreset("upload_gaps")} />
                <SidebarStat label="?°ì´??ì£¼ì˜" value={metrics.dataOdd} onClick={() => void runPreset("data_bad")} />
                <SidebarStat label="ì¤‘ë³µ id" value={metrics.dupIdGroups} onClick={() => void runPreset("dup_id")} />
                <SidebarStat label="ê¸´ê¸‰ ?„ë³´" value={metrics.urgent} onClick={() => void runPreset("urgent_only")} />
                <SidebarStat label="?¤ëŠ˜ ?…ë¡œ??ì§‘ê³„)" value={metrics.todayUploadBriefing} onClick={() => void runPreset("today_upload")} />
                <SidebarStat label="ì§€?°Â·í›„??ì§‘ê³„)" value={metrics.overdueUploadBriefing} onClick={() => void runPreset("upload_summary")} />
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function CalendarPlaceholder() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const label = `${y}??${m}??;
  const first = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <span className="text-[10px] text-zinc-500">?œíŠ¸ ?¼ì • ?°ë™ ?ˆì •</span>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
        {["??, "??, "??, "??, "ëª?, "ê¸?, "??].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
        {cells.map((d, i) => (
          <div
            key={i}
            className={`rounded py-1 ${d === now.getDate() ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-700 dark:text-zinc-300"}`}
          >
            {d ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemoPreviewList(props: { items: MemoItem[]; emptyHint: string }) {
  if (props.items.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{props.emptyHint}</p>
    );
  }
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto">
      {props.items.map((m) => (
        <li
          key={m.sheet_row}
          className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
        >
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            ??{m.sheet_row} Â· {m.memo_date}
            {m.category ? (
              <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
                {m.category}
              </span>
            ) : (
              <span className="ml-2 text-zinc-400">ë¶„ë¥˜ ?†ìŒ</span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-900 dark:text-zinc-50">
            {m.content}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SidebarStat(props: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {props.value}
      </span>
      <span className="mt-0.5 block text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
        {props.label}
      </span>
    </>
  );
  if (props.onClick) {
    return (
      <li>
        <button
          type="button"
          onClick={props.onClick}
          className="flex w-full flex-col rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:bg-zinc-800"
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li className="rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
      {body}
    </li>
  );
}

function UploadPreviewList(props: {
  items: UploadListItem[];
  empty: string;
  actionHref: string;
  actionLabel: string;
}) {
  if (props.items.length === 0 && props.empty) {
    return (
      <div className="space-y-2">
        <p className="text-zinc-600 dark:text-zinc-400">{props.empty}</p>
        <Link
          href={props.actionHref}
          className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          {props.actionLabel} ??        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => (
          <li
            key={it.uid}
            className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
          >
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {it.title}
            </p>
            <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
              {it.status ? `?íƒœ ${it.status} Â· ` : ""}
              {it.uploaded_at}
            </p>
          </li>
        ))}
      </ul>
      <Link
        href={props.actionHref}
        className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
      >
        {props.actionLabel} ??      </Link>
    </div>
  );
}

function ChecklistPreviewList(props: {
  items: ChecklistItem[];
  total: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        ?œì„± ??{props.total}ê±?ì¤?{props.items.length}ê±?ë¯¸ë¦¬ë³´ê¸°
      </p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {props.items.map((it) => (
          <li
            key={it.id}
            className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
          >
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {it.title}
            </p>
            {it.note ? (
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{it.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <Link
        href="/checklist"
        className="inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
      >
        ì²´í¬ ?‘ì—…?ì„œ ?˜ì •Â·?„ë£Œ ??      </Link>
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
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            ë¸Œë¦¬??ê²½ê³ 
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-200">
            {props.warnings.map((w, i) => (
              <li key={`w-${i}`}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.skipped.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            ëª©ë¡?ì„œ ?œì™¸????          </p>
          <ul className="mt-1 space-y-1 text-zinc-800 dark:text-zinc-200">
            {props.skipped.map((s, i) => (
              <li key={`s-${s.sheet_row}-${i}`}>
                ??{s.sheet_row}: {s.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.dup.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-rose-900 dark:text-rose-100">
            ì¤‘ë³µ id
          </p>
          <ul className="mt-1 space-y-1 text-zinc-800 dark:text-zinc-200">
            {props.dup.map((d, i) => (
              <li key={`d-${d.id}-${i}`}>
                <span className="font-mono text-xs">{d.id}</span> ????" "}
                {d.sheet_rows.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.warnings.length === 0 &&
      props.skipped.length === 0 &&
      props.dup.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          ?œì‹œ???´ìƒ ì§•í›„ê°€ ?†ìŠµ?ˆë‹¤.
        </p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        ?œíŠ¸ë¥?ê³ ì¹œ ???‘ì—… ?”ë©´?ì„œ ?ˆë¡œê³ ì¹¨?˜ì„¸??
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/uploads"
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          ?…ë¡œ???‘ì—… ??        </Link>
        <Link
          href="/checklist"
          className="text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
        >
          ì²´í¬ ?‘ì—… ??        </Link>
      </div>
    </div>
  );
}
