"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatSeoulYmd } from "@/lib/sheetDates";
import {
  createDefaultMilestoneBundle,
  createEmptyItem,
  daysBetweenInclusive,
  loadMilestoneBundle,
  milestoneProjectLabel,
  parseYmdToTime,
  saveMilestoneBundle,
  shortKoDate,
  suggestViewRangeFromItems,
  viewTotalDays,
  type MilestoneBundle,
  type MilestoneCardSide,
  type MilestoneItem,
  type MilestoneMarker,
} from "@/lib/milestoneStorage";

const PX_PER_DAY = 6;
/** 타임라인 트랙 높이 · 축 위치(상단 기준 px) */
const MONTH_ROW_H = 36;
const TRACK_H = 240;
const AXIS_Y = 118;
const CONNECTOR = 14;

function sortedItems(items: MilestoneItem[]): MilestoneItem[] {
  return [...items].sort((a, b) => a.order - b.order || a.startYmd.localeCompare(b.startYmd));
}

function dayIndexFromViewStart(viewStartT: number, ymd: string): number {
  const t = parseYmdToTime(ymd);
  if (!Number.isFinite(t)) return 0;
  return Math.round((t - viewStartT) / 86400000);
}

/** 표시 폭: 사용자 지정 기간 ∪ 실제 일정이 튀어나온 구간 */
function timelineWidthDays(bundle: MilestoneBundle, drawn: MilestoneItem[]): number {
  const anchor = parseYmdToTime(bundle.viewStartYmd);
  if (!Number.isFinite(anchor)) return Math.max(1, viewTotalDays(bundle.viewStartYmd, bundle.viewEndYmd));
  const baseDays = viewTotalDays(bundle.viewStartYmd, bundle.viewEndYmd);
  let maxIdx = Math.max(0, baseDays - 1);
  for (const it of drawn) {
    for (const ymd of [it.startYmd, it.endYmd ?? it.startYmd]) {
      const t = parseYmdToTime(ymd);
      if (!Number.isFinite(t)) continue;
      maxIdx = Math.max(maxIdx, Math.round((t - anchor) / 86400000));
    }
  }
  return maxIdx + 1;
}

function monthLabels(minT: number, maxT: number): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [];
  const d = new Date(minT);
  d.setUTCDate(1);
  while (d.getTime() <= maxT) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    out.push({
      t: Date.UTC(y, m - 1, 1),
      label: `${y}.${String(m).padStart(2, "0")}`,
    });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function MarkerGlyph({ marker }: { marker: MilestoneMarker }) {
  if (marker === "flag") {
    return (
      <svg className="h-4 w-4 text-zinc-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M14.4 6H7v12h2v-4.57h4.4l1 2.57h2.2l-1.2-3.08L18.6 9.5 16.6 6h-2.2z" />
      </svg>
    );
  }
  if (marker === "diamond") {
    return <span className="inline-block h-2.5 w-2.5 rotate-45 bg-amber-400 shadow-sm" aria-hidden />;
  }
  return (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-500 bg-white dark:border-zinc-400 dark:bg-zinc-900" aria-hidden />
  );
}

type RangeProps = {
  bundle: MilestoneBundle;
  /** 프로젝트 필터 적용 후 타임라인·간트 공통 목록 */
  visibleItems: MilestoneItem[];
  minT: number;
  totalDays: number;
  todayYmd: string;
};

function MilestoneCardBody({
  it,
  showDateLine,
}: {
  it: MilestoneItem;
  showDateLine: boolean;
}) {
  return (
    <>
      {it.critical ? (
        <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-orange-600 dark:text-orange-400">
          <span aria-hidden>⚠</span> Critical
        </span>
      ) : null}
      {it.shortLabel.trim() ? (
        <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">{it.shortLabel.trim()} 마일스톤</p>
      ) : null}
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{milestoneProjectLabel(it.project)}</p>
      <p className="mt-0.5">{it.title || "(제목 없음)"}</p>
      {showDateLine ? (
        <p className="mt-1 tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
          {shortKoDate(it.startYmd)}
          {it.endYmd ? ` – ${shortKoDate(it.endYmd)}` : ""}
        </p>
      ) : null}
    </>
  );
}

function TimelineSection({ bundle, visibleItems, minT, totalDays, todayYmd }: RangeProps) {
  const widthPx = totalDays * PX_PER_DAY;
  const todayT = parseYmdToTime(todayYmd);
  const rangeEndT = minT + (totalDays - 1) * 86400000;
  const labels = useMemo(() => monthLabels(minT, rangeEndT), [minT, rangeEndT]);

  const leftForYmd = (ymd: string) => dayIndexFromViewStart(minT, ymd) * PX_PER_DAY;

  const items = sortedItems(visibleItems);
  const trackBottomPad = TRACK_H - AXIS_Y + CONNECTOR;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">타임라인</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          표시 기간({shortKoDate(bundle.viewStartYmd)}–{shortKoDate(bundle.viewEndYmd)}) · 현재 탭과 동일한 항목만 표시합니다.
        </p>
      </div>
      <div className="overflow-x-auto overflow-y-visible">
        <div className="relative" style={{ width: `${widthPx}px`, minHeight: MONTH_ROW_H + TRACK_H }}>
          <div
            className="sticky top-0 z-10 flex border-b border-zinc-100 bg-zinc-50/95 text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-400"
            style={{ height: MONTH_ROW_H }}
          >
            {labels.map(({ t, label }) => {
              const left = Math.max(0, Math.round((t - minT) / 86400000) * PX_PER_DAY);
              return (
                <span key={`${label}-${t}`} className="absolute whitespace-nowrap pl-1" style={{ left: `${left}px`, top: 10 }}>
                  {label}
                </span>
              );
            })}
          </div>

          <div className="relative" style={{ height: TRACK_H }}>
            {Number.isFinite(todayT) && todayT >= minT && todayT <= rangeEndT ? (
              <div
                className="pointer-events-none absolute z-[5] w-px bg-red-500/80"
                style={{ left: `${leftForYmd(todayYmd)}px`, top: 0, bottom: 0 }}
                title="오늘"
              />
            ) : null}

            <div
              className="pointer-events-none absolute right-0 left-0 z-[0] bg-zinc-300 dark:bg-zinc-600"
              style={{ top: AXIS_Y, height: 1 }}
            />

            {items.map((it) => {
              if (!it.endYmd) return null;
              const l = leftForYmd(it.startYmd);
              const span = daysBetweenInclusive(it.startYmd, it.endYmd) + 1;
              const w = span * PX_PER_DAY;
              return (
                <div
                  key={`bar-${it.id}`}
                  className={`absolute z-[1] h-3 rounded-sm ${
                    it.critical ? "bg-orange-500/90 dark:bg-orange-600" : "bg-sky-400/80 dark:bg-sky-600"
                  }`}
                  style={{
                    left: `${l}px`,
                    width: `${Math.max(w, PX_PER_DAY)}px`,
                    top: AXIS_Y - 5,
                  }}
                  title={`${it.startYmd}–${it.endYmd}`}
                />
              );
            })}

            {items.map((it) => {
              const x = leftForYmd(it.startYmd);
              const above = it.cardSide === "above";
              const boxCls = it.critical
                ? "border-orange-400 bg-orange-50/90 text-orange-950 shadow-sm dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-100"
                : "border-zinc-200 bg-white text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

              return (
                <div key={it.id}>
                  {above ? (
                    <>
                      <div
                        className={`absolute z-[2] w-[min(18rem,calc(100vw-10rem))] rounded-lg border px-2.5 py-2 text-xs leading-snug ${boxCls}`}
                        style={{
                          left: `${x}px`,
                          transform: "translateX(-50%)",
                          bottom: trackBottomPad,
                        }}
                      >
                        <MilestoneCardBody it={it} showDateLine />
                      </div>
                      <div
                        className="absolute z-[1] w-px -translate-x-1/2 bg-zinc-300 dark:bg-zinc-600"
                        style={{ left: `${x}px`, height: CONNECTOR, bottom: TRACK_H - AXIS_Y }}
                      />
                    </>
                  ) : null}

                  <div
                    className="absolute z-[3] -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}px`, top: AXIS_Y }}
                  >
                    <MarkerGlyph marker={it.marker} />
                  </div>
                  <p
                    className="absolute z-[3] -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400"
                    style={{ left: `${x}px`, top: AXIS_Y + 12 }}
                  >
                    {shortKoDate(it.startYmd)}
                  </p>

                  {!above ? (
                    <>
                      <div
                        className="absolute z-[1] w-px -translate-x-1/2 bg-zinc-300 dark:bg-zinc-600"
                        style={{ left: `${x}px`, height: CONNECTOR, top: AXIS_Y }}
                      />
                      <div
                        className={`absolute z-[2] w-[min(18rem,calc(100vw-10rem))] rounded-lg border px-2.5 py-2 text-xs leading-snug ${boxCls}`}
                        style={{
                          left: `${x}px`,
                          transform: "translateX(-50%)",
                          top: AXIS_Y + CONNECTOR,
                        }}
                      >
                        <MilestoneCardBody it={it} showDateLine={false} />
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function GanttSection({ bundle, visibleItems, minT, totalDays, todayYmd }: RangeProps) {
  const widthPx = totalDays * PX_PER_DAY;
  const items = sortedItems(visibleItems);
  const todayT = parseYmdToTime(todayYmd);
  const rangeEndT = minT + (totalDays - 1) * 86400000;
  const labels = useMemo(() => monthLabels(minT, rangeEndT), [minT, rangeEndT]);

  const leftForYmd = (ymd: string) => dayIndexFromViewStart(minT, ymd) * PX_PER_DAY;

  const rowH = 44;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">간트</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">타임라인과 같은 프로젝트 탭 필터가 적용됩니다.</p>
      </div>
      <div className="flex max-h-[min(70vh,560px)] overflow-auto">
        <div className="sticky left-0 z-20 min-w-[14rem] shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="sticky top-0 z-30 flex h-14 items-end border-b border-zinc-200 bg-zinc-100 px-3 pb-2 text-[10px] font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
            작업 / 마일스톤
          </div>
          {items.map((it, i) => (
            <div
              key={it.id}
              className="flex items-center border-b border-zinc-100 px-3 text-xs dark:border-zinc-800"
              style={{ height: rowH }}
            >
              <span
                className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: i % 3 === 0 ? "#34d399" : i % 3 === 1 ? "#fbbf24" : "#60a5fa",
                }}
                aria-hidden
              />
              <span className="line-clamp-2 min-w-0 font-medium text-zinc-800 dark:text-zinc-100">
                {it.critical ? "⚠ " : ""}
                {it.shortLabel.trim() ? `[${it.shortLabel.trim()}] ` : null}
                {it.title}
                <span className="mt-0.5 block text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                  {milestoneProjectLabel(it.project)}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: `${widthPx}px` }}>
            <div className="sticky top-0 z-10 h-14 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/95">
              {labels.map(({ t, label }) => {
                const left = Math.max(0, Math.round((t - minT) / 86400000) * PX_PER_DAY);
                return (
                  <span
                    key={`g-${label}-${t}`}
                    className="absolute bottom-2 text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
                    style={{ left: `${left + 4}px` }}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
            <div className="relative">
              {Array.from({ length: Math.ceil(totalDays / 7) + 1 }, (_, w) => (
                <div
                  key={`w-${w}`}
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-zinc-100 dark:bg-zinc-800"
                  style={{ left: `${w * 7 * PX_PER_DAY}px` }}
                />
              ))}
              {Number.isFinite(todayT) && todayT >= minT && todayT <= rangeEndT ? (
                <div
                  className="pointer-events-none absolute top-0 z-[5] w-px bg-red-500/70"
                  style={{ left: `${leftForYmd(todayYmd)}px`, height: `${items.length * rowH}px` }}
                />
              ) : null}

              {items.map((it, i) => {
                const colors = ["#34d399", "#fbbf24", "#60a5fa"] as const;
                const c = colors[i % 3];
                const startL = leftForYmd(it.startYmd);
                const endY = it.endYmd ?? it.startYmd;
                const span = Math.max(1, daysBetweenInclusive(it.startYmd, endY) + 1);
                const barW = span * PX_PER_DAY;
                return (
                  <div
                    key={`grow-${it.id}`}
                    className="relative border-b border-zinc-100 dark:border-zinc-800"
                    style={{ height: rowH }}
                  >
                    {it.endYmd ? (
                      <div
                        className="absolute top-1/2 z-[2] h-6 -translate-y-1/2 rounded-md opacity-90 shadow-sm dark:opacity-100"
                        style={{
                          left: `${startL}px`,
                          width: `${barW}px`,
                          background: it.critical ? "#ea580c" : c,
                        }}
                        title={`${it.startYmd} ~ ${it.endYmd}`}
                      />
                    ) : (
                      <div
                        className="absolute top-1/2 z-[3] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-zinc-900"
                        style={{ left: `${startL}px`, background: c }}
                        title={it.startYmd}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const inputCls =
  "min-w-0 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

export function MilestoneClient() {
  const [bundle, setBundle] = useState<MilestoneBundle | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  /** "__all__" = 전체, 그 외 = milestoneProjectLabel 값 */
  const [projectFilter, setProjectFilter] = useState<string>("__all__");
  const todayYmd = formatSeoulYmd(new Date());

  useEffect(() => {
    const loaded = loadMilestoneBundle();
    setBundle(loaded ?? createDefaultMilestoneBundle());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !bundle) return;
    saveMilestoneBundle(bundle);
  }, [bundle, hydrated]);

  const derived = useMemo(() => {
    if (!bundle) return null;
    const drawnAll = sortedItems(bundle.items).filter((x) => x.title.trim());
    const projectKeys = [...new Set(drawnAll.map((it) => milestoneProjectLabel(it.project)))].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
    const visibleItems =
      projectFilter === "__all__"
        ? drawnAll
        : drawnAll.filter((it) => milestoneProjectLabel(it.project) === projectFilter);
    const vs = parseYmdToTime(bundle.viewStartYmd);
    const ve = parseYmdToTime(bundle.viewEndYmd);
    if (!Number.isFinite(vs) || !Number.isFinite(ve)) return null;
    const minT = Math.min(vs, ve);
    const displayBundle: MilestoneBundle =
      vs <= ve
        ? bundle
        : {
            ...bundle,
            viewStartYmd: bundle.viewEndYmd,
            viewEndYmd: bundle.viewStartYmd,
          };
    const totalDays = timelineWidthDays(displayBundle, visibleItems);
    const empty = drawnAll.length === 0;
    const filteredEmpty = visibleItems.length === 0 && drawnAll.length > 0;
    return {
      minT,
      totalDays,
      empty,
      filteredEmpty,
      displayBundle,
      visibleItems,
      projectKeys,
    };
  }, [bundle, projectFilter]);

  useEffect(() => {
    if (projectFilter === "__all__" || !bundle) return;
    const drawnAll = sortedItems(bundle.items).filter((x) => x.title.trim());
    const keys = [...new Set(drawnAll.map((it) => milestoneProjectLabel(it.project)))];
    if (!keys.includes(projectFilter)) setProjectFilter("__all__");
  }, [bundle, projectFilter]);

  const updateItem = useCallback((id: string, patch: Partial<MilestoneItem>) => {
    setBundle((b) => {
      if (!b) return b;
      return { ...b, items: b.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setBundle((b) => {
      if (!b || b.items.length <= 1) return b;
      const next = b.items.filter((x) => x.id !== id).map((x, i) => ({ ...x, order: i }));
      return { ...b, items: next };
    });
  }, []);

  const addItem = useCallback(() => {
    setBundle((b) => {
      if (!b) return b;
      const maxO = b.items.reduce((acc, x) => Math.max(acc, x.order), -1);
      const row = createEmptyItem(maxO + 1);
      if (projectFilter !== "__all__") row.project = projectFilter;
      return { ...b, items: [...b.items, row] };
    });
  }, [projectFilter]);

  const resetDemo = useCallback(() => {
    if (!window.confirm("저장된 마일스톤을 예시 템플릿으로 덮어씁니다. 계속할까요?")) return;
    setProjectFilter("__all__");
    setBundle(createDefaultMilestoneBundle());
  }, []);

  const snapViewToItems = useCallback(() => {
    setBundle((b) => {
      if (!b) return b;
      const sug = suggestViewRangeFromItems(b.items);
      if (!sug) return b;
      return { ...b, viewStartYmd: sug.viewStartYmd, viewEndYmd: sug.viewEndYmd };
    });
  }, []);

  if (!bundle || !derived) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>;
  }

  const { minT, totalDays, empty, filteredEmpty, displayBundle, visibleItems, projectKeys } = derived;
  const rangeProps: RangeProps = {
    bundle: displayBundle,
    visibleItems,
    minT,
    totalDays,
    todayYmd,
  };

  const tabBtn = (active: boolean) =>
    `rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
      active
        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="space-y-4">
      {empty ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          제목이 있는 마일스톤이 없습니다. 「목록 편집」에서 행을 추가하거나 「예시로 초기화」를 눌러 보세요.
        </p>
      ) : null}

      {filteredEmpty ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
          이 프로젝트에 해당하는 마일스톤이 없습니다. 「전체」로 바꾸거나 목록에서 프로젝트명을 맞춰 주세요.
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-zinc-100 pb-2 dark:border-zinc-800">
          <span className="shrink-0 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">프로젝트</span>
          <div role="tablist" aria-label="프로젝트 필터" className="flex min-w-0 flex-1 flex-wrap gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={projectFilter === "__all__"}
              className={tabBtn(projectFilter === "__all__")}
              onClick={() => setProjectFilter("__all__")}
            >
              전체
            </button>
            {projectKeys.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={projectFilter === k}
                className={tabBtn(projectFilter === k)}
                onClick={() => setProjectFilter(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 pt-2">
          <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="shrink-0 whitespace-nowrap">보드</span>
            <input
              type="text"
              value={bundle.title}
              onChange={(e) => setBundle((b) => (b ? { ...b, title: e.target.value } : b))}
              className={`${inputCls} min-w-0 flex-1 py-1`}
            />
          </label>
          <span className="hidden h-4 w-px shrink-0 bg-zinc-200 sm:block dark:bg-zinc-700" aria-hidden />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">기간</span>
            <input
              type="date"
              value={bundle.viewStartYmd}
              onChange={(e) => {
                const v = e.target.value;
                setBundle((b) => {
                  if (!b) return b;
                  const ve = parseYmdToTime(b.viewEndYmd);
                  const vs = parseYmdToTime(v);
                  if (Number.isFinite(ve) && Number.isFinite(vs) && ve < vs) {
                    return { ...b, viewStartYmd: v, viewEndYmd: b.viewStartYmd };
                  }
                  return { ...b, viewStartYmd: v };
                });
              }}
              className={`${inputCls} py-1`}
            />
            <span className="text-[11px] text-zinc-400">~</span>
            <input
              type="date"
              value={bundle.viewEndYmd}
              onChange={(e) => {
                const v = e.target.value;
                setBundle((b) => {
                  if (!b) return b;
                  const vs = parseYmdToTime(b.viewStartYmd);
                  const ve = parseYmdToTime(v);
                  if (Number.isFinite(vs) && Number.isFinite(ve) && ve < vs) {
                    return { ...b, viewEndYmd: v, viewStartYmd: b.viewEndYmd };
                  }
                  return { ...b, viewEndYmd: v };
                });
              }}
              className={`${inputCls} py-1`}
            />
            <button
              type="button"
              onClick={snapViewToItems}
              title="일정에 맞춰 표시 기간을 자동 설정합니다"
              className="shrink-0 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              기간 맞춤
            </button>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:ml-auto">
            <button
              type="button"
              onClick={() => setEditorOpen((o) => !o)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-zinc-600 dark:bg-zinc-900"
            >
              {editorOpen ? "편집 닫기" : "목록 편집"}
            </button>
            <button
              type="button"
              onClick={resetDemo}
              className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
            >
              예시 초기화
            </button>
          </div>
        </div>
      </div>

      <TimelineSection {...rangeProps} />
      <GanttSection {...rangeProps} />

      {editorOpen ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">마일스톤 행 편집</h3>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            코드(A,B…) · 프로젝트는 설정 칸 맨 위 「프로젝트」 탭으로 묶어서 봅니다. 비운 프로젝트는 「기본」으로 묶입니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[62rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-[10px] uppercase text-zinc-500 dark:border-zinc-700">
                  <th className="py-2 pr-2">코드</th>
                  <th className="py-2 pr-2">제목</th>
                  <th className="py-2 pr-2">프로젝트</th>
                  <th className="py-2 pr-2">시작</th>
                  <th className="py-2 pr-2">종료</th>
                  <th className="py-2 pr-2">카드</th>
                  <th className="py-2 pr-2">그룹</th>
                  <th className="py-2 pr-2">Crit</th>
                  <th className="py-2 pr-2">마커</th>
                  <th className="py-2"> </th>
                </tr>
              </thead>
              <tbody>
                {sortedItems(bundle.items).map((it) => (
                  <tr key={it.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="text"
                        value={it.shortLabel}
                        onChange={(e) => updateItem(it.id, { shortLabel: e.target.value })}
                        className={`${inputCls} w-14`}
                        placeholder="A"
                        maxLength={8}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <textarea
                        value={it.title}
                        onChange={(e) => updateItem(it.id, { title: e.target.value })}
                        className={`${inputCls} w-full min-h-[3rem]`}
                        rows={2}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="text"
                        value={it.project}
                        onChange={(e) => updateItem(it.id, { project: e.target.value })}
                        className={`${inputCls} w-28`}
                        placeholder="프로젝트 A"
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="date"
                        value={it.startYmd}
                        onChange={(e) => updateItem(it.id, { startYmd: e.target.value })}
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="date"
                        value={it.endYmd ?? ""}
                        onChange={(e) => updateItem(it.id, { endYmd: e.target.value.trim() || undefined })}
                        className={inputCls}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <select
                        value={it.cardSide}
                        onChange={(e) => updateItem(it.id, { cardSide: e.target.value as MilestoneCardSide })}
                        className={inputCls}
                      >
                        <option value="above">축 위</option>
                        <option value="below">축 아래</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="text"
                        value={it.group}
                        onChange={(e) => updateItem(it.id, { group: e.target.value })}
                        className={`${inputCls} w-24`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <input
                        type="checkbox"
                        checked={it.critical}
                        onChange={(e) => updateItem(it.id, { critical: e.target.checked })}
                        className="mt-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <select
                        value={it.marker}
                        onChange={(e) => updateItem(it.id, { marker: e.target.value as MilestoneMarker })}
                        className={inputCls}
                      >
                        <option value="flag">깃발</option>
                        <option value="circle">원</option>
                        <option value="diamond">다이아</option>
                      </select>
                    </td>
                    <td className="py-1.5 align-top">
                      <button
                        type="button"
                        className="text-red-600 underline dark:text-red-400"
                        onClick={() => removeItem(it.id)}
                        disabled={bundle.items.length <= 1}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-3 rounded-lg border border-dashed border-zinc-400 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-500 dark:text-zinc-300"
          >
            + 행 추가
          </button>
        </section>
      ) : null}
    </div>
  );
}
