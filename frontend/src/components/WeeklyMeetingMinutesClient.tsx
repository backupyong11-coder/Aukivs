"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addWeeksToMonday,
  fetchWeeklyMeetingMinutes,
  mondayOfWeek,
  type WeeklyMeetingMinutesItem,
} from "@/lib/weeklyMeetingMinutesApi";
import { formatSeoulYmd } from "@/lib/sheetDates";
import { WeeklyMeetingMinutesModal } from "@/components/WeeklyMeetingMinutesModal";

type ViewMode = "list" | "card" | "board";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: WeeklyMeetingMinutesItem[] };

const STATUS_META: Record<string, { label: string; tone: string }> = {
  draft: { label: "작성 중", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  scheduled: { label: "예정", tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  in_review: { label: "검토 중", tone: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200" },
  done: { label: "완료", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
};

function formatWeekShort(ws: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ws);
  if (!m) return ws;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function weekRangeShort(ws: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ws);
  if (!m) return ws;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const f = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${f(start)} ~ ${f(end)}`;
}

function summary(item: WeeklyMeetingMinutesItem): string {
  const c = (item.content ?? "").trim();
  if (c) return c.replace(/\s+/g, " ").slice(0, 160);
  if (item.decisions.length > 0) return `결정 ${item.decisions.length}개 · ${item.decisions[0]}`;
  if (item.action_items.length > 0) return `액션 ${item.action_items.length}개`;
  return "내용이 비어 있습니다.";
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

export function WeeklyMeetingMinutesClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [view, setView] = useState<ViewMode>("card");
  const [modalWeek, setModalWeek] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState({ kind: "loading" });
      const r = await fetchWeeklyMeetingMinutes();
      if (cancelled) return;
      if (!r.ok) {
        setState({ kind: "error", message: r.message });
        return;
      }
      setState({ kind: "ready", items: r.items });
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const todayMonday = useMemo(() => mondayOfWeek(formatSeoulYmd(new Date())), []);

  const sortedItems = useMemo(() => {
    if (state.kind !== "ready") return [];
    return [...state.items].sort((a, b) => b.week_start.localeCompare(a.week_start));
  }, [state]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((it) => {
      const hay = [
        it.title,
        it.content,
        it.attendees.join(" "),
        it.tags.join(" "),
        it.decisions.join(" "),
        it.action_items.map((a) => a.text).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedItems, query]);

  const currentItem = useMemo(() => {
    if (modalWeek == null) return null;
    return sortedItems.find((it) => it.week_start === modalWeek) ?? null;
  }, [sortedItems, modalWeek]);

  const tabBtn = "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors";
  const tabOn = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  const tabOff =
    "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

  function openWeek(weekStart: string) {
    setModalWeek(weekStart);
  }

  function createNew() {
    openWeek(todayMonday);
  }

  function createPrevWeek() {
    openWeek(addWeeksToMonday(todayMonday, -1));
  }

  function createNextWeek() {
    openWeek(addWeeksToMonday(todayMonday, 1));
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">주간 회의록</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            매주 월요일 기준으로 기록되는 주간 회의록입니다. 카드를 클릭하면 노션처럼 팝업으로 열립니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`${tabBtn} ${view === "list" ? tabOn : tabOff}`}
              title="리스트"
            >
              리스트
            </button>
            <button
              type="button"
              onClick={() => setView("card")}
              className={`${tabBtn} ${view === "card" ? tabOn : tabOff}`}
              title="카드"
            >
              카드
            </button>
            <button
              type="button"
              onClick={() => setView("board")}
              className={`${tabBtn} ${view === "board" ? tabOn : tabOff}`}
              title="보드"
            >
              보드
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색…"
            className="min-w-[10rem] rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={reload}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600 dark:text-zinc-300"
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={createPrevWeek}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600 dark:text-zinc-300"
            title="지난 주 회의록 열기/생성"
          >
            지난 주
          </button>
          <button
            type="button"
            onClick={createNew}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            이번 주 회의록
          </button>
          <button
            type="button"
            onClick={createNextWeek}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600 dark:text-zinc-300"
          >
            다음 주
          </button>
        </div>
      </div>

      {state.kind === "loading" && (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
          {state.message}
        </div>
      )}

      {state.kind === "ready" && (
        <>
          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white/40 p-8 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                아직 작성된 주간 회의록이 없습니다.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                위의 「이번 주 회의록」 버튼으로 시작하세요.
              </p>
            </div>
          ) : view === "list" ? (
            <ListView items={filteredItems} onOpen={openWeek} />
          ) : view === "card" ? (
            <CardView items={filteredItems} onOpen={openWeek} />
          ) : (
            <BoardView items={filteredItems} onOpen={openWeek} />
          )}
        </>
      )}

      {modalWeek && (
        <WeeklyMeetingMinutesModal
          open
          weekStart={modalWeek}
          initial={currentItem}
          onClose={() => setModalWeek(null)}
          onSaved={() => {
            reload();
          }}
          onDeleted={() => {
            reload();
          }}
        />
      )}
    </div>
  );
}

function ListView({
  items,
  onOpen,
}: {
  items: WeeklyMeetingMinutesItem[];
  onOpen: (ws: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            <th className="px-4 py-2.5">주차</th>
            <th className="px-4 py-2.5">제목</th>
            <th className="px-4 py-2.5">상태</th>
            <th className="px-4 py-2.5">참석</th>
            <th className="px-4 py-2.5">액션</th>
            <th className="px-4 py-2.5 text-right">업데이트</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.week_start}
              className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
              onClick={() => onOpen(it.week_start)}
            >
              <td className="px-4 py-3 align-top">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {formatWeekShort(it.week_start)}
                </div>
                <div className="text-xs text-zinc-500">{weekRangeShort(it.week_start)}</div>
              </td>
              <td className="px-4 py-3 align-top">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {it.title || "(제목 없음)"}
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{summary(it)}</div>
              </td>
              <td className="px-4 py-3 align-top">
                <StatusBadge status={it.status} />
              </td>
              <td className="px-4 py-3 align-top text-xs text-zinc-600 dark:text-zinc-400">
                {it.attendees.length > 0 ? it.attendees.join(", ") : "—"}
              </td>
              <td className="px-4 py-3 align-top text-xs text-zinc-600 dark:text-zinc-400">
                {it.action_items.length === 0
                  ? "—"
                  : `${it.action_items.filter((a) => a.done).length}/${it.action_items.length}`}
              </td>
              <td className="px-4 py-3 text-right align-top text-xs text-zinc-500">
                {it.updated_at ? new Date(it.updated_at).toLocaleString("ko-KR") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardView({
  items,
  onOpen,
}: {
  items: WeeklyMeetingMinutesItem[];
  onOpen: (ws: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <button
          key={it.week_start}
          type="button"
          onClick={() => onOpen(it.week_start)}
          className="group flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {formatWeekShort(it.week_start)} · {weekRangeShort(it.week_start)}
            </span>
            <StatusBadge status={it.status} />
          </div>
          <h3 className="line-clamp-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            {it.title || "(제목 없음)"}
          </h3>
          <p className="line-clamp-3 text-xs text-zinc-600 dark:text-zinc-400">{summary(it)}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
            {it.tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                #{t}
              </span>
            ))}
            {it.attendees.length > 0 && (
              <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                참석 {it.attendees.length}명
              </span>
            )}
            {it.action_items.length > 0 && (
              <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                액션 {it.action_items.filter((a) => a.done).length}/{it.action_items.length}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function BoardView({
  items,
  onOpen,
}: {
  items: WeeklyMeetingMinutesItem[];
  onOpen: (ws: string) => void;
}) {
  const groups: { id: string; label: string; tone: string; items: WeeklyMeetingMinutesItem[] }[] = [
    { id: "draft", label: "작성 중", tone: "border-amber-300", items: [] },
    { id: "scheduled", label: "예정", tone: "border-sky-300", items: [] },
    { id: "in_review", label: "검토 중", tone: "border-purple-300", items: [] },
    { id: "done", label: "완료", tone: "border-emerald-300", items: [] },
  ];
  for (const it of items) {
    const g = groups.find((x) => x.id === it.status) ?? groups[0];
    g.items.push(it);
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {groups.map((g) => (
        <div
          key={g.id}
          className={`flex flex-col gap-2 rounded-xl border-t-4 bg-zinc-50 p-3 dark:bg-zinc-900/40 ${g.tone}`}
        >
          <div className="flex items-center justify-between px-1">
            <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{g.label}</h4>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-400">
              {g.items.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {g.items.length === 0 ? (
              <p className="px-1 py-4 text-center text-[11px] text-zinc-400">비어 있음</p>
            ) : (
              g.items.map((it) => (
                <button
                  key={it.week_start}
                  type="button"
                  onClick={() => onOpen(it.week_start)}
                  className="flex flex-col gap-1 rounded-lg bg-white p-3 text-left shadow-sm transition hover:shadow-md dark:bg-zinc-950"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {formatWeekShort(it.week_start)}
                  </span>
                  <span className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {it.title || "(제목 없음)"}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-zinc-500">{summary(it)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
