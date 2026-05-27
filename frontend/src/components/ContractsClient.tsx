"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FilterTagsFlow } from "@/components/FilterTagsFlow";
import { TableColgroup } from "@/components/TableColgroup";
import { TableColumnHeader, tableDataCellClass } from "@/components/TableColumnHeader";
import { useTableColumnWidths } from "@/hooks/useTableColumnWidths";
import { TableListControls } from "@/components/TableListControls";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useTableColumnVisibility } from "@/hooks/useTableColumnVisibility";
import { useTableListDisplay } from "@/hooks/useTableListDisplay";
import { TABLE_LIST_DATE_FIELDS } from "@/lib/tableListView";
import { PlatformRowEditModal, type PlatformRow } from "@/components/PlatformRowEditModal";
import {
  PlatformRowInlineCell,
  boolToCell,
  isPlatformBoolValue,
} from "@/components/PlatformRowInlineCell";
import { getApiBaseUrl } from "@/lib/apiBase";
import { ensureMajorCategoryInColumnOrder } from "@/lib/majorCategoryColumn";
import {
  UNDO_TOAST_MS,
  isColumnHideUndo,
  pushUndoEntry,
  undoToastDescription,
  type FieldUndoEntry,
  type TableUndoEntry,
} from "@/lib/tableListUndo";

const INTERNAL_KEYS = new Set(["id", "sheet_row"]);
const COMPLETE_FIELD = "완료";
const READONLY_FIELDS = new Set(["마지막업데이트날짜"]);
const COLUMN_ORDER_STORAGE_KEY = "contracts_col_order_v1";

const CONTRACT_TABS = ["계약완료", "계약진행중", "계약미정", "계약불가", "추후접촉"] as const;
type ContractTab = (typeof CONTRACT_TABS)[number];

const CHECKBOX_FIELD_CANDIDATES = new Set([
  "지원사업",
  "일반계약",
  "불가",
  "예정",
  "진행중",
  "완료",
  "계약",
  "미팅",
  "성인웹툰",
  "성인웹툰(구 일반계약)",
]);

function colLettersToZeroBased(letters: string): number {
  const s = letters.toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 64;
    if (c < 1 || c > 26) return -1;
    n = n * 26 + c;
  }
  return n - 1;
}

function orderedHeaderKeys(row: PlatformRow): string[] {
  return Object.keys(row).filter((k) => !INTERNAL_KEYS.has(k));
}

function headerKeyAtLetter(sample: PlatformRow, letter: string): string {
  const hdrs = orderedHeaderKeys(sample);
  const idx = colLettersToZeroBased(letter);
  if (idx < 0 || idx >= hdrs.length) return "";
  return hdrs[idx] ?? "";
}

function fieldKey(sample: PlatformRow, preferred: string, letter: string): string {
  if (preferred in sample) return preferred;
  return headerKeyAtLetter(sample, letter);
}

function cell(row: PlatformRow, key: string): string {
  return key ? String(row[key] ?? "").trim() : "";
}

function defaultDataColumnOrder(row: PlatformRow): string[] {
  return ensureMajorCategoryInColumnOrder(
    orderedHeaderKeys(row).filter((k) => k !== COMPLETE_FIELD),
  );
}

function loadColumnOrder(defaultKeys: string[]): string[] {
  if (typeof window === "undefined") return defaultKeys;
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return defaultKeys;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultKeys;
    const allowed = new Set(defaultKeys);
    const out: string[] = [];
    for (const k of parsed) {
      if (typeof k === "string" && allowed.has(k) && !out.includes(k)) out.push(k);
    }
    for (const k of defaultKeys) {
      if (!out.includes(k)) out.push(k);
    }
    return out;
  } catch {
    return defaultKeys;
  }
}

function loadHiddenSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) return new Set<string>(JSON.parse(saved) as string[]);
  } catch { /* ignore */ }
  return new Set<string>();
}

function saveHiddenSet(storageKey: string, next: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...next]));
  } catch { /* ignore */ }
}

function fieldIsBoolean(field: string, items: PlatformRow[]): boolean {
  if (CHECKBOX_FIELD_CANDIDATES.has(field)) return true;
  const samples = items
    .map((it) => String(it[field] ?? "").trim())
    .filter((v) => v !== "");
  if (samples.length === 0) return false;
  return samples.every((v) => isPlatformBoolValue(v));
}

function rowTitle(item: PlatformRow): string {
  return (item["플랫폼명"] ?? item["회사명"] ?? "").trim() || "(이름 없음)";
}

function isDoneValue(raw: string | undefined): boolean {
  return isPlatformBoolValue(raw);
}

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { detail?: string };
      throw new Error(j.detail ?? text);
    } catch {
      throw new Error(text);
    }
  }
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

export function ContractsClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<ContractTab>(CONTRACT_TABS[0]);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [patchingCell, setPatchingCell] = useState<string | null>(null);
  const [togglingCell, setTogglingCell] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<TableUndoEntry | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const undoStackRef = useRef<TableUndoEntry[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editItem, setEditItem] = useState<PlatformRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [hiddenFilters, setHiddenFilters] = useState<Record<string, Set<string>>>(() => ({
    계약: loadHiddenSet("contracts.hidden.계약"),
    회사명: loadHiddenSet("contracts.hidden.회사명"),
    플랫폼명: loadHiddenSet("contracts.hidden.플랫폼명"),
  }));

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = (await apiFetch("/platform-rows")) as PlatformRow[] | null;
      const list = Array.isArray(items) ? items : [];
      setState({ kind: "ready", items: list });
      undoStackRef.current = [];
      setUndoCount(0);
      setUndoToast(null);
      if (list.length > 0) {
        const defaults = defaultDataColumnOrder(list[0]);
        setColumnOrder(loadColumnOrder(defaults));
        const ck = fieldKey(list[0], "계약", "K");
        setSortKey(ck || defaults[0] || "");
      } else {
        setColumnOrder([]);
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [refreshKey, load]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const sample = state.kind === "ready" && state.items.length > 0 ? state.items[0] : null;

  const fieldKeys = useMemo(() => {
    if (!sample) {
      return { contract: "", company: "", platform: "" };
    }
    return {
      contract: fieldKey(sample, "계약", "K"),
      company: fieldKey(sample, "회사명", "B"),
      platform: fieldKey(sample, "플랫폼명", "R"),
    };
  }, [sample]);

  const hasCompleteColumn = useMemo(() => {
    if (state.kind !== "ready" || state.items.length === 0) return false;
    return COMPLETE_FIELD in state.items[0];
  }, [state]);

  const booleanFields = useMemo(() => {
    if (state.kind !== "ready") return new Set<string>();
    const set = new Set<string>();
    const allCols = hasCompleteColumn ? [COMPLETE_FIELD, ...columnOrder] : columnOrder;
    for (const key of allCols) {
      if (fieldIsBoolean(key, state.items)) set.add(key);
    }
    return set;
  }, [state, columnOrder, hasCompleteColumn]);

  const colVis = useTableColumnVisibility("contracts", columnOrder);
  const colLabels = useColumnLabels("contracts");

  const syncUndoCount = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
  }, []);

  const showUndoToast = useCallback((entry: TableUndoEntry) => {
    undoStackRef.current = pushUndoEntry(undoStackRef.current, entry);
    syncUndoCount();
    setUndoToast(entry);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoToast(null), UNDO_TOAST_MS);
  }, [syncUndoCount]);

  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
  }, []);

  const hideColumn = useCallback(
    (field: string) => {
      colVis.setColumnVisible(field, false);
      showUndoToast({
        kind: "column-hide",
        field,
        label: colLabels.getLabel(field),
      });
    },
    [colVis, colLabels, showUndoToast],
  );

  const setFieldInState = useCallback((id: string, field: string, value: string) => {
    setState((s) => {
      if (s.kind !== "ready") return s;
      return {
        kind: "ready",
        items: s.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
      };
    });
  }, []);

  const persistColumnOrder = useCallback((next: string[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetColumnOrder = useCallback(() => {
    if (!sample) return;
    const next = defaultDataColumnOrder(sample);
    persistColumnOrder(next);
    setColumnOrder(next);
  }, [persistColumnOrder, sample]);

  const handleColDrop = useCallback((targetField: string) => {
    if (!dragCol || dragCol === targetField) {
      setDragCol(null);
      return;
    }
    setColumnOrder((prev) => {
      const from = prev.indexOf(dragCol);
      const to = prev.indexOf(targetField);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragCol);
      persistColumnOrder(next);
      return next;
    });
    setDragCol(null);
  }, [dragCol, persistColumnOrder]);

  const patchField = useCallback(
    async (rowId: string, field: string, newValue: string, opts?: { withUndo?: boolean }) => {
      if (state.kind !== "ready") return;
      const item = state.items.find((it) => it.id === rowId);
      if (!item) return;
      const prev = item[field] ?? "";
      if (prev === newValue) return;
      const cellKey = `${rowId}:${field}`;
      if (booleanFields.has(field)) setTogglingCell(cellKey);
      else setPatchingCell(cellKey);
      setActionError(null);
      setFieldInState(rowId, field, newValue);
      try {
        await apiFetch("/platform-rows/update", { id: rowId, [field]: newValue });
        if (opts?.withUndo) {
          showUndoToast({
            kind: "field",
            id: rowId,
            field,
            title: rowTitle(item),
            previousValue: prev,
          });
        }
      } catch (e) {
        setFieldInState(rowId, field, prev);
        setActionError(e instanceof Error ? e.message : "저장 실패");
        throw e;
      } finally {
        setPatchingCell(null);
        setTogglingCell(null);
      }
    },
    [booleanFields, setFieldInState, showUndoToast, state],
  );

  const handleInlineSave = useCallback(
    async (rowId: string, field: string, newValue: string) => {
      const withUndo = booleanFields.has(field);
      if (withUndo) dismissUndoToast();
      try {
        await patchField(rowId, field, newValue, { withUndo });
      } catch {
        /* actionError set */
      }
    },
    [booleanFields, dismissUndoToast, patchField],
  );

  const handleToggleComplete = async (item: PlatformRow, checked: boolean) => {
    const prevDone = item[COMPLETE_FIELD] ?? "";
    const nextDone = boolToCell(checked);
    if (prevDone === nextDone) return;
    dismissUndoToast();
    try {
      await patchField(item.id, COMPLETE_FIELD, nextDone, { withUndo: true });
    } catch {
      /* reverted in patchField */
    }
  };

  const performUndo = useCallback(
    async (entry?: TableUndoEntry) => {
      const target = entry ?? undoStackRef.current[0];
      if (!target || undoing) return;
      setUndoing(true);
      setActionError(null);
      dismissUndoToast();
      if (isColumnHideUndo(target)) {
        colVis.setColumnVisible(target.field, true);
        undoStackRef.current = undoStackRef.current.filter(
          (e) => !isColumnHideUndo(e) || e.field !== target.field,
        );
        syncUndoCount();
        setUndoing(false);
        return;
      }
      const fieldTarget = target as FieldUndoEntry;
      setFieldInState(fieldTarget.id, fieldTarget.field, fieldTarget.previousValue);
      setTogglingCell(`${fieldTarget.id}:${fieldTarget.field}`);
      try {
        await apiFetch("/platform-rows/update", {
          id: fieldTarget.id,
          [fieldTarget.field]: fieldTarget.previousValue,
        });
        undoStackRef.current = undoStackRef.current.filter(
          (e) => e.kind !== "field" || !(e.id === fieldTarget.id && e.field === fieldTarget.field),
        );
        syncUndoCount();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "되돌리기 실패");
        showUndoToast(fieldTarget);
      } finally {
        setTogglingCell(null);
        setUndoing(false);
      }
    },
    [colVis, dismissUndoToast, setFieldInState, showUndoToast, syncUndoCount, undoing],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (undoStackRef.current.length === 0 && !undoToast) return;
      e.preventDefault();
      void performUndo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [performUndo, undoToast]);

  const filterOptions = useMemo(() => {
    if (state.kind !== "ready") {
      return { 계약: [] as string[], 회사명: [] as string[], 플랫폼명: [] as string[] };
    }
    const sortedKeys = (vals: string[]) => {
      const keys = [...new Set(vals.map((v) => v.trim()))];
      keys.sort((a, b) => {
        const ae = a === "", be = b === "";
        if (ae && !be) return 1;
        if (!ae && be) return -1;
        return a.localeCompare(b, "ko");
      });
      return keys;
    };
    return {
      계약: fieldKeys.contract
        ? sortedKeys(state.items.map((it) => cell(it, fieldKeys.contract)))
        : [],
      회사명: fieldKeys.company
        ? sortedKeys(state.items.map((it) => cell(it, fieldKeys.company)))
        : [],
      플랫폼명: fieldKeys.platform
        ? sortedKeys(state.items.map((it) => cell(it, fieldKeys.platform)))
        : [],
    };
  }, [state, fieldKeys]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const toggleFilter = (title: string, key: string) => {
    const storageKey = `contracts.hidden.${title}`;
    setHiddenFilters((prev) => {
      const nextSet = new Set(prev[title]);
      if (nextSet.has(key)) nextSet.delete(key);
      else nextSet.add(key);
      saveHiddenSet(storageKey, nextSet);
      return { ...prev, [title]: nextSet };
    });
  };

  const setFilterHiddenAll = (title: string, hidden: Set<string>) => {
    saveHiddenSet(`contracts.hidden.${title}`, hidden);
    setHiddenFilters((prev) => ({ ...prev, [title]: hidden }));
  };

  const tabFiltered = useMemo(() => {
    if (state.kind !== "ready" || !fieldKeys.contract) return [];
    return state.items.filter((row) => cell(row, fieldKeys.contract) === activeTab);
  }, [state, activeTab, fieldKeys.contract]);

  const visible = useMemo(() => {
    let items = tabFiltered;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      items = items.filter((it) =>
        columnOrder.some((key) => (it[key] ?? "").toLowerCase().includes(q)) ||
        (hasCompleteColumn && (it[COMPLETE_FIELD] ?? "").toLowerCase().includes(q)),
      );
    }
    const filterMap: { title: string; key: string }[] = [
      { title: "계약", key: fieldKeys.contract },
      { title: "회사명", key: fieldKeys.company },
      { title: "플랫폼명", key: fieldKeys.platform },
    ];
    for (const { title, key } of filterMap) {
      if (!key) continue;
      const hidden = hiddenFilters[title];
      if (hidden.size > 0) {
        items = items.filter((it) => !hidden.has(cell(it, key)));
      }
    }
    const sk = sortKey || columnOrder[0] || "";
    return [...items].sort((a, b) => {
      const va = sk ? cell(a, sk) : "";
      const vb = sk ? cell(b, sk) : "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [
    tabFiltered,
    filterText,
    columnOrder,
    hasCompleteColumn,
    hiddenFilters,
    fieldKeys,
    sortKey,
    sortDir,
  ]);

  const list = useTableListDisplay("contracts", visible);
  const colWidths = useTableColumnWidths("contracts", colVis.visibleKeys, colLabels.getLabel);
  const contractLeadingActions = hasCompleteColumn ? 2 : 1;

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thSort =
    "cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
  const thAction =
    "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400";

  const handleDelete = async (row: PlatformRow) => {
    const name = rowTitle(row);
    if (!window.confirm(`이 행을 삭제할까요? (${name})`)) return;
    try {
      await apiFetch("/platform-rows/delete", { id: row.id });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const isCellBusy = (rowId: string, field: string) =>
    patchingCell === `${rowId}:${field}` || togglingCell === `${rowId}:${field}`;

  const tableColSpan = 2 + (hasCompleteColumn ? 1 : 0) + colVis.visibleKeys.length + 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="전체 열 검색"
          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:min-w-[16rem]"
        />
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={resetColumnOrder}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
        >
          열 순서 초기화
        </button>
        {undoCount > 0 ? (
          <button
            type="button"
            onClick={() => void performUndo()}
            disabled={undoing}
            title="Ctrl+Z"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          >
            {undoing ? "되돌리는 중…" : "되돌리기 (Ctrl+Z)"}
          </button>
        ) : null}
      </div>

      {state.kind === "ready" && sample && (
        <FilterTagsFlow
          listLabel={listLabel}
          groups={[
            {
              title: "계약",
              keys: filterOptions.계약,
              hidden: hiddenFilters.계약,
              onToggle: (key) => toggleFilter("계약", key),
              onShowAll: () => setFilterHiddenAll("계약", new Set()),
              onHideAll: () => setFilterHiddenAll("계약", new Set(filterOptions.계약)),
            },
            {
              title: "회사명",
              keys: filterOptions.회사명,
              hidden: hiddenFilters.회사명,
              onToggle: (key) => toggleFilter("회사명", key),
              onShowAll: () => setFilterHiddenAll("회사명", new Set()),
              onHideAll: () => setFilterHiddenAll("회사명", new Set(filterOptions.회사명)),
            },
            {
              title: "플랫폼명",
              keys: filterOptions.플랫폼명,
              hidden: hiddenFilters.플랫폼명,
              onToggle: (key) => toggleFilter("플랫폼명", key),
              onShowAll: () => setFilterHiddenAll("플랫폼명", new Set()),
              onHideAll: () => setFilterHiddenAll("플랫폼명", new Set(filterOptions.플랫폼명)),
            },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-px dark:border-zinc-700">
        {CONTRACT_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? "rounded-t-md border border-b-0 border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
                : "rounded-t-md border border-transparent px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {actionError && !editItem && (
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
      )}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          불러오는 중…
        </div>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {state.message}
        </div>
      )}

      {state.kind === "ready" && !sample && (
        <p className="text-sm text-zinc-500">표시할 계약 행이 없습니다.</p>
      )}

      {state.kind === "ready" && sample && columnOrder.length > 0 && (
        <>
        <TableListControls
          pageSize={list.pageSize}
          onPageSizeChange={list.setPageSize}
          showAll={list.showAll}
          onShowAll={() => list.setShowAll(true)}
          totalFiltered={list.totalFiltered}
          hiddenCount={list.hiddenCount}
          displayedCount={list.displayed.length}
          dateFilter={list.dateFilter}
          onDatePresetChange={list.setDatePreset}
          onCustomFromChange={list.setCustomFrom}
          onCustomToChange={list.setCustomTo}
          dateExcludedCount={list.dateExcludedCount}
          dateFieldHint={TABLE_LIST_DATE_FIELDS.contracts.join(" · ")}
          columnVisibility={{
            allKeys: columnOrder,
            hiddenColumns: colVis.hiddenColumns,
            onSetVisible: colVis.setColumnVisible,
            onShowAllColumns: colVis.showAllColumns,
            columnLabel: colLabels.getLabel,
          }}
        />
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table
            className="w-full text-xs"
            style={{
              ...colWidths.tableStyle,
              minWidth: colWidths.tableMinWidth(contractLeadingActions, 1),
            }}
          >
            <TableColgroup
              leadingActionCols={contractLeadingActions}
              trailingActionCols={1}
              dataKeys={colVis.visibleKeys}
              getWidth={colWidths.getWidth}
              actionWidthPx={colWidths.actionWidth}
            />
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
                {hasCompleteColumn ? (
                  <th className={thAction}>완료</th>
                ) : null}
                {colVis.visibleKeys.map((field) => (
                  <TableColumnHeader
                    key={field}
                    field={field}
                    label={colLabels.getLabel(field)}
                    widthPx={colWidths.getWidth(field)}
                    onResizeStart={(x) => colWidths.startResize(field, x)}
                    dragActive={dragCol === field}
                    sortActive={sortKey === field}
                    sortDir={sortDir}
                    onDragStart={() => setDragCol(field)}
                    onDragEnd={() => setDragCol(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleColDrop(field)}
                    onSort={() => handleSort(field)}
                    onHide={() => hideColumn(field)}
                    onEdit={() => colLabels.editLabel(field)}
                    onDelete={() => {
                      const name = colLabels.getLabel(field);
                      if (
                        window.confirm(
                          `「${name}」 열을 목록에서 숨길까요? 속성 패널에서 다시 켤 수 있습니다.`,
                        )
                      ) {
                        hideColumn(field);
                      }
                    }}
                  />
                ))}
                <th className={thAction}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {list.totalFiltered === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-3 py-8 text-center text-zinc-500">
                    {filterText ||
                    hiddenFilters.계약.size > 0 ||
                    hiddenFilters.회사명.size > 0 ||
                    hiddenFilters.플랫폼명.size > 0 ||
                    list.dateFilter.preset !== "all"
                      ? "조건에 맞는 항목이 없습니다"
                      : "해당 상태의 항목이 없습니다"}
                  </td>
                </tr>
              ) : (
                list.displayed.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-zinc-100 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-900/40 ${
                      hasCompleteColumn && isDoneValue(item[COMPLETE_FIELD]) ? "opacity-50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => setEditItem(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        수정
                      </button>
                    </td>
                    {hasCompleteColumn ? (
                      <td className="px-2 py-1.5 text-center align-top">
                        <input
                          type="checkbox"
                          checked={isDoneValue(item[COMPLETE_FIELD])}
                          disabled={isCellBusy(item.id, COMPLETE_FIELD)}
                          onChange={(e) => void handleToggleComplete(item, e.target.checked)}
                          aria-label={`${rowTitle(item)} 완료`}
                          className="h-4 w-4 accent-emerald-600 disabled:opacity-50 dark:accent-emerald-400"
                        />
                      </td>
                    ) : null}
                    {colVis.visibleKeys.map((field) => {
                      const isBool = booleanFields.has(field);
                      const readonly = READONLY_FIELDS.has(field);
                      const wide =
                        field.includes("비고") ||
                        field.includes("메모") ||
                        field.includes("링크") ||
                        field.includes("FTP");
                      return (
                        <td
                          key={field}
                          className={`${tableDataCellClass} ${isBool ? "text-center" : ""}`}
                        >
                          <PlatformRowInlineCell
                            value={item[field] ?? ""}
                            field={field}
                            rowId={item.id}
                            boolean={isBool}
                            wide={wide}
                            muted={field.includes("일") && field.includes("날짜")}
                            tabular={isBool}
                            disabled={readonly || isCellBusy(item.id, field)}
                            onSave={handleInlineSave}
                          />
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      <PlatformRowEditModal
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />

      {undoToast ? (
        <div
          className="fixed bottom-4 left-1/2 z-50 flex max-w-lg -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          role="status"
        >
          <span className="text-zinc-700 dark:text-zinc-200">
            {undoToastDescription(undoToast)}
          </span>
          <button
            type="button"
            onClick={() => void performUndo(undoToast)}
            disabled={undoing}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={dismissUndoToast}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            닫기
          </button>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Ctrl+Z</span>
        </div>
      ) : null}
    </div>
  );
}
