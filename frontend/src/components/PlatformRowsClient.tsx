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
import { TableListFooter } from "@/components/TableListFooter";
import { useTableColumnWidths } from "@/hooks/useTableColumnWidths";
import { TableListControls } from "@/components/TableListControls";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useTableColumnVisibility } from "@/hooks/useTableColumnVisibility";
import { useTableListDisplay } from "@/hooks/useTableListDisplay";
import { TABLE_LIST_DATE_FIELDS } from "@/lib/tableListView";
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

type PlatformRow = Record<string, string> & { id: string; sheet_row: string };

const INTERNAL_KEYS = new Set(["id", "sheet_row"]);
const READONLY_FIELDS = new Set(["마지막업데이트날짜"]);
const FILTER_TAG_FIELDS = ["발표일", "분류", "플랫폼명"] as const;
type FilterTagField = (typeof FILTER_TAG_FIELDS)[number];

const CHECKBOX_FIELD_CANDIDATES = new Set([
  "지원사업",
  "일반계약",
  "불가",
  "예정",
  "진행중",
  "완료",
  "계약",
  "미팅",
  "보류",
  "성인웹툰",
  "성인웹툰(구 일반계약)",
]);

const ON_HOLD_FIELD = "보류";
const ON_HOLD_VISIBILITY_MIGRATION_KEY = "platforms.show_on_hold_v1";

const COLUMN_ORDER_STORAGE_KEY = "platform_rows_col_order_v2";

const CREATE_MODAL_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "회사명", label: "회사명" },
  { key: "발표일", label: "발표일" },
  { key: "플랫폼명", label: "플랫폼명" },
  { key: "분류", label: "분류" },
  { key: "대분류", label: "대분류" },
  { key: "현재단계", label: "현재단계" },
  { key: "마지막상황", label: "마지막상황" },
  { key: "대기사유", label: "대기사유" },
  { key: "다음액션", label: "다음액션" },
  { key: "우선순위", label: "우선순위" },
  { key: "비고", label: "비고" },
];

function ensureOnHoldInColumnOrder(keys: string[]): string[] {
  if (!keys.includes(ON_HOLD_FIELD)) return keys;
  const rest = keys.filter((k) => k !== ON_HOLD_FIELD);
  const afterMeeting = rest.indexOf("미팅");
  if (afterMeeting >= 0) {
    const next = [...rest];
    next.splice(afterMeeting + 1, 0, ON_HOLD_FIELD);
    return next;
  }
  const afterDone = rest.indexOf("완료");
  if (afterDone >= 0) {
    const next = [...rest];
    next.splice(afterDone + 1, 0, ON_HOLD_FIELD);
    return next;
  }
  return keys;
}

function mergeHeaderKeys(items: PlatformRow[]): string[] {
  if (items.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of items) {
    for (const k of Object.keys(row)) {
      if (INTERNAL_KEYS.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return ensureOnHoldInColumnOrder(ensureMajorCategoryInColumnOrder(out));
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

function emptyCreateForm(): Record<string, string> {
  const f: Record<string, string> = {};
  CREATE_MODAL_FIELDS.forEach(({ key }) => {
    f[key] = "";
  });
  return f;
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

export function PlatformRowsClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<string>("발표일");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [patchingCell, setPatchingCell] = useState<string | null>(null);
  const [togglingCell, setTogglingCell] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<TableUndoEntry | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const undoStackRef = useRef<TableUndoEntry[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hiddenByField, setHiddenByField] = useState<Record<FilterTagField, Set<string>>>(() => ({
    발표일: loadHiddenSet("platform.hidden.발표일"),
    분류: loadHiddenSet("platform.hidden.분류"),
    플랫폼명: loadHiddenSet("platform.hidden.플랫폼명"),
  }));

  const [modalItem, setModalItem] = useState<PlatformRow | null>(null);
  const [modalForm, setModalForm] = useState<Record<string, string>>({});
  const [savingModal, setSavingModal] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>(emptyCreateForm);
  const [savingCreate, setSavingCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
        const defaultKeys = mergeHeaderKeys(list);
        setColumnOrder(loadColumnOrder(defaultKeys));
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

  const colVis = useTableColumnVisibility("platforms", columnOrder);
  const colLabels = useColumnLabels("platforms");

  useEffect(() => {
    if (state.kind !== "ready") return;
    if (!columnOrder.includes(ON_HOLD_FIELD)) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(ON_HOLD_VISIBILITY_MIGRATION_KEY)) return;
    window.localStorage.setItem(ON_HOLD_VISIBILITY_MIGRATION_KEY, "1");
    if (colVis.hiddenColumns.has(ON_HOLD_FIELD)) {
      colVis.setColumnVisible(ON_HOLD_FIELD, true);
    }
  }, [state, columnOrder, colVis]);

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

  const persistColumnOrder = useCallback((next: string[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetColumnOrder = useCallback(() => {
    if (state.kind !== "ready" || state.items.length === 0) return;
    const next = mergeHeaderKeys(state.items);
    persistColumnOrder(next);
    setColumnOrder(next);
  }, [persistColumnOrder, state]);

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

  const booleanFields = useMemo(() => {
    if (state.kind !== "ready") return new Set<string>();
    const set = new Set<string>();
    for (const key of columnOrder) {
      if (fieldIsBoolean(key, state.items)) set.add(key);
    }
    return set;
  }, [state, columnOrder]);

  const filterOptions = useMemo(() => {
    if (state.kind !== "ready") {
      return { 발표일: [] as string[], 분류: [] as string[], 플랫폼명: [] as string[] };
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
      발표일: sortedKeys(state.items.map((it) => it["발표일"] ?? "")),
      분류: sortedKeys(state.items.map((it) => it["분류"] ?? "")),
      플랫폼명: sortedKeys(state.items.map((it) => it["플랫폼명"] ?? "")),
    };
  }, [state]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const toggleFilter = (field: FilterTagField, key: string) => {
    const storageKey = `platform.hidden.${field}`;
    setHiddenByField((prev) => {
      const nextSet = new Set(prev[field]);
      if (nextSet.has(key)) nextSet.delete(key);
      else nextSet.add(key);
      saveHiddenSet(storageKey, nextSet);
      return { ...prev, [field]: nextSet };
    });
  };

  const setFilterHiddenAll = (field: FilterTagField, hidden: Set<string>) => {
    const storageKey = `platform.hidden.${field}`;
    saveHiddenSet(storageKey, hidden);
    setHiddenByField((prev) => ({ ...prev, [field]: hidden }));
  };

  const setFieldInState = useCallback((id: string, field: string, value: string) => {
    setState((s) => {
      if (s.kind !== "ready") return s;
      return {
        kind: "ready",
        items: s.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
      };
    });
  }, []);

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
        /* actionError set in patchField */
      }
    },
    [booleanFields, dismissUndoToast, patchField],
  );

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

  const sorted = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      items = items.filter((it) =>
        columnOrder.some((key) => (it[key] ?? "").toLowerCase().includes(q)),
      );
    }
    for (const field of FILTER_TAG_FIELDS) {
      const hidden = hiddenByField[field];
      if (hidden.size > 0) {
        items = items.filter((it) => !hidden.has((it[field] ?? "").trim()));
      }
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, filterText, hiddenByField, sortKey, sortDir, columnOrder]);

  const list = useTableListDisplay("platforms", sorted);
  const colWidths = useTableColumnWidths("platforms", colVis.visibleKeys, colLabels.getLabel);

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

  const openEditModal = (item: PlatformRow) => {
    setActionError(null);
    setModalItem(item);
    const f: Record<string, string> = {};
    columnOrder.forEach((key) => {
      f[key] = item[key] ?? "";
    });
    setModalForm(f);
  };

  const handleModalSave = async () => {
    if (!modalItem) return;
    setSavingModal(true);
    setActionError(null);
    try {
      const payload: Record<string, string> = { id: modalItem.id };
      columnOrder.forEach((key) => {
        if (!READONLY_FIELDS.has(key)) payload[key] = modalForm[key] ?? "";
      });
      await apiFetch("/platform-rows/update", payload);
      setModalItem(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSavingModal(false);
    }
  };

  const handleCreateSave = async () => {
    setSavingCreate(true);
    setActionError(null);
    try {
      const payload: Record<string, string> = {};
      CREATE_MODAL_FIELDS.forEach(({ key }) => {
        payload[key] = createForm[key] ?? "";
      });
      await apiFetch("/platform-rows/create", payload);
      setCreateModalOpen(false);
      setCreateForm(emptyCreateForm());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSavingCreate(false);
    }
  };

  const isCellBusy = (rowId: string, field: string) =>
    patchingCell === `${rowId}:${field}` || togglingCell === `${rowId}:${field}`;

  const tableColSpan = 1 + colVis.visibleKeys.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActionError(null);
            setCreateForm(emptyCreateForm());
            setCreateModalOpen(true);
          }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          새로만들기
        </button>
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
          title="열 순서를 시트 기본 순서로"
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

      {state.kind === "ready" && columnOrder.length > 0 && (
        <FilterTagsFlow
          listLabel={listLabel}
          groups={FILTER_TAG_FIELDS.filter((f) => columnOrder.includes(f) || filterOptions[f].length > 0).map(
            (field) => ({
              title: field === "플랫폼명" ? "플랫폼" : field,
              keys: filterOptions[field],
              hidden: hiddenByField[field],
              onToggle: (key) => toggleFilter(field, key),
              onShowAll: () => setFilterHiddenAll(field, new Set()),
              onHideAll: () => setFilterHiddenAll(field, new Set(filterOptions[field])),
            }),
          )}
        />
      )}

      {actionError && !modalItem && !createModalOpen && (
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

      {state.kind === "ready" && columnOrder.length > 0 && (
        <>
        <TableListControls
          pageSize={list.pageSize}
          onPageSizeChange={list.setPageSize}
          showAll={list.showAll}
          onShowAll={list.loadAll}
          totalFiltered={list.totalFiltered}
          hiddenCount={list.hiddenCount}
          displayedCount={list.displayed.length}
          dateFilter={list.dateFilter}
          onDatePresetChange={list.setDatePreset}
          onCustomFromChange={list.setCustomFrom}
          onCustomToChange={list.setCustomTo}
          dateExcludedCount={list.dateExcludedCount}
          dateFieldHint={TABLE_LIST_DATE_FIELDS.platforms.join(" · ")}
          columnVisibility={{
            allKeys: columnOrder,
            hiddenColumns: colVis.hiddenColumns,
            onSetVisible: colVis.setColumnVisible,
            onShowAllColumns: colVis.showAllColumns,
            columnLabel: colLabels.getLabel,
          }}
        />
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="overflow-x-auto">
          <table
            className="w-full text-xs"
            style={{ ...colWidths.tableStyle, minWidth: colWidths.tableMinWidth(1, 0) }}
          >
            <TableColgroup
              leadingActionCols={1}
              trailingActionCols={0}
              dataKeys={colVis.visibleKeys}
              getWidth={colWidths.getWidth}
              actionWidthPx={colWidths.actionWidth}
            />
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
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
              </tr>
            </thead>
            <tbody>
              {list.totalFiltered === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-3 py-8 text-center text-zinc-500">
                    {filterText || FILTER_TAG_FIELDS.some((f) => hiddenByField[f].size > 0) || list.dateFilter.preset !== "all"
                      ? "조건에 맞는 항목이 없습니다"
                      : "항목이 없습니다"}
                  </td>
                </tr>
              ) : (
                list.displayed.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        수정
                      </button>
                    </td>
                    {colVis.visibleKeys.map((field) => {
                      const isBool = booleanFields.has(field);
                      const readonly = READONLY_FIELDS.has(field);
                      const wide = field.includes("비고") || field.includes("메모") || field.includes("링크") || field.includes("FTP");
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
                            required={field === "플랫폼명" || field === "회사명"}
                            wide={wide}
                            muted={field.includes("일") && field.includes("날짜")}
                            tabular={isBool || field.includes("화수") || field.includes("회차")}
                            disabled={readonly || isCellBusy(item.id, field)}
                            onSave={handleInlineSave}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          <TableListFooter
            canLoadMore={list.canLoadMore}
            onLoadMore={list.loadMore}
            onNewPage={() => {
              setActionError(null);
              setCreateForm(emptyCreateForm());
              setCreateModalOpen(true);
            }}
          />
        </div>
        </>
      )}

      {state.kind === "ready" && columnOrder.length === 0 && (
        <p className="text-sm text-zinc-500">표시할 플랫폼 행이 없습니다.</p>
      )}

      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {rowTitle(modalItem)} · 전체 필드 수정
            </h3>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              저장 시 마지막업데이트날짜가 자동으로 갱신됩니다.
            </p>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {columnOrder.map((key) => (
                <div key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {key}
                    {READONLY_FIELDS.has(key) ? " (자동)" : ""}
                  </span>
                  {booleanFields.has(key) ? (
                    <label className="mt-1 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isPlatformBoolValue(modalForm[key])}
                        disabled={READONLY_FIELDS.has(key)}
                        onChange={(e) =>
                          setModalForm((prev) => ({
                            ...prev,
                            [key]: boolToCell(e.target.checked),
                          }))
                        }
                        className="h-4 w-4 accent-zinc-800 dark:accent-zinc-200"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-200">체크</span>
                    </label>
                  ) : (
                    <input
                      type="text"
                      value={modalForm[key] ?? ""}
                      disabled={READONLY_FIELDS.has(key)}
                      onChange={(e) => setModalForm({ ...modalForm, [key]: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  )}
                </div>
              ))}
            </div>
            {actionError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalItem(null)}
                disabled={savingModal}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleModalSave()}
                disabled={savingModal}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingModal ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">플랫폼 행 새로 만들기</h3>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              회사명 또는 플랫폼명 중 하나는 반드시 입력하세요.
            </p>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {CREATE_MODAL_FIELDS.map(({ key, label, required }) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {label}{required ? " *" : ""}
                  </span>
                  <input
                    type="text"
                    value={createForm[key] ?? ""}
                    onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              ))}
            </div>
            {actionError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={savingCreate}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleCreateSave()}
                disabled={savingCreate}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingCreate ? "저장 중…" : "생성"}
              </button>
            </div>
          </div>
        </div>
      )}

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
