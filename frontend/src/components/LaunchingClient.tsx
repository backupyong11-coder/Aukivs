"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FilterTagsFlow } from "@/components/FilterTagsFlow";
import { TableListControls } from "@/components/TableListControls";
import { useTableColumnVisibility } from "@/hooks/useTableColumnVisibility";
import { useTableListDisplay } from "@/hooks/useTableListDisplay";
import { TABLE_LIST_DATE_FIELDS } from "@/lib/tableListView";
import {
  PlatformRowInlineCell,
  boolToCell,
  isPlatformBoolValue,
} from "@/components/PlatformRowInlineCell";
import {
  EDIT_FIELDS,
  UploadRowFormModal,
  type FormType,
  type UploadRow,
} from "@/components/UploadRowsClient";
import { getApiBaseUrl } from "@/lib/apiBase";

const INTERNAL_KEYS = new Set(["id", "sheet_row"]);
const COMPLETE_FIELD = "완료";
const READONLY_FIELDS = new Set<string>([]);

const FILTER_TAG_FIELDS = ["플랫폼명", "작품명", "업로드완료여부"] as const;
type FilterTagField = (typeof FILTER_TAG_FIELDS)[number];

const LAUNCHING_ROW_KEYS = [
  "런칭일",
  "플랫폼명",
  "작품명",
  "업로드화수",
  "남은업로드화수",
  "업로드완료여부",
] as const;

const CHECKBOX_FIELD_CANDIDATES = new Set([
  "완료",
  "지원사업",
  "일반계약",
  "불가",
  "예정",
  "진행중",
  "계약",
  "미팅",
]);

const COLUMN_ORDER_STORAGE_KEY = "launching_col_order_v1";

const EMPTY_ROW: Omit<UploadRow, "id" | "sheet_row"> = {
  완료: "",
  업로드일: "",
  플랫폼명: "",
  작품명: "",
  업로드화수: "",
  남은업로드화수: "",
  업로드완료여부: "",
  업로드주기: "",
  업로드요일: "",
  업로드방식: "",
  런칭일: "",
  마지막업로드일: "",
  다음업로드일: "",
  원고준비: "",
  업로드링크: "",
  마지막업로드회수: "",
  비고: "",
};

type FieldUndoEntry = {
  id: string;
  field: string;
  title: string;
  previousValue: string;
};

const UNDO_TOAST_MS = 10_000;
const MAX_UNDO_STACK = 10;

function orderedHeaderKeys(row: UploadRow): string[] {
  return Object.keys(row).filter((k) => !INTERNAL_KEYS.has(k));
}

function defaultDataColumnOrder(row: UploadRow): string[] {
  return orderedHeaderKeys(row).filter((k) => k !== COMPLETE_FIELD);
}

function rowField(row: UploadRow, key: string): string {
  return String(row[key as keyof UploadRow] ?? "");
}

function cell(row: UploadRow, key: string): string {
  return rowField(row, key).trim();
}

function isLaunchingRow(row: UploadRow): boolean {
  return LAUNCHING_ROW_KEYS.some((k) => cell(row, k) !== "");
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

function fieldIsBoolean(field: string, items: UploadRow[]): boolean {
  if (CHECKBOX_FIELD_CANDIDATES.has(field)) return true;
  const samples = items
    .map((it) => rowField(it, field).trim())
    .filter((v) => v !== "");
  if (samples.length === 0) return false;
  return samples.every((v) => isPlatformBoolValue(v));
}

function rowTitle(item: UploadRow): string {
  return (item.작품명 ?? item.플랫폼명 ?? "").trim() || "(이름 없음)";
}

function isDoneValue(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "완료" || v === "✓";
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

export function LaunchingClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: UploadRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<string>("런칭일");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [patchingCell, setPatchingCell] = useState<string | null>(null);
  const [togglingCell, setTogglingCell] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<FieldUndoEntry | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const undoStackRef = useRef<FieldUndoEntry[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editItem, setEditItem] = useState<UploadRow | null>(null);
  const [form, setForm] = useState<FormType>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [hiddenFilters, setHiddenFilters] = useState<Record<FilterTagField, Set<string>>>(() => ({
    플랫폼명: loadHiddenSet("launching.hidden.플랫폼명"),
    작품명: loadHiddenSet("launching.hidden.작품명"),
    업로드완료여부: loadHiddenSet("launching.hidden.업로드완료여부"),
  }));

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const raw = await apiFetch("/upload-rows");
      const arr = Array.isArray(raw) ? raw : [];
      const items: UploadRow[] = arr.map((row) => {
        const r = row as UploadRow;
        return {
          ...EMPTY_ROW,
          ...r,
          id: String(r.id ?? ""),
          sheet_row: String(r.sheet_row ?? ""),
        };
      });
      setState({ kind: "ready", items });
      undoStackRef.current = [];
      setUndoCount(0);
      setUndoToast(null);
      if (items.length > 0) {
        setColumnOrder(loadColumnOrder(defaultDataColumnOrder(items[0])));
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

  const syncUndoCount = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
  }, []);

  const showUndoToast = useCallback((entry: FieldUndoEntry) => {
    undoStackRef.current = [
      entry,
      ...undoStackRef.current.filter((e) => !(e.id === entry.id && e.field === entry.field)),
    ].slice(0, MAX_UNDO_STACK);
    syncUndoCount();
    setUndoToast(entry);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoToast(null), UNDO_TOAST_MS);
  }, [syncUndoCount]);

  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
  }, []);

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
    if (state.kind !== "ready" || state.items.length === 0) return;
    const next = defaultDataColumnOrder(state.items[0]);
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

  const patchField = useCallback(
    async (rowId: string, field: string, newValue: string, opts?: { withUndo?: boolean }) => {
      if (state.kind !== "ready") return;
      const item = state.items.find((it) => it.id === rowId);
      if (!item) return;
      const prev = rowField(item, field);
      if (prev === newValue) return;
      const cellKey = `${rowId}:${field}`;
      if (booleanFields.has(field)) setTogglingCell(cellKey);
      else setPatchingCell(cellKey);
      setActionError(null);
      setFieldInState(rowId, field, newValue);
      try {
        await apiFetch("/upload-rows/update", { id: rowId, [field]: newValue });
        if (opts?.withUndo) {
          showUndoToast({
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

  const handleToggleComplete = async (item: UploadRow, checked: boolean) => {
    const prevDone = rowField(item, COMPLETE_FIELD);
    const nextDone = boolToCell(checked);
    if (prevDone === nextDone) return;
    dismissUndoToast();
    try {
      await patchField(item.id, COMPLETE_FIELD, nextDone, { withUndo: true });
    } catch {
      /* reverted */
    }
  };

  const performUndo = useCallback(
    async (entry?: FieldUndoEntry) => {
      const target = entry ?? undoStackRef.current[0];
      if (!target || undoing) return;
      setUndoing(true);
      setActionError(null);
      dismissUndoToast();
      setFieldInState(target.id, target.field, target.previousValue);
      setTogglingCell(`${target.id}:${target.field}`);
      try {
        await apiFetch("/upload-rows/update", {
          id: target.id,
          [target.field]: target.previousValue,
        });
        undoStackRef.current = undoStackRef.current.filter(
          (e) => !(e.id === target.id && e.field === target.field),
        );
        syncUndoCount();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "되돌리기 실패");
        showUndoToast(target);
      } finally {
        setTogglingCell(null);
        setUndoing(false);
      }
    },
    [dismissUndoToast, setFieldInState, showUndoToast, syncUndoCount, undoing],
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

  const launchingItems = useMemo(() => {
    if (state.kind !== "ready") return [];
    return state.items.filter(isLaunchingRow);
  }, [state]);

  const filterOptions = useMemo(() => {
    if (state.kind !== "ready") {
      return { 플랫폼명: [] as string[], 작품명: [] as string[], 업로드완료여부: [] as string[] };
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
      플랫폼명: sortedKeys(launchingItems.map((it) => cell(it, "플랫폼명"))),
      작품명: sortedKeys(launchingItems.map((it) => cell(it, "작품명"))),
      업로드완료여부: sortedKeys(launchingItems.map((it) => cell(it, "업로드완료여부"))),
    };
  }, [state, launchingItems]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const toggleFilter = (field: FilterTagField, key: string) => {
    const storageKey = `launching.hidden.${field}`;
    setHiddenFilters((prev) => {
      const nextSet = new Set(prev[field]);
      if (nextSet.has(key)) nextSet.delete(key);
      else nextSet.add(key);
      saveHiddenSet(storageKey, nextSet);
      return { ...prev, [field]: nextSet };
    });
  };

  const setFilterHiddenAll = (field: FilterTagField, hidden: Set<string>) => {
    saveHiddenSet(`launching.hidden.${field}`, hidden);
    setHiddenFilters((prev) => ({ ...prev, [field]: hidden }));
  };

  const visible = useMemo(() => {
    let items = launchingItems;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      items = items.filter((it) =>
        columnOrder.some((key) => rowField(it, key).toLowerCase().includes(q)) ||
        (hasCompleteColumn && rowField(it, COMPLETE_FIELD).toLowerCase().includes(q)),
      );
    }
    for (const field of FILTER_TAG_FIELDS) {
      const hidden = hiddenFilters[field];
      if (hidden.size > 0) {
        items = items.filter((it) => !hidden.has(cell(it, field)));
      }
    }
    const sk = sortKey || "런칭일";
    return [...items].sort((a, b) => {
      const va = cell(a, sk);
      const vb = cell(b, sk);
      if (sk === "남은업로드화수" || sk === "업로드화수" || sk === "마지막업로드회수") {
        const na = Number.parseFloat(va) || 0;
        const nb = Number.parseFloat(vb) || 0;
        return sortDir === "asc" ? na - nb : nb - na;
      }
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [launchingItems, filterText, columnOrder, hasCompleteColumn, hiddenFilters, sortKey, sortDir]);

  const list = useTableListDisplay("launching", visible);
  const colVis = useTableColumnVisibility("launching", columnOrder);

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

  const openEdit = (item: UploadRow) => {
    setActionError(null);
    setEditItem(item);
    const f: FormType = {};
    EDIT_FIELDS.forEach(({ key }) => {
      f[key] = item[key] ?? "";
    });
    setForm(f);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    setActionError(null);
    try {
      await apiFetch("/upload-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: UploadRow) => {
    if (!window.confirm(`"${item.작품명}" (${item.플랫폼명}) 행을 삭제할까요?`)) return;
    try {
      await apiFetch("/upload-rows/delete", { id: item.id });
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

      {state.kind === "ready" && columnOrder.length > 0 && (
        <FilterTagsFlow
          listLabel={listLabel}
          groups={FILTER_TAG_FIELDS.map((field) => ({
            title: field,
            keys: filterOptions[field],
            hidden: hiddenFilters[field],
            onToggle: (key) => toggleFilter(field, key),
            onShowAll: () => setFilterHiddenAll(field, new Set()),
            onHideAll: () => setFilterHiddenAll(field, new Set(filterOptions[field])),
          }))}
        />
      )}

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

      {state.kind === "ready" && state.items.length === 0 && (
        <p className="text-sm text-zinc-500">표시할 행이 없습니다.</p>
      )}

      {state.kind === "ready" && columnOrder.length > 0 && (
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
          dateFieldHint={TABLE_LIST_DATE_FIELDS.launching.join(" · ")}
          columnVisibility={{
            allKeys: columnOrder,
            hiddenColumns: colVis.hiddenColumns,
            onSetVisible: colVis.setColumnVisible,
            onShowAllColumns: colVis.showAllColumns,
          }}
        />
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[2200px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
                {hasCompleteColumn ? <th className={thAction}>완료</th> : null}
                {colVis.visibleKeys.map((field) => (
                  <th
                    key={field}
                    draggable
                    onDragStart={() => setDragCol(field)}
                    onDragEnd={() => setDragCol(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleColDrop(field)}
                    className={`group min-w-[5.5rem] align-top ${dragCol === field ? "bg-zinc-200/80 dark:bg-zinc-700/80" : ""}`}
                  >
                    <button
                      type="button"
                      className={`${thSort} flex w-full items-center gap-0.5 text-left`}
                      onClick={() => handleSort(field)}
                    >
                      <span
                        className="shrink-0 cursor-grab text-[10px] leading-none text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
                        aria-hidden
                        title="드래그하여 열 이동"
                      >
                        ⋮⋮
                      </span>
                      <span className="truncate">{field}</span>
                      <SortIcon col={field} />
                    </button>
                  </th>
                ))}
                <th className={thAction}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {list.totalFiltered === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-3 py-8 text-center text-zinc-500">
                    {filterText ||
                    FILTER_TAG_FIELDS.some((f) => hiddenFilters[f].size > 0) ||
                    list.dateFilter.preset !== "all"
                      ? "조건에 맞는 항목이 없습니다"
                      : "런칭 관련 항목이 없습니다"}
                  </td>
                </tr>
              ) : (
                list.displayed.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-zinc-100 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-900/40 ${
                      hasCompleteColumn && isDoneValue(rowField(item, COMPLETE_FIELD))
                        ? "opacity-50"
                        : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                      >
                        수정
                      </button>
                    </td>
                    {hasCompleteColumn ? (
                      <td className="px-2 py-1.5 text-center align-top">
                        <input
                          type="checkbox"
                          checked={isDoneValue(rowField(item, COMPLETE_FIELD))}
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
                        field.includes("링크") ||
                        field === "작품명";
                      return (
                        <td
                          key={field}
                          className={`max-w-[14rem] px-2 py-1.5 align-top ${isBool ? "text-center" : ""}`}
                        >
                          <PlatformRowInlineCell
                            value={rowField(item, field)}
                            field={field}
                            rowId={item.id}
                            boolean={isBool}
                            required={field === "작품명"}
                            wide={wide}
                            muted={field.includes("일")}
                            tabular={field.includes("화수") || field.includes("회차")}
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

      {editItem && (
        <UploadRowFormModal
          title={`수정: ${editItem.작품명}`}
          fields={form}
          setFields={setForm}
          onSave={() => void handleSaveEdit()}
          onClose={() => setEditItem(null)}
          saving={saving}
          actionError={actionError}
        />
      )}

      {undoToast ? (
        <div
          className="fixed bottom-4 left-1/2 z-50 flex max-w-lg -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          role="status"
        >
          <span className="text-zinc-700 dark:text-zinc-200">
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              「{undoToast.title}」
            </span>{" "}
            {undoToast.field} 변경됨
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
