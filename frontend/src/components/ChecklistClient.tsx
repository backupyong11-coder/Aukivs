"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checklistDisplayTitle,
  completeChecklistItems,
  createChecklistItem,
  deleteChecklistItem,
  fetchChecklist,
  suggestChecklist,
  updateChecklistItem,
  type ChecklistItem,
  type ChecklistSuggestData,
  type SuggestMode,
} from "@/lib/checklist";
import {
  canStartDraftAddToChecklist,
  canToggleDraftRowSelection,
  draftSuggestItemKey,
  filterBatchDraftTargets,
  showDraftAddToChecklist,
} from "@/lib/draftSuggestItem";

function itemMatchesToday(item: ChecklistItem): boolean {
  const due = item.due_date?.trim();
  if (due) {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (due.slice(0, 10) === ymd) return true;
  }
  const blob = `${item.title} ${item.note ?? ""} ${item.due_date ?? ""}`;
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const patterns = [
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${m}월 ${day}일`,
    `${m}.${day}`,
  ];
  return patterns.some((p) => blob.includes(p));
}

function itemLooksPriority(item: ChecklistItem): boolean {
  return /높음|긴급|CEO|우선|\[높/i.test(
    `${item.title} ${item.note ?? ""} ${item.due_date ?? ""}`,
  );
}

type CheckFilter = "all" | "today" | "active" | "priority" | "work";
type CheckSort = "recent" | "title" | "priority";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; items: ChecklistItem[] };

export function ChecklistClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [suggestMode, setSuggestMode] = useState<SuggestMode>("prioritize");
  const [suggestPrompt, setSuggestPrompt] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestResult, setSuggestResult] = useState<ChecklistSuggestData | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);
  const [draftAddedKeys, setDraftAddedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [addingDraftByKey, setAddingDraftByKey] = useState<
    Record<string, boolean>
  >({});
  const [draftErrorByKey, setDraftErrorByKey] = useState<
    Record<string, string>
  >({});
  const [draftSelectedKeys, setDraftSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [draftBulkProcessing, setDraftBulkProcessing] = useState(false);
  const [draftBulkProgress, setDraftBulkProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [checkFilter, setCheckFilter] = useState<CheckFilter>("all");
  const [workFilter, setWorkFilter] = useState("");
  const [checkSort, setCheckSort] = useState<CheckSort>("recent");
  const [searchText, setSearchText] = useState("");

  const listLoading = state.kind === "loading";

  const draftBatchTargets = useMemo(() => {
    if (!suggestResult || suggestResult.mode !== "draft") return [];
    return filterBatchDraftTargets(
      suggestResult.items,
      draftSelectedKeys,
      draftAddedKeys,
      addingDraftByKey,
    );
  }, [
    suggestResult,
    draftSelectedKeys,
    draftAddedKeys,
    addingDraftByKey,
  ]);

  const busy =
    completingId !== null ||
    savingUpdate ||
    editItem !== null ||
    deletingId !== null ||
    suggestLoading ||
    savingCreate;

  const processedList = useMemo(() => {
    if (state.kind !== "ready") return [];
    let rows = [...state.items];
    const q = searchText.trim().toLowerCase();
    const wf = workFilter.trim().toLowerCase();
    if (checkFilter === "today") {
      rows = rows.filter(itemMatchesToday);
    } else if (checkFilter === "priority") {
      rows = rows.filter(itemLooksPriority);
    } else if (checkFilter === "work" && wf) {
      rows = rows.filter((it) =>
        `${it.title} ${it.note ?? ""} ${it.due_date ?? ""}`
          .toLowerCase()
          .includes(wf),
      );
    }
    if (q) {
      rows = rows.filter((it) =>
        `${it.title} ${it.note ?? ""} ${it.due_date ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (checkSort === "title") {
      rows.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    } else if (checkSort === "priority") {
      rows.sort((a, b) => {
        const pa = itemLooksPriority(a) ? 0 : 1;
        const pb = itemLooksPriority(b) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.title.localeCompare(b.title, "ko");
      });
    }
    return rows;
  }, [state, checkFilter, workFilter, searchText, checkSort]);

  const loadList = useCallback(async (signal: AbortSignal, showSpinner: boolean) => {
    if (showSpinner) {
      setState({ kind: "loading" });
    }
    try {
      const result = await fetchChecklist({ signal });
      if (signal.aborted) return;
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      if (result.items.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({ kind: "ready", items: result.items });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (signal.aborted) return;
      setState({
        kind: "error",
        message:
          e instanceof Error
            ? e.message
            : "목록을 불러오는 중 오류가 발생했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const first = refreshKey === 0;
    loadList(ac.signal, first);
    return () => ac.abort();
  }, [refreshKey, loadList]);

  useEffect(() => {
    if (!editItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingUpdate) {
        setEditItem(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editItem, savingUpdate]);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingCreate) {
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen, savingCreate]);

  const openEdit = (item: ChecklistItem) => {
    setActionError(null);
    setEditItem(item);
    setDraftTitle(item.title);
    setDraftNote(item.note ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    const title = draftTitle.trim();
    if (!title) {
      setActionError("[파싱] 제목을 입력하세요.");
      return;
    }
    setActionError(null);
    setSavingUpdate(true);
    try {
      const noteTrim = draftNote.trim();
      const result = await updateChecklistItem({
        id: editItem.id,
        title,
        note: noteTrim === "" ? null : noteTrim,
      });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setEditItem(null);
      setRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setActionError(
        e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.",
      );
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleComplete = async (id: string) => {
    setActionError(null);
    setCompletingId(id);
    try {
      const result = await completeChecklistItems([id]);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setActionError(
        e instanceof Error ? e.message : "완료 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setCompletingId(null);
    }
  };

  const handleDelete = async (item: ChecklistItem) => {
    const ok = window.confirm(
      `"${item.title}" 항목을 시트에서 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!ok) return;
    setActionError(null);
    setDeletingId(item.id);
    try {
      const result = await deleteChecklistItem(item.id);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setActionError(
        e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const openCreate = () => {
    setActionError(null);
    setCreateOpen(true);
    setNewTitle("");
    setNewNote("");
  };

  const handleSaveCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      setActionError("[파싱] 제목을 입력하세요.");
      return;
    }
    setActionError(null);
    setSavingCreate(true);
    try {
      const noteTrim = newNote.trim();
      const result = await createChecklistItem({
        title,
        note: noteTrim === "" ? null : noteTrim,
      });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setCreateOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setActionError(
        e instanceof Error ? e.message : "추가 중 오류가 발생했습니다.",
      );
    } finally {
      setSavingCreate(false);
    }
  };

  const handleAiSuggest = async () => {
    const ok = window.confirm(
      "AI 제안은 Google 시트에 자동 저장되지 않습니다. 계속할까요?",
    );
    if (!ok) return;
    setSuggestError(null);
    setDraftAddedKeys(new Set());
    setAddingDraftByKey({});
    setDraftErrorByKey({});
    setDraftSelectedKeys(new Set());
    setDraftBulkProcessing(false);
    setDraftBulkProgress(null);
    setSuggestLoading(true);
    try {
      const p = suggestPrompt.trim();
      const result = await suggestChecklist({
        mode: suggestMode,
        prompt: p === "" ? null : p,
      });
      if (!result.ok) {
        setSuggestError(result.message);
        setSuggestResult(null);
        return;
      }
      setSuggestResult(result.data);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setSuggestError(
        e instanceof Error ? e.message : "AI 요청 중 오류가 발생했습니다.",
      );
      setSuggestResult(null);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleAddDraftToChecklist = (
    rowKey: string,
    title: string,
    note: string | null,
  ) => {
    if (
      !canStartDraftAddToChecklist(
        rowKey,
        draftAddedKeys,
        addingDraftByKey,
        draftBulkProcessing,
      )
    ) {
      return;
    }
    setDraftErrorByKey((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setAddingDraftByKey((prev) => ({ ...prev, [rowKey]: true }));
    void (async () => {
      const result = await createChecklistItem({
        title: title.trim(),
        note,
      });
      setAddingDraftByKey((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
      if (!result.ok) {
        setDraftErrorByKey((prev) => ({ ...prev, [rowKey]: result.message }));
        return;
      }
      setDraftAddedKeys((prev) => new Set(prev).add(rowKey));
      setDraftSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
      setRefreshKey((k) => k + 1);
    })();
  };

  const handleBatchAddSelectedDrafts = async () => {
    if (
      !suggestResult ||
      suggestResult.mode !== "draft" ||
      draftBulkProcessing
    ) {
      return;
    }
    const targets = filterBatchDraftTargets(
      suggestResult.items,
      draftSelectedKeys,
      draftAddedKeys,
      addingDraftByKey,
    );
    if (targets.length === 0) return;

    setDraftBulkProcessing(true);
    setDraftBulkProgress({ current: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        setDraftBulkProgress({ current: i + 1, total: targets.length });
        setDraftErrorByKey((prev) => {
          const next = { ...prev };
          delete next[t.key];
          return next;
        });
        setAddingDraftByKey((prev) => ({ ...prev, [t.key]: true }));
        try {
          const result = await createChecklistItem({
            title: t.title.trim(),
            note: t.note,
          });
          if (!result.ok) {
            setDraftErrorByKey((prev) => ({
              ...prev,
              [t.key]: result.message,
            }));
          } else {
            setDraftAddedKeys((prev) => new Set(prev).add(t.key));
            setDraftSelectedKeys((prev) => {
              const next = new Set(prev);
              next.delete(t.key);
              return next;
            });
            setRefreshKey((k) => k + 1);
          }
        } finally {
          setAddingDraftByKey((prev) => {
            const next = { ...prev };
            delete next[t.key];
            return next;
          });
        }
      }
    } finally {
      setDraftBulkProcessing(false);
      setDraftBulkProgress(null);
    }
  };

  const aiPanelDisabled = listLoading || suggestLoading;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || listLoading}
          onClick={openCreate}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition-opacity hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
        >
          새 항목 추가
        </button>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!savingCreate) setCreateOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-create-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3
              id="checklist-create-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              새 체크리스트 항목
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              제목은 필수입니다. 저장 시 시트 맨 아래에 행이 추가됩니다.
            </p>
            <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              제목
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={savingCreate}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              메모 (선택)
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                disabled={savingCreate}
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingCreate}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                disabled={savingCreate}
                onClick={() => void handleSaveCreate()}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingCreate ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editItem ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!savingUpdate) setEditItem(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checklist-edit-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3
              id="checklist-edit-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              항목 수정
            </h3>
            <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              제목
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                disabled={savingUpdate}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              메모
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                disabled={savingUpdate}
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingUpdate}
                onClick={() => setEditItem(null)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                disabled={savingUpdate}
                onClick={handleSaveEdit}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingUpdate ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {listLoading ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 py-14 dark:border-zinc-700 dark:bg-zinc-900/40"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200"
            aria-hidden
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            목록 불러오는 중…
          </p>
        </div>
      ) : null}

      {!listLoading && state.kind === "error" ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40"
          role="alert"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            불러오기 실패
          </p>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
            {state.message}
          </p>
        </div>
      ) : null}

      {!listLoading && state.kind === "empty" ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            표시할 항목이 없습니다
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            완료된 항목은 목록에서 숨겨집니다.
          </p>
        </div>
      ) : null}

      {!listLoading && state.kind === "ready" ? (
        <div className="space-y-4">
          <section
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-4"
            aria-label="목록 필터"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-full text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:w-auto">
                빠른 필터
              </span>
              {(
                [
                  ["all", "전체"],
                  ["today", "오늘"],
                  ["active", "미완료"],
                  ["priority", "우선순위 높음"],
                  ["work", "작품별"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCheckFilter(id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    checkFilter === id
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {checkFilter === "work" ? (
              <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                작품명·키워드
                <input
                  type="search"
                  value={workFilter}
                  onChange={(e) => setWorkFilter(e.target.value)}
                  placeholder="예: 페니스, 미툰"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                정렬
                <select
                  value={checkSort}
                  onChange={(e) =>
                    setCheckSort(e.target.value as CheckSort)
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="recent">목록 순서</option>
                  <option value="title">제목순</option>
                  <option value="priority">우선순위순(휴리스틱)</option>
                </select>
              </label>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400 sm:max-w-md">
                검색
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="할 일·메모에서 검색"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              표시 {processedList.length}건 / 전체 {state.items.length}건 · 마감일·상태 열은
              API 확장 시 정확히 맞춥니다.
            </p>
          </section>

          {actionError ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
              role="alert"
            >
              {actionError}
            </div>
          ) : null}

          {processedList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
              조건에 맞는 항목이 없습니다. 필터·검색을 바꿔 보세요.
            </div>
          ) : (
            <ul
              className="list-none space-y-2"
              aria-label="체크리스트 항목"
            >
              {processedList.map((item) => (
                <li key={item.id}>
                  <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                          {checklistDisplayTitle(item)}
                        </p>
                        {itemLooksPriority(item) ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
                            우선
                          </span>
                        ) : null}
                        {itemMatchesToday(item) ? (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-950 dark:bg-sky-950/50 dark:text-sky-100">
                            오늘 언급
                          </span>
                        ) : null}
                      </div>
                      {item.note ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {item.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openEdit(item)}
                        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 transition-opacity hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(item)}
                        className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-800 transition-opacity hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-950/40"
                      >
                        {deletingId === item.id ? "삭제 중…" : "삭제"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleComplete(item.id)}
                        className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        {completingId === item.id ? "처리 중…" : "완료"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <section
            className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
            aria-labelledby="checklist-ai-heading"
          >
            <h2
              id="checklist-ai-heading"
              className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              보조 · AI 제안
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              홈 질문이 본류입니다. 여기 AI는 초안·정리용이며 시트에 자동 저장하지
              않습니다.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-zinc-600 dark:text-zinc-400">
                모드
                <select
                  value={suggestMode}
                  disabled={aiPanelDisabled}
                  onChange={(e) =>
                    setSuggestMode(e.target.value as SuggestMode)
                  }
                  className="ml-2 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="prioritize">우선순위 추천</option>
                  <option value="draft">새 항목 초안</option>
                </select>
              </label>
              <button
                type="button"
                disabled={aiPanelDisabled}
                onClick={() => void handleAiSuggest()}
                className="rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-opacity hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {suggestLoading ? "생성 중…" : "AI 추천 실행"}
              </button>
            </div>
            <label className="mt-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              추가 요청 (선택)
              <input
                type="text"
                value={suggestPrompt}
                disabled={aiPanelDisabled}
                onChange={(e) => setSuggestPrompt(e.target.value)}
                placeholder="예: 오늘 마감 위주로"
                className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            {suggestError ? (
              <p
                className="mt-2 text-sm text-red-700 dark:text-red-300"
                role="alert"
              >
                {suggestError}
              </p>
            ) : null}
            {suggestResult ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  요약
                </p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {suggestResult.summary}
                </p>
                {suggestResult.mode === "draft" && suggestResult.items.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        aiPanelDisabled ||
                        draftBulkProcessing ||
                        draftBatchTargets.length === 0
                      }
                      onClick={() => void handleBatchAddSelectedDrafts()}
                      className="rounded-lg border border-zinc-400 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      {draftBulkProcessing
                        ? `처리 중… (${draftBulkProgress?.current ?? 0}/${draftBulkProgress?.total ?? 0})`
                        : `선택한 항목 추가${draftBatchTargets.length > 0 ? ` (${draftBatchTargets.length})` : ""}`}
                    </button>
                  </div>
                ) : null}
                {suggestResult.items.length > 0 ? (
                  <ul className="mt-2 list-none space-y-2" aria-label="AI 제안 항목">
                    {suggestResult.items.map((it, idx) => {
                      const rowKey = draftSuggestItemKey(
                        idx,
                        it.title,
                        it.note,
                      );
                      const showAdd = showDraftAddToChecklist(suggestResult.mode);
                      const added = draftAddedKeys.has(rowKey);
                      const adding = Boolean(addingDraftByKey[rowKey]);
                      const rowErr = draftErrorByKey[rowKey];
                      const canSelect = canToggleDraftRowSelection(
                        rowKey,
                        draftAddedKeys,
                        addingDraftByKey,
                        draftBulkProcessing,
                      );
                      return (
                        <li
                          key={rowKey}
                          className="rounded-md border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/60"
                        >
                          {suggestResult.mode === "prioritize" ? (
                            <>
                              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                                {it.priority != null ? `${it.priority}. ` : ""}
                                {it.title}
                              </span>
                              {it.reason ? (
                                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                  {it.reason}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <div className="flex gap-3">
                              {showAdd ? (
                                <label
                                  className={
                                    canSelect
                                      ? "flex shrink-0 cursor-pointer items-start pt-0.5"
                                      : "flex shrink-0 cursor-not-allowed items-start pt-0.5 opacity-50"
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={draftSelectedKeys.has(rowKey)}
                                    disabled={!canSelect}
                                    onChange={(e) => {
                                      if (!canSelect) return;
                                      setDraftSelectedKeys((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(rowKey);
                                        else next.delete(rowKey);
                                        return next;
                                      });
                                    }}
                                    className="mt-0.5 rounded border-zinc-400"
                                    aria-label={`선택: ${it.title}`}
                                  />
                                </label>
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                                  {it.title}
                                </span>
                                {it.note ? (
                                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                    {it.note}
                                  </p>
                                ) : null}
                                {showAdd ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {added ? (
                                      <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                                        추가됨
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={adding || draftBulkProcessing}
                                        onClick={() =>
                                          handleAddDraftToChecklist(
                                            rowKey,
                                            it.title,
                                            it.note,
                                          )
                                        }
                                        className="rounded-md border border-zinc-400 bg-white px-2 py-1 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                      >
                                        {adding ? "추가 중…" : "이 항목 추가"}
                                      </button>
                                    )}
                                  </div>
                                ) : null}
                                {rowErr ? (
                                  <p
                                    className="mt-2 text-xs text-red-600 dark:text-red-400"
                                    role="alert"
                                  >
                                    {rowErr}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    제안 항목이 없습니다.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
