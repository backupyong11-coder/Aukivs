"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { FilterTagsFlow } from "@/components/FilterTagsFlow";
import { TableListControls } from "@/components/TableListControls";
import { useTableColumnVisibility } from "@/hooks/useTableColumnVisibility";
import { useTableListDisplay } from "@/hooks/useTableListDisplay";
import { TABLE_LIST_DATE_FIELDS } from "@/lib/tableListView";
import {
  UploadRowInlineCell,
  type EditableUploadRowField,
} from "@/components/UploadRowInlineCell";
import { getApiBaseUrl } from "@/lib/apiBase";

export type UploadRow = {
  id: string;
  sheet_row: string;
  완료: string;
  업로드일: string;
  플랫폼명: string;
  작품명: string;
  업로드화수: string;
  남은업로드화수: string;
  업로드완료여부: string;
  업로드주기: string;
  업로드요일: string;
  업로드방식: string;
  런칭일: string;
  마지막업로드일: string;
  다음업로드일: string;
  원고준비: string;
  업로드링크: string;
  마지막업로드회수: string;
  비고: string;
};

type SortKey = EditableUploadRowField;
type SortDir = "asc" | "desc";
type TabType = "미완료" | "완료" | "전체";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: UploadRow[] };

const COLUMN_ORDER_STORAGE_KEY = "upload_rows_col_order_v1";

const TABLE_COLUMNS: {
  key: EditableUploadRowField;
  label: string;
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
}[] = [
  { key: "업로드일", label: "업로드일", muted: true, tabular: true },
  { key: "플랫폼명", label: "플랫폼" },
  { key: "작품명", label: "작품명", wide: true },
  { key: "업로드화수", label: "업로드화수", tabular: true },
  { key: "남은업로드화수", label: "남은화수", tabular: true },
  { key: "업로드완료여부", label: "완료여부" },
  { key: "업로드주기", label: "업로드주기" },
  { key: "업로드요일", label: "업로드요일" },
  { key: "업로드방식", label: "업로드방식" },
  { key: "런칭일", label: "런칭일", muted: true, tabular: true },
  { key: "마지막업로드일", label: "마지막업로드일", muted: true, tabular: true },
  { key: "다음업로드일", label: "다음업로드일", muted: true, tabular: true },
  { key: "원고준비", label: "원고준비" },
  { key: "업로드링크", label: "업로드링크", wide: true },
  { key: "마지막업로드회수", label: "마지막회수", tabular: true },
  { key: "비고", label: "비고", wide: true, muted: true },
];

const DEFAULT_COLUMN_ORDER = TABLE_COLUMNS.map((c) => c.key);

function loadColumnOrder(defaultKeys: EditableUploadRowField[]): EditableUploadRowField[] {
  if (typeof window === "undefined") return defaultKeys;
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return defaultKeys;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultKeys;
    const allowed = new Set(defaultKeys);
    const out: EditableUploadRowField[] = [];
    for (const k of parsed) {
      if (typeof k === "string" && allowed.has(k as EditableUploadRowField) && !out.includes(k as EditableUploadRowField)) {
        out.push(k as EditableUploadRowField);
      }
    }
    for (const k of defaultKeys) {
      if (!out.includes(k)) out.push(k);
    }
    return out;
  } catch {
    return defaultKeys;
  }
}

export const EDIT_FIELDS: { key: keyof UploadRow; label: string; required?: boolean }[] = [
  { key: "작품명", label: "작품명", required: true },
  ...TABLE_COLUMNS.filter((c) => c.key !== "작품명").map(({ key, label }) => ({ key, label })),
];

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

export type FormType = Partial<Record<keyof UploadRow, string>>;

function isDoneValue(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "완료" || v === "✓";
}

function isDone(item: UploadRow) {
  return isDoneValue(item.완료);
}

function doneToCell(checked: boolean): string {
  return checked ? "TRUE" : "";
}

type CompletionUndoEntry = {
  id: string;
  title: string;
  previousDone: string;
};

const UNDO_TOAST_MS = 10_000;
const MAX_UNDO_STACK = 10;

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try { const j = JSON.parse(text) as { detail?: string }; throw new Error(j.detail ?? text); }
    catch { throw new Error(text); }
  }
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

/** 컴포넌트 본문 안에 모달을 정의하면 매 렌더마다 타입이 바뀌어 입력 포커스가 끊깁니다. */
export function UploadRowFormModal(props: {
  title: string;
  fields: FormType;
  setFields: Dispatch<SetStateAction<FormType>>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  actionError: string | null;
}) {
  const { title, fields, setFields, onSave, onClose, saving, actionError } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
            <input
              type="checkbox"
              checked={isDoneValue(fields.완료)}
              onChange={(e) =>
                setFields((prev) => ({ ...prev, 완료: doneToCell(e.target.checked) }))
              }
              className="h-4 w-4 accent-zinc-800 dark:accent-zinc-200"
            />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">완료</span>
          </label>
          {EDIT_FIELDS.map(({ key, label, required }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {label}{required ? " *" : ""}
              </span>
              <input
                type="text"
                value={fields[key] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          ))}
        </div>
        {actionError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
            취소
          </button>
          <button type="button" onClick={onSave} disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UploadRowsClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<UploadRow | null>(null);
  const [form, setForm] = useState<FormType>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState<FormType>({});
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [patchingCell, setPatchingCell] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<CompletionUndoEntry | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const undoStackRef = useRef<CompletionUndoEntry[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [tab, setTab] = useState<TabType>("미완료");
  const [sortKey, setSortKey] = useState<SortKey>("업로드일");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [columnOrder, setColumnOrder] = useState<EditableUploadRowField[]>(DEFAULT_COLUMN_ORDER);
  const [dragCol, setDragCol] = useState<EditableUploadRowField | null>(null);
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("upload.hiddenPlatforms");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });
  const [hiddenWorks, setHiddenWorks] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("upload.hiddenWorks");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });

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
      setColumnOrder(loadColumnOrder(DEFAULT_COLUMN_ORDER));
      undoStackRef.current = [];
      setUndoCount(0);
      setUndoToast(null);
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

  const displayColumns = useMemo(() => {
    const map = new Map(TABLE_COLUMNS.map((c) => [c.key, c]));
    return columnOrder.map((k) => map.get(k)).filter((c): c is (typeof TABLE_COLUMNS)[number] => !!c);
  }, [columnOrder]);

  const colVis = useTableColumnVisibility("upload-rows", columnOrder);
  const visibleDisplayColumns = useMemo(() => {
    const map = new Map(TABLE_COLUMNS.map((c) => [c.key, c]));
    return colVis.visibleKeys
      .map((k) => map.get(k as EditableUploadRowField))
      .filter((c): c is (typeof TABLE_COLUMNS)[number] => !!c);
  }, [colVis.visibleKeys]);

  const persistColumnOrder = useCallback((next: EditableUploadRowField[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetColumnOrder = useCallback(() => {
    persistColumnOrder(DEFAULT_COLUMN_ORDER);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  }, [persistColumnOrder]);

  const handleColDrop = useCallback(
    (targetField: EditableUploadRowField) => {
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
    },
    [dragCol, persistColumnOrder],
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const syncUndoCount = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
  }, []);

  const setCompletionInState = useCallback((id: string, doneValue: string) => {
    setState((s) => {
      if (s.kind !== "ready") return s;
      return {
        kind: "ready",
        items: s.items.map((it) => (it.id === id ? { ...it, 완료: doneValue } : it)),
      };
    });
  }, []);

  const showUndoToast = useCallback((entry: CompletionUndoEntry) => {
    undoStackRef.current = [
      entry,
      ...undoStackRef.current.filter((e) => e.id !== entry.id),
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

  const performUndo = useCallback(
    async (entry?: CompletionUndoEntry) => {
      const target = entry ?? undoStackRef.current[0];
      if (!target || undoing) return;
      setUndoing(true);
      setActionError(null);
      dismissUndoToast();
      const revertTo = target.previousDone;
      setCompletionInState(target.id, revertTo);
      setTogglingId(target.id);
      try {
        await apiFetch("/upload-rows/update", { id: target.id, 완료: revertTo });
        undoStackRef.current = undoStackRef.current.filter((e) => e.id !== target.id);
        syncUndoCount();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "되돌리기 실패");
        showUndoToast(target);
      } finally {
        setTogglingId(null);
        setUndoing(false);
      }
    },
    [dismissUndoToast, setCompletionInState, showUndoToast, syncUndoCount, undoing],
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

  const counts = useMemo(() => {
    if (state.kind !== "ready") return { 미완료: 0, 완료: 0, 전체: 0 };
    const done = state.items.filter(isDone).length;
    return { 미완료: state.items.length - done, 완료: done, 전체: state.items.length };
  }, [state]);

  const allPlatforms = useMemo(() => {
    if (state.kind !== "ready") return [];
    const keys = [...new Set(state.items.map(it => (it.플랫폼명 ?? "").trim()))];
    keys.sort((a, b) => {
      const ae = a === "", be = b === "";
      if (ae && !be) return 1;
      if (!ae && be) return -1;
      return a.localeCompare(b, "ko");
    });
    return keys;
  }, [state]);

  const allWorks = useMemo(() => {
    if (state.kind !== "ready") return [];
    const keys = [...new Set(state.items.map(it => (it.작품명 ?? "").trim()))];
    keys.sort((a, b) => {
      const ae = a === "", be = b === "";
      if (ae && !be) return 1;
      if (!ae && be) return -1;
      return a.localeCompare(b, "ko");
    });
    return keys;
  }, [state]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const togglePlatform = (key: string) => {
    setHiddenPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("upload.hiddenPlatforms", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const toggleWork = (key: string) => {
    setHiddenWorks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("upload.hiddenWorks", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const setHiddenPlatformsSave = (next: Set<string>) => {
    try { window.localStorage.setItem("upload.hiddenPlatforms", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenPlatforms(next);
  };
  const setHiddenWorksSave = (next: Set<string>) => {
    try { window.localStorage.setItem("upload.hiddenWorks", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenWorks(next);
  };

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (tab === "미완료") items = items.filter(it => !isDone(it));
    else if (tab === "완료") items = items.filter(isDone);
    if (filterText) {
      const q = filterText;
      items = items.filter(it =>
        TABLE_COLUMNS.some(({ key }) => (it[key] ?? "").includes(q)) ||
        (it.작품명 ?? "").includes(q) ||
        (it.플랫폼명 ?? "").includes(q)
      );
    }
    if (hiddenPlatforms.size > 0) {
      items = items.filter(it => !hiddenPlatforms.has((it.플랫폼명 ?? "").trim()));
    }
    if (hiddenWorks.size > 0) {
      items = items.filter(it => !hiddenWorks.has((it.작품명 ?? "").trim()));
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (sortKey === "남은업로드화수" || sortKey === "업로드화수" || sortKey === "마지막업로드회수") {
        const na = Number.parseFloat(va) || 0;
        const nb = Number.parseFloat(vb) || 0;
        return sortDir === "asc" ? na - nb : nb - na;
      }
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, tab, filterText, hiddenPlatforms, hiddenWorks, sortKey, sortDir]);

  const list = useTableListDisplay("upload-rows", visible);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const openEdit = (item: UploadRow) => {
    setActionError(null);
    setEditItem(item);
    const f: FormType = { 완료: item.완료 ?? "" };
    EDIT_FIELDS.forEach(({ key }) => { f[key] = item[key] ?? ""; });
    setForm(f);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/upload-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/upload-rows/create", newForm);
      setCreateOpen(false);
      setNewForm({});
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "추가 실패");
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: UploadRow) => {
    if (!window.confirm(`"${item.작품명}" (${item.플랫폼명}) 행을 삭제할까요?`)) return;
    try {
      await apiFetch("/upload-rows/delete", { id: item.id });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const patchUploadField = useCallback(
    async (rowId: string, field: EditableUploadRowField, newValue: string) => {
      if (state.kind !== "ready") return;
      const item = state.items.find((it) => it.id === rowId);
      if (!item) return;
      const prev = item[field] ?? "";
      if (prev === newValue) return;
      if (field === "작품명" && !newValue.trim()) {
        throw new Error("작품명은 비울 수 없습니다.");
      }
      const cellKey = `${rowId}:${field}`;
      setPatchingCell(cellKey);
      setActionError(null);
      setState((s) => {
        if (s.kind !== "ready") return s;
        return {
          kind: "ready",
          items: s.items.map((it) =>
            it.id === rowId ? { ...it, [field]: newValue } : it,
          ),
        };
      });
      try {
        await apiFetch("/upload-rows/update", { id: rowId, [field]: newValue });
      } catch (e) {
        setState((s) => {
          if (s.kind !== "ready") return s;
          return {
            kind: "ready",
            items: s.items.map((it) =>
              it.id === rowId ? { ...it, [field]: prev } : it,
            ),
          };
        });
        throw e;
      } finally {
        setPatchingCell(null);
      }
    },
    [state],
  );

  const handleInlineSave = useCallback(
    async (rowId: string, field: EditableUploadRowField, newValue: string) => {
      try {
        await patchUploadField(rowId, field, newValue);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "저장 실패");
        throw e;
      }
    },
    [patchUploadField],
  );

  const isCellPatching = (rowId: string, field: EditableUploadRowField) =>
    patchingCell === `${rowId}:${field}`;

  const handleToggleComplete = async (item: UploadRow, checked: boolean) => {
    const prevDone = item.완료 ?? "";
    const nextDone = doneToCell(checked);
    if (prevDone === nextDone) return;
    setActionError(null);
    dismissUndoToast();
    setTogglingId(item.id);
    setCompletionInState(item.id, nextDone);
    try {
      await apiFetch("/upload-rows/update", { id: item.id, 완료: nextDone });
      showUndoToast({
        id: item.id,
        title: item.작품명?.trim() || "(제목 없음)",
        previousDone: prevDone,
      });
    } catch (e) {
      setCompletionInState(item.id, prevDone);
      setActionError(e instanceof Error ? e.message : "완료 상태 변경 실패");
    } finally {
      setTogglingId(null);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thAction = "whitespace-nowrap px-2 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400";
  const thSort =
    "whitespace-nowrap px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100";

  const tableColSpan = 3 + visibleDisplayColumns.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setActionError(null); setNewForm({}); setCreateOpen(true); }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          새 업로드 추가
        </button>
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="작품명·플랫폼명·비고 등 검색"
          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:min-w-[16rem]" />
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
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

      {state.kind === "ready" && (
        <FilterTagsFlow
          listLabel={listLabel}
          groups={[
            {
              title: "플랫폼",
              keys: allPlatforms,
              hidden: hiddenPlatforms,
              onToggle: togglePlatform,
              onShowAll: () => setHiddenPlatformsSave(new Set()),
              onHideAll: () => setHiddenPlatformsSave(new Set(allPlatforms)),
            },
            {
              title: "작품명",
              keys: allWorks,
              hidden: hiddenWorks,
              onToggle: toggleWork,
              onShowAll: () => setHiddenWorksSave(new Set()),
              onHideAll: () => setHiddenWorksSave(new Set(allWorks)),
            },
          ]}
        />
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["미완료", "완료", "전체"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}>
            {t}
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {actionError && !editItem && !createOpen &&
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

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

      {state.kind === "ready" && (
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
          dateFieldHint={TABLE_LIST_DATE_FIELDS["upload-rows"].join(" · ")}
          columnVisibility={{
            allKeys: columnOrder,
            hiddenColumns: colVis.hiddenColumns,
            onSetVisible: colVis.setColumnVisible,
            onShowAllColumns: colVis.showAllColumns,
            columnLabel: (k) => TABLE_COLUMNS.find((c) => c.key === k)?.label ?? k,
          }}
        />
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[2200px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
                <th className={thAction}>완료</th>
                {visibleDisplayColumns.map(({ key, label }) => (
                  <th
                    key={key}
                    draggable
                    onDragStart={() => setDragCol(key)}
                    onDragEnd={() => setDragCol(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleColDrop(key)}
                    className={`group min-w-[5.5rem] align-top ${dragCol === key ? "bg-zinc-200/80 dark:bg-zinc-700/80" : ""}`}
                  >
                    <button
                      type="button"
                      className={`${thSort} flex w-full items-center gap-0.5 text-left`}
                      onClick={() => handleSort(key)}
                    >
                      <span
                        className="shrink-0 cursor-grab text-[10px] leading-none text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
                        aria-hidden
                        title="드래그하여 열 이동"
                      >
                        ⋮⋮
                      </span>
                      <span className="truncate">{label}</span>
                      <SortIcon col={key} />
                    </button>
                  </th>
                ))}
                <th className={thAction}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {list.totalFiltered === 0 ? (
                <tr><td colSpan={tableColSpan} className="px-3 py-8 text-center text-zinc-500">
                  {filterText || hiddenPlatforms.size > 0 || hiddenWorks.size > 0 || list.dateFilter.preset !== "all" ? "조건에 맞는 항목이 없습니다" : `${tab} 업로드가 없습니다`}
                </td></tr>
              ) : list.displayed.map(item => (
                <tr key={item.id}
                  className={`border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50 ${isDone(item) ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => openEdit(item)}
                      className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                      수정
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={isDone(item)}
                      disabled={togglingId === item.id}
                      onChange={(e) => void handleToggleComplete(item, e.target.checked)}
                      aria-label={`${item.작품명} 완료`}
                      className="h-4 w-4 accent-emerald-600 disabled:opacity-50 dark:accent-emerald-400"
                    />
                  </td>
                  {visibleDisplayColumns.map(({ key, wide, muted, tabular }) => (
                    <td
                      key={key}
                      className={`px-3 py-1.5 ${tabular ? "whitespace-nowrap tabular-nums" : "whitespace-nowrap"} ${wide ? "max-w-[280px]" : ""}`}
                    >
                      <UploadRowInlineCell
                        value={item[key] ?? ""}
                        field={key}
                        rowId={item.id}
                        wide={wide}
                        muted={muted}
                        tabular={tabular}
                        disabled={isCellPatching(item.id, key)}
                        onSave={handleInlineSave}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => void handleDelete(item)}
                      className="whitespace-nowrap rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
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
      {createOpen && (
        <UploadRowFormModal
          title="새 업로드 추가"
          fields={newForm}
          setFields={setNewForm}
          onSave={() => void handleCreate()}
          onClose={() => setCreateOpen(false)}
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
            완료 상태를 변경했습니다.
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
