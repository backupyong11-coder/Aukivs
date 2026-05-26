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
import { getApiBaseUrl } from "@/lib/apiBase";
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

const FIELD_LABELS: { key: keyof typeof EMPTY_FORM; label: string; required?: boolean }[] = [
  { key: "업무명", label: "업무명", required: true },
  { key: "날짜그룹", label: "날짜그룹 (A열)" },
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
  const [platformFilterOpen, setPlatformFilterOpen] = useState(false);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [priorityFilterOpen, setPriorityFilterOpen] = useState(false);
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
  const [fieldFilterOpen, setFieldFilterOpen] = useState(false);

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
      undoStackRef.current = [];
      setUndoCount(0);
      setUndoToast(null);
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

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
        (it.날짜그룹 ?? "").includes(q)
        || (it.업무명 ?? "").includes(q)
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

  const thCls = "whitespace-nowrap px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400";
  const thSort = thCls + " cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="업무명·플랫폼·분야·분류·정량화·마감일 등 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
        <button onClick={() => { setActionError(null); setNewForm(EMPTY_FORM); setCreateOpen(true); }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          새 업무 추가
        </button>
        <div className="relative">
          <button type="button" onClick={() => setPlatformFilterOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
            플랫폼 필터
            {hiddenPlatforms.size > 0 && (
              <span className="rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-400 dark:text-zinc-900">{hiddenPlatforms.size}</span>
            )}
            <span className="text-[10px]">{platformFilterOpen ? "▲" : "▼"}</span>
          </button>
          {platformFilterOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">표시할 플랫폼</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHiddenPlatformsSave(new Set())} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체</button>
                  <button type="button" onClick={() => setHiddenPlatformsSave(new Set(allPlatforms))} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체숨김</button>
                </div>
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {allPlatforms.map(key => (
                  <li key={key || "__pf__"}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input type="checkbox" checked={!hiddenPlatforms.has(key)} onChange={() => togglePlatform(key)} className="accent-zinc-700" />
                      <span className="text-xs text-zinc-800 dark:text-zinc-200">{listLabel(key)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <button type="button" onClick={() => setPlatformFilterOpen(false)} className="w-full rounded-lg border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">닫기</button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setCategoryFilterOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
            분류 필터
            {hiddenCategories.size > 0 && (
              <span className="rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-400 dark:text-zinc-900">{hiddenCategories.size}</span>
            )}
            <span className="text-[10px]">{categoryFilterOpen ? "▲" : "▼"}</span>
          </button>
          {categoryFilterOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">표시할 분류</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHiddenCategoriesSave(new Set())} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체</button>
                  <button type="button" onClick={() => setHiddenCategoriesSave(new Set(allCategories))} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체숨김</button>
                </div>
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {allCategories.map(key => (
                  <li key={key || "__cat__"}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input type="checkbox" checked={!hiddenCategories.has(key)} onChange={() => toggleCategory(key)} className="accent-zinc-700" />
                      <span className="text-xs text-zinc-800 dark:text-zinc-200">{listLabel(key)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <button type="button" onClick={() => setCategoryFilterOpen(false)} className="w-full rounded-lg border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">닫기</button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setPriorityFilterOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
            우선순위 필터
            {hiddenPriorities.size > 0 && (
              <span className="rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-400 dark:text-zinc-900">{hiddenPriorities.size}</span>
            )}
            <span className="text-[10px]">{priorityFilterOpen ? "▲" : "▼"}</span>
          </button>
          {priorityFilterOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">표시할 우선순위</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHiddenPrioritiesSave(new Set())} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체</button>
                  <button type="button" onClick={() => setHiddenPrioritiesSave(new Set(allPriorities))} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체숨김</button>
                </div>
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {allPriorities.map(key => (
                  <li key={key || "__pr__"}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input type="checkbox" checked={!hiddenPriorities.has(key)} onChange={() => togglePriority(key)} className="accent-zinc-700" />
                      <span className="text-xs text-zinc-800 dark:text-zinc-200">{listLabel(key)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <button type="button" onClick={() => setPriorityFilterOpen(false)} className="w-full rounded-lg border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">닫기</button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setFieldFilterOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
            분야 필터
            {hiddenFields.size > 0 && (
              <span className="rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-400 dark:text-zinc-900">{hiddenFields.size}</span>
            )}
            <span className="text-[10px]">{fieldFilterOpen ? "▲" : "▼"}</span>
          </button>
          {fieldFilterOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">표시할 분야</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setHiddenFieldsSave(new Set())} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체</button>
                  <button type="button" onClick={() => setHiddenFieldsSave(new Set(allFields))} className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체숨김</button>
                </div>
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                {allFields.map(key => (
                  <li key={key || "__fld__"}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input type="checkbox" checked={!hiddenFields.has(key)} onChange={() => toggleField(key)} className="accent-zinc-700" />
                      <span className="text-xs text-zinc-800 dark:text-zinc-200">{listLabel(key)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <button type="button" onClick={() => setFieldFilterOpen(false)} className="w-full rounded-lg border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">닫기</button>
              </div>
            </div>
          )}
        </div>

        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
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
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[2600px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thCls}>수정</th>
                <th className={thCls}>날짜그룹</th>
                <th className={thCls}>완료</th>
                <th className={thSort} onClick={() => handleSort("우선순위")}>우선순위<SortIcon col="우선순위"/></th>
                <th className={thSort} onClick={() => handleSort("마감일")}>마감일<SortIcon col="마감일"/></th>
                <th className={thSort} onClick={() => handleSort("분야")}>분야<SortIcon col="분야"/></th>
                <th className={thSort} onClick={() => handleSort("분류")}>분류<SortIcon col="분류"/></th>
                <th className={thSort} onClick={() => handleSort("업무명")}>업무명<SortIcon col="업무명"/></th>
                <th className={thCls}>정량화 분</th>
                <th className={thCls}>정량화</th>
                <th className={thCls}>정량화 구분</th>
                <th className={thSort} onClick={() => handleSort("시간")}>시간<SortIcon col="시간"/></th>
                <th className={thCls}>시간변환</th>
                <th className={thSort} onClick={() => handleSort("관련플랫폼")}>관련플랫폼<SortIcon col="관련플랫폼"/></th>
                <th className={thCls}>세부수치</th>
                <th className={thCls}>세부단위</th>
                <th className={thCls}>관련작품</th>
                <th className={thCls}>난이도</th>
                <th className={thCls}>피로도</th>
                <th className={thCls}>상태</th>
                <th className={thCls}>담당자</th>
                <th className={thCls}>메모</th>
                <th className={thCls}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={23} className="px-3 py-8 text-center text-zinc-500">
                  {filterText || hiddenPlatforms.size > 0 || hiddenCategories.size > 0 || hiddenPriorities.size > 0 || hiddenFields.size > 0
                    ? "조건에 맞는 항목이 없습니다"
                    : `${tab} 업무가 없습니다`}
                </td></tr>
              ) : visible.map(item => (
                <tr key={item.id}
                  className={`border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50 ${isDone(item) ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => openEdit(item)}
                      className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                      수정
                    </button>
                  </td>
                  <td className="max-w-[6rem] px-3 py-1.5">
                    <TaskInlineCell
                      value={item.날짜그룹}
                      field="날짜그룹"
                      taskId={item.id}
                      muted
                      disabled={isCellPatching(item.id, "날짜그룹")}
                      onSave={handleInlineSave}
                    />
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
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.우선순위}
                      field="우선순위"
                      taskId={item.id}
                      align="center"
                      disabled={isCellPatching(item.id, "우선순위")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                    <TaskInlineCell
                      value={item.마감일}
                      field="마감일"
                      taskId={item.id}
                      muted
                      tabular
                      disabled={isCellPatching(item.id, "마감일")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.분야}
                      field="분야"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "분야")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.분류}
                      field="분류"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "분류")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <TaskInlineCell
                      value={item.업무명}
                      field="업무명"
                      taskId={item.id}
                      wide
                      disabled={isCellPatching(item.id, "업무명")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item["정량화 분"]}
                      field="정량화 분"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "정량화 분")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.정량화}
                      field="정량화"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "정량화")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item["정량화 구분"]}
                      field="정량화 구분"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "정량화 구분")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                    <TaskInlineCell
                      value={item.시간}
                      field="시간"
                      taskId={item.id}
                      tabular
                      disabled={isCellPatching(item.id, "시간")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.시간변환}
                      field="시간변환"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "시간변환")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.관련플랫폼}
                      field="관련플랫폼"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "관련플랫폼")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.세부수치}
                      field="세부수치"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "세부수치")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.세부단위}
                      field="세부단위"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "세부단위")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="max-w-[8rem] px-3 py-1.5">
                    <TaskInlineCell
                      value={item.관련작품}
                      field="관련작품"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "관련작품")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.난이도}
                      field="난이도"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "난이도")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.피로도}
                      field="피로도"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "피로도")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <TaskInlineCell
                      value={item.상태}
                      field="상태"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "상태")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="max-w-[8rem] px-3 py-1.5">
                    <TaskInlineCell
                      value={item.담당자}
                      field="담당자"
                      taskId={item.id}
                      disabled={isCellPatching(item.id, "담당자")}
                      onSave={handleInlineSave}
                    />
                  </td>
                  <td className="max-w-[12rem] px-3 py-1.5">
                    <TaskInlineCell
                      value={item.메모}
                      field="메모"
                      taskId={item.id}
                      muted
                      disabled={isCellPatching(item.id, "메모")}
                      onSave={handleInlineSave}
                    />
                  </td>
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
