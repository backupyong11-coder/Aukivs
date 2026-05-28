"use client";

export type WeeklyAgendaRangeTab = {
  id: string;
  label: string;
  order: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export type WeeklyAgendaRangeWorkbook = {
  version: 1;
  activeId: string;
  tabs: WeeklyAgendaRangeTab[];
};

const STORAGE_KEY = "worksheet_weekly_agenda_ranges_v1";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayYmdSeoul(): string {
  const seoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = String(seoul.getMonth() + 1).padStart(2, "0");
  const d = String(seoul.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function createDefaultRangesWorkbook(): WeeklyAgendaRangeWorkbook {
  const t = todayYmdSeoul();
  const tab: WeeklyAgendaRangeTab = { id: newId(), label: "이번 주", order: 0, from: t, to: t };
  return { version: 1, activeId: tab.id, tabs: [tab] };
}

export function loadWeeklyAgendaRangesWorkbook(): WeeklyAgendaRangeWorkbook {
  if (typeof window === "undefined") return createDefaultRangesWorkbook();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultRangesWorkbook();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return createDefaultRangesWorkbook();
    const o = parsed as Record<string, unknown>;
    if (o.version !== 1 || !Array.isArray(o.tabs) || typeof o.activeId !== "string") return createDefaultRangesWorkbook();
    const tabs: WeeklyAgendaRangeTab[] = [];
    for (const it of o.tabs) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.label !== "string" || typeof r.order !== "number") continue;
      tabs.push({
        id: r.id,
        label: r.label,
        order: r.order,
        from: typeof r.from === "string" ? r.from : "",
        to: typeof r.to === "string" ? r.to : "",
      });
    }
    if (tabs.length === 0) return createDefaultRangesWorkbook();
    const active = tabs.some((t) => t.id === o.activeId) ? o.activeId : tabs[0].id;
    return { version: 1, activeId: active, tabs };
  } catch {
    return createDefaultRangesWorkbook();
  }
}

export function saveWeeklyAgendaRangesWorkbook(wb: WeeklyAgendaRangeWorkbook): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wb));
  } catch {
    /* ignore */
  }
}

export function addRangeTab(wb: WeeklyAgendaRangeWorkbook, label: string): WeeklyAgendaRangeWorkbook {
  const maxOrder = wb.tabs.reduce((acc, t) => Math.max(acc, t.order), -1);
  const t = todayYmdSeoul();
  const tab: WeeklyAgendaRangeTab = { id: newId(), label: label.trim() || "새 기간", order: maxOrder + 1, from: t, to: t };
  const next = { ...wb, tabs: [...wb.tabs, tab], activeId: tab.id };
  saveWeeklyAgendaRangesWorkbook(next);
  return next;
}

export function patchActiveRange(
  wb: WeeklyAgendaRangeWorkbook,
  patch: Partial<Pick<WeeklyAgendaRangeTab, "label" | "from" | "to">>,
): WeeklyAgendaRangeWorkbook {
  const next = {
    ...wb,
    tabs: wb.tabs.map((t) => (t.id === wb.activeId ? { ...t, ...patch } : t)),
  };
  saveWeeklyAgendaRangesWorkbook(next);
  return next;
}

