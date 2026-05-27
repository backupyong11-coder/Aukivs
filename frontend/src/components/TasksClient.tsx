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
import { useTableListDisplay } from "@/hooks/useTableListDisplay";
import { getApiBaseUrl } from "@/lib/apiBase";
import { TABLE_LIST_DATE_FIELDS } from "@/lib/tableListView";
import {
  TaskInlineCell,
  type EditableTaskField,
} from "@/components/TaskInlineCell";

type TaskRow = {
  id: string;
  sheet_row: string;
  날짜그룹: string;
  우선순위: string;
  완료: string;
  마감일: string;
  분야: string;
  분류: string;
  "정량화 분": string;
  업무명: string;
  정량화: string;
  "정량화 구분": string;
  시간: string;
  시간변환: string;
  관련플랫폼: string;
  세부수치: string;
  세부단위: string;
  관련작품: string;
  난이도: string;
  피로도: string;
  상태: string;
  담당자: string;
  메모: string;
};

type SortKey =
  | "마감일"
  | "관련플랫폼"
  | "분류"
  | "분야"
  | "우선순위"
  | "업무명"
  | "시간";
type SortDir = "asc" | "desc";
type TabType = "미완료" | "완료" | "전체";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: TaskRow[] };

const EMPTY_FORM: Omit<TaskRow, "id" | "sheet_row"> = {
  날짜그룹: "",
  우선순위: "",
  완료: "",
  마감일: "",
  분야: "",
  분류: "",
  "정량화 분": "",
  업무명: "",
  정량화: "",
  "정량화 구분": "",
  시간: "",
  시간변환: "",
  관련플랫폼: "",
  세부수치: "",
  세부단위: "",
  관련작품: "",
  난이도: "",
  피로도: "",
  상태: "",
  담당자: "",
  메모: "",
};

const COLUMN_ORDER_STORAGE_KEY = "tasks_col_order_v1";

const TASK_DATA_COLUMNS: {
  key: EditableTaskField;
  label: string;
  sortable?: boolean;
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
  align?: "center";
}[] = [
  { key: "우선순위", label: "우선순위", sortable: true, align: "center" },
  { key: "마감일", label: "마감일", sortable: true, muted: true, tabular: true },
  { key: "분야", label: "분야", sortable: true },
  { key: "분류", label: "분류", sortable: true },
  { key: "업무명", label: "업무명", sortable: true, wide: true },
  { key: "정량화 분", label: "정량화 분" },
  { key: "정량화", label: "정량화" },
  { key: "정량화 구분", label: "정량화 구분" },
  { key: "시간", label: "시간", sortable: true, tabular: true },
  { key: "시간변환", label: "시간변환" },
  { key: "관련플랫폼", label: "관련플랫폼", sortable: true },
  { key: "세부수치", label: "세부수치" },
  { key: "세부단위", label: "세부단위" },
  { key: "관련작품", label: "관련작품" },
  { key: "난이도", label: "난이도" },
  { key: "피로도", label: "피로도" },
  { key: "상태", label: "상태" },
  { key: "담당자", label: "담당자" },
  { key: "메모", label: "메모", wide: true, muted: true },
];

const DEFAULT_COLUMN_ORDER = TASK_DATA_COLUMNS.map((c) => c.key);

function loadColumnOrder(defaultKeys: EditableTaskField[]): EditableTaskField[] {
  if (typeof window === "undefined") return defaultKeys;
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return defaultKeys;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultKeys;
    const allowed = new Set(defaultKeys);
    const out: EditableTaskField[] = [];
    for (const k of parsed) {
      if (typeof k === "string" && allowed.has(k as EditableTaskField) && !out.includes(k as EditableTaskField)) {
        out.push(k as EditableTaskField);
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

const FIELD_LABELS: { key: keyof typeof EMPTY_FORM; label: string; required?: boolean }[] = [
  { key: "업무명", label: "업무명", required: true },
  { key: "우선순위", label: "우선순위" },
  { key: "마감일", label: "마감일" },
  { key: "분야", label: "분야" },
  { key: "분류", label: "분류" },
  { key: "정량화 분", label: "정량화 분" },
  { key: "정량화", label: "정량화" },
  { key: "정량화 구분", label: "정량화 구분" },
  { key: "시간", label: "시간" },
  { key: "시간변환", label: "시간변환" },
  { key: "관련플랫폼", label: "관련플랫폼" },
  { key: "세부수치", label: "세부수치 (N열)" },
  { key: "세부단위", label: "세부단위 (O열, 분·컷 등)" },
  { key: "관련작품", label: "관련작품" },
  { key: "난이도", label: "난이도" },
  { key: "피로도", label: "피로도" },
  { key: "상태", label: "상태" },
  { key: "담당자", label: "담당자/요청주체" },
  { key: "메모", label: "메모" },
];

function isDoneValue(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "완료" || v === "✓";
}

function isDone(item: TaskRow) {
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
    try { const j = JSON.parse(text); throw new Error((j as {detail?: string}).detail ?? text); }
    catch { throw new Error(text); }
  }
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

type TaskFormFields = Omit<TaskRow, "id" | "sheet_row">;

function TaskFormModal(props: {
  title: string;
  fields: TaskFormFields;
  setFields: Dispatch<SetStateAction<TaskFormFields>>;
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
          {FIELD_LABELS.map(({ key, label, required }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {label}{required ? " *" : ""}
              </span>
              <input
                type="text"
                value={fields[key]}
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

export function TasksClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<TaskRow | null>(null);
  const [form, setForm] = useState<TaskFormFields>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState<TaskFormFields>(EMPTY_FORM);
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
  const [sortKey, setSortKey] = useState<SortKey>("마감일");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [columnOrder, setColumnOrder] = useState<EditableTaskField[]>(DEFAULT_COLUMN_ORDER);
  const [dragCol, setDragCol] = useState<EditableTaskField | null>(null);
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("tasks.hiddenPlatforms");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("tasks.hiddenCategories");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });
  const [hiddenPriorities, setHiddenPriorities] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("tasks.hiddenPriorities");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("tasks.hiddenFields");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const raw = await apiFetch("/tasks");
      const arr = Array.isArray(raw) ? raw : [];
      const items: TaskRow[] = arr.map((row) => {
        const r = row as TaskRow;
        return {
          ...EMPTY_FORM,
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
    const map = new Map(TASK_DATA_COLUMNS.map((c) => [c.key, c]));
    return columnOrder.map((k) => map.get(k)).filter((c): c is (typeof TASK_DATA_COLUMNS)[number] => !!c);
  }, [columnOrder]);

  const persistColumnOrder = useCallback((next: EditableTaskField[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetColumnOrder = useCallback(() => {
    persistColumnOrder(DEFAULT_COLUMN_ORDER);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  }, [persistColumnOrder]);

  const handleColDrop = useCallback(
    (targetField: EditableTaskField) => {
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
        await apiFetch("/tasks/update", { id: target.id, 완료: revertTo });
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

  const sortedKeys = (vals: string[]) => {
    const keys = [...new Set(vals)];
    keys.sort((a, b) => {
      const ae = a === "", be = b === "";
      if (ae && !be) return 1;
      if (!ae && be) return -1;
      return a.localeCompare(b, "ko");
    });
    return keys;
  };

  const allPlatforms = useMemo(() => {
    if (state.kind !== "ready") return [];
    return sortedKeys(state.items.map(it => (it.관련플랫폼 ?? "").trim()));
  }, [state]);

  const allCategories = useMemo(() => {
    if (state.kind !== "ready") return [];
    return sortedKeys(state.items.map(it => (it.분류 ?? "").trim()));
  }, [state]);

  const allPriorities = useMemo(() => {
    if (state.kind !== "ready") return [];
    return sortedKeys(state.items.map(it => (it.우선순위 ?? "").trim()));
  }, [state]);

  const allFields = useMemo(() => {
    if (state.kind !== "ready") return [];
    return sortedKeys(state.items.map(it => (it.분야 ?? "").trim()));
  }, [state]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const togglePlatform = (key: string) => {
    setHiddenPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("tasks.hiddenPlatforms", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const toggleCategory = (key: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("tasks.hiddenCategories", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const togglePriority = (key: string) => {
    setHiddenPriorities(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("tasks.hiddenPriorities", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const setHiddenPlatformsSave = (next: Set<string>) => {
    try { window.localStorage.setItem("tasks.hiddenPlatforms", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenPlatforms(next);
  };
  const setHiddenCategoriesSave = (next: Set<string>) => {
    try { window.localStorage.setItem("tasks.hiddenCategories", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenCategories(next);
  };
  const setHiddenPrioritiesSave = (next: Set<string>) => {
    try { window.localStorage.setItem("tasks.hiddenPriorities", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenPriorities(next);
  };
  const toggleField = (key: string) => {
    setHiddenFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("tasks.hiddenFields", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const setHiddenFieldsSave = (next: Set<string>) => {
    try { window.localStorage.setItem("tasks.hiddenFields", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenFields(next);
  };

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (tab === "미완료") items = items.filter(it => !isDone(it));
    else if (tab === "완료") items = items.filter(isDone);
    if (filterText) {
      const q = filterText;
      const hay = (it: TaskRow) =>
        (it.업무명 ?? "").includes(q)
        || (it.관련플랫폼 ?? "").includes(q)
        || (it.분류 ?? "").includes(q)
        || (it.분야 ?? "").includes(q)
        || (it["정량화 분"] ?? "").includes(q)
        || (it.정량화 ?? "").includes(q)
        || (it["정량화 구분"] ?? "").includes(q)
        || (it.세부수치 ?? "").includes(q)
        || (it.세부단위 ?? "").includes(q)
        || (it.관련작품 ?? "").includes(q)
        || (it.난이도 ?? "").includes(q)
        || (it.피로도 ?? "").includes(q)
        || (it.상태 ?? "").includes(q)
        || (it.담당자 ?? "").includes(q)
        || (it.메모 ?? "").includes(q)
        || (it.마감일 ?? "").includes(q);
      items = items.filter(hay);
    }
    if (hiddenPlatforms.size > 0) {
      items = items.filter(it => !hiddenPlatforms.has((it.관련플랫폼 ?? "").trim()));
    }
    if (hiddenCategories.size > 0) {
      items = items.filter(it => !hiddenCategories.has((it.분류 ?? "").trim()));
    }
    if (hiddenPriorities.size > 0) {
      items = items.filter(it => !hiddenPriorities.has((it.우선순위 ?? "").trim()));
    }
    if (hiddenFields.size > 0) {
      items = items.filter(it => !hiddenFields.has((it.분야 ?? "").trim()));
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, tab, filterText, hiddenPlatforms, hiddenCategories, hiddenPriorities, hiddenFields, sortKey, sortDir]);

  const list = useTableListDisplay("tasks", visible);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const openEdit = (item: TaskRow) => {
    setActionError(null);
    setEditItem(item);
    setForm({
      날짜그룹: item.날짜그룹 ?? "",
      우선순위: item.우선순위 ?? "",
      완료: item.완료 ?? "",
      마감일: item.마감일 ?? "",
      분야: item.분야 ?? "",
      분류: item.분류 ?? "",
      "정량화 분": item["정량화 분"] ?? "",
      업무명: item.업무명 ?? "",
      정량화: item.정량화 ?? "",
      "정량화 구분": item["정량화 구분"] ?? "",
      시간: item.시간 ?? "",
      시간변환: item.시간변환 ?? "",
      관련플랫폼: item.관련플랫폼 ?? "",
      세부수치: item.세부수치 ?? "",
      세부단위: item.세부단위 ?? "",
      관련작품: item.관련작품 ?? "",
      난이도: item.난이도 ?? "",
      피로도: item.피로도 ?? "",
      상태: item.상태 ?? "",
      담당자: item.담당자 ?? "",
      메모: item.메모 ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/tasks/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/tasks/create", newForm);
      setCreateOpen(false);
      setNewForm(EMPTY_FORM);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "추가 실패");
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: TaskRow) => {
    if (!window.confirm(`"${item.업무명}" 을 삭제할까요?`)) return;
    try {
      await apiFetch("/tasks/delete", { id: item.id });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const patchTaskField = useCallback(
    async (taskId: string, field: EditableTaskField, newValue: string) => {
      if (state.kind !== "ready") return;
      const item = state.items.find((it) => it.id === taskId);
      if (!item) return;
      const prev = item[field] ?? "";
      if (prev === newValue) return;
      if (field === "업무명" && !newValue.trim()) {
        throw new Error("업무명은 비울 수 없습니다.");
      }
      const cellKey = `${taskId}:${field}`;
      setPatchingCell(cellKey);
      setActionError(null);
      setState((s) => {
        if (s.kind !== "ready") return s;
        return {
          kind: "ready",
          items: s.items.map((it) =>
            it.id === taskId ? { ...it, [field]: newValue } : it,
          ),
        };
      });
      try {
        await apiFetch("/tasks/update", { id: taskId, [field]: newValue });
      } catch (e) {
        setState((s) => {
          if (s.kind !== "ready") return s;
          return {
            kind: "ready",
            items: s.items.map((it) =>
              it.id === taskId ? { ...it, [field]: prev } : it,
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
    async (taskId: string, field: EditableTaskField, newValue: string) => {
      try {
        await patchTaskField(taskId, field, newValue);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "저장 실패");
        throw e;
      }
    },
    [patchTaskField],
  );

  const isCellPatching = (taskId: string, field: EditableTaskField) =>
    patchingCell === `${taskId}:${field}`;

  const handleToggleComplete = async (item: TaskRow, checked: boolean) => {
    const prevDone = item.완료 ?? "";
    const nextDone = doneToCell(checked);
    if (prevDone === nextDone) return;
    setActionError(null);
    dismissUndoToast();
    setTogglingId(item.id);
    setCompletionInState(item.id, nextDone);
    try {
      await apiFetch("/tasks/update", { id: item.id, 완료: nextDone });
      showUndoToast({
        id: item.id,
        title: item.업무명?.trim() || "(제목 없음)",
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
  const tableColSpan = 3 + displayColumns.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setActionError(null); setNewForm(EMPTY_FORM); setCreateOpen(true); }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          새 업무 추가
        </button>
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="업무명·플랫폼·분야·분류·정량화·마감일 등 검색"
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
              title: "우선순위",
              keys: allPriorities,
              hidden: hiddenPriorities,
              onToggle: togglePriority,
              onShowAll: () => setHiddenPrioritiesSave(new Set()),
              onHideAll: () => setHiddenPrioritiesSave(new Set(allPriorities)),
            },
            {
              title: "분야",
              keys: allFields,
              hidden: hiddenFields,
              onToggle: toggleField,
              onShowAll: () => setHiddenFieldsSave(new Set()),
              onHideAll: () => setHiddenFieldsSave(new Set(allFields)),
            },
            {
              title: "분류",
              keys: allCategories,
              hidden: hiddenCategories,
              onToggle: toggleCategory,
              onShowAll: () => setHiddenCategoriesSave(new Set()),
              onHideAll: () => setHiddenCategoriesSave(new Set(allCategories)),
            },
            {
              title: "플랫폼",
              keys: allPlatforms,
              hidden: hiddenPlatforms,
              onToggle: togglePlatform,
              onShowAll: () => setHiddenPlatformsSave(new Set()),
              onHideAll: () => setHiddenPlatformsSave(new Set(allPlatforms)),
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
          dateFieldHint={TABLE_LIST_DATE_FIELDS.tasks.join(" · ")}
        />
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[2600px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thAction}>수정</th>
                <th className={thAction}>완료</th>
                {displayColumns.map((col) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => setDragCol(col.key)}
                    onDragEnd={() => setDragCol(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleColDrop(col.key)}
                    className={`group min-w-[5.5rem] align-top ${dragCol === col.key ? "bg-zinc-200/80 dark:bg-zinc-700/80" : ""}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className={`${thSort} flex w-full items-center gap-0.5 text-left`}
                        onClick={() => handleSort(col.key as SortKey)}
                      >
                        <span
                          className="shrink-0 cursor-grab text-[10px] leading-none text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
                          aria-hidden
                          title="드래그하여 열 이동"
                        >
                          ⋮⋮
                        </span>
                        <span className="truncate">{col.label}</span>
                        <SortIcon col={col.key as SortKey} />
                      </button>
                    ) : (
                      <span className={`${thSort} flex w-full items-center gap-0.5 px-0 py-0`}>
                        <span
                          className="shrink-0 cursor-grab text-[10px] leading-none text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
                          aria-hidden
                          title="드래그하여 열 이동"
                        >
                          ⋮⋮
                        </span>
                        <span className="truncate">{col.label}</span>
                      </span>
                    )}
                  </th>
                ))}
                <th className={thAction}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {list.totalFiltered === 0 ? (
                <tr><td colSpan={tableColSpan} className="px-3 py-8 text-center text-zinc-500">
                  {filterText || hiddenPlatforms.size > 0 || hiddenCategories.size > 0 || hiddenPriorities.size > 0 || hiddenFields.size > 0 || list.dateFilter.preset !== "all"
                    ? "조건에 맞는 항목이 없습니다"
                    : `${tab} 업무가 없습니다`}
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
                      aria-label={`${item.업무명} 완료`}
                      className="h-4 w-4 accent-emerald-600 disabled:opacity-50 dark:accent-emerald-400"
                    />
                  </td>
                  {displayColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-1.5 ${
                        col.tabular ? "whitespace-nowrap tabular-nums" : "whitespace-nowrap"
                      } ${col.key === "관련작품" || col.key === "담당자" ? "max-w-[8rem]" : ""} ${
                        col.key === "메모" ? "max-w-[12rem]" : ""
                      }`}
                    >
                      <TaskInlineCell
                        value={item[col.key] ?? ""}
                        field={col.key}
                        taskId={item.id}
                        align={col.align}
                        wide={col.wide}
                        muted={col.muted}
                        tabular={col.tabular}
                        disabled={isCellPatching(item.id, col.key)}
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
        <TaskFormModal
          title="업무 수정"
          fields={form}
          setFields={setForm}
          onSave={() => void handleSaveEdit()}
          onClose={() => setEditItem(null)}
          saving={saving}
          actionError={actionError}
        />
      )}
      {createOpen && (
        <TaskFormModal
          title="새 업무 추가"
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
