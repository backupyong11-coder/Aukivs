"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createUploadItem,
  deleteUploadItem,
  duplicateUploadIdsFromIssues,
  fetchUploads,
  nextEpisodeUpload,
  suggestUploadsAi,
  updateUploadItem,
  UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON,
  type UploadDuplicateIdIssue,
  type UploadItem,
  type UploadListItem,
  type UploadListIssue,
  type UploadRowSkippedIssue,
  type UploadSuggestResponse,
} from "@/lib/uploads";
import {
  UPLOAD_CARD_HIGHLIGHT_MS,
  UPLOAD_LIST_SCROLL_ROOT_ID,
  canUseAiDeleteButton,
  canUseAiNextEpisodeButton,
  findUploadItemById,
  resolveUidForExactUploadJump,
  scrollUploadListSectionIntoView,
  uploadIdIsListed,
  uploadListAnchorUid,
  uploadUidIsListed,
} from "@/lib/uploadsAiJump";
import { userFacingListError } from "@/lib/userFacingErrors";
import { UploadsAiAssistantPanel } from "@/components/UploadsAiAssistantPanel";

type UploadPreset =
  | "today"
  | "incomplete"
  | "overdue"
  | "data"
  | "dup"
  | "all";

function uploadLooksIncomplete(status: string | null): boolean {
  if (!status || !status.trim()) return true;
  const s = status.trim().toLowerCase();
  const done = ["완료", "완료됨", "완", "done", "complete", "ok"];
  return !done.some((x) => s === x || s.includes(x));
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isUploadToday(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const start = startOfTodayMs();
  return t >= start && t < start + 86400000;
}

function uploadIsOverdue(iso: string, status: string | null): boolean {
  if (!uploadLooksIncomplete(status)) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t < startOfTodayMs();
}

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; items: UploadListItem[]; issues: UploadListIssue[] };

function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function UploadsClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<UploadItem | null>(null);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftUploadedAt, setDraftUploadedAt] = useState("");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newUploadedAt, setNewUploadedAt] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [aiMode, setAiMode] = useState<"prioritize" | "review">("prioritize");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<UploadSuggestResponse | null>(null);
  const [highlightedUploadUid, setHighlightedUploadUid] = useState<string | null>(
    null,
  );
  const highlightTimerRef = useRef<number | null>(null);
  const pendingScrollToUploadUidAfterListRef = useRef<string | null>(null);
  const [uploadPreset, setUploadPreset] = useState<UploadPreset>("incomplete");

  const uploadIdsOnPage = useMemo(() => {
    if (state.kind !== "ready") return new Set<string>();
    return new Set(state.items.map((i) => i.id));
  }, [state]);

  const uploadUidsOnPage = useMemo(() => {
    if (state.kind !== "ready") return new Set<string>();
    return new Set(state.items.map((i) => i.uid));
  }, [state]);

  const duplicateIdIssues = useMemo((): UploadDuplicateIdIssue[] => {
    if (state.kind !== "ready") return [];
    return state.issues.filter((x): x is UploadDuplicateIdIssue => x.kind === "duplicate_id");
  }, [state]);

  const rowSkippedIssues = useMemo((): UploadRowSkippedIssue[] => {
    if (state.kind !== "ready") return [];
    return state.issues.filter((x): x is UploadRowSkippedIssue => x.kind === "row_skipped");
  }, [state]);

  const duplicateIdSet = useMemo(() => {
    if (state.kind !== "ready") return new Set<string>();
    return duplicateUploadIdsFromIssues(state.issues);
  }, [state]);

  const visibleItems = useMemo(() => {
    if (state.kind !== "ready") return [];
    const items = state.items;
    switch (uploadPreset) {
      case "all":
      case "data":
        return items;
      case "today":
        return items.filter((it) => isUploadToday(it.uploaded_at));
      case "incomplete":
        return items.filter((it) => uploadLooksIncomplete(it.status));
      case "overdue":
        return items.filter((it) =>
          uploadIsOverdue(it.uploaded_at, it.status),
        );
      case "dup":
        return items.filter((it) => duplicateIdSet.has(it.id));
      default:
        return items;
    }
  }, [state, uploadPreset, duplicateIdSet]);

  const clearUploadHighlight = useCallback(() => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    setHighlightedUploadUid(null);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const jumpToUploadCard = useCallback(
    (itemUid: string) => {
      if (!uploadUidIsListed(itemUid, uploadUidsOnPage)) return;
      const el = document.getElementById(uploadListAnchorUid(itemUid));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      setHighlightedUploadUid(itemUid);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedUploadUid(null);
        highlightTimerRef.current = null;
      }, UPLOAD_CARD_HIGHLIGHT_MS);
    },
    [uploadUidsOnPage],
  );

  const jumpToUploadFromAiSuggestion = useCallback(
    (uploadId: string) => {
      if (!uploadIdIsListed(uploadId, uploadIdsOnPage)) return;
      const uid = resolveUidForExactUploadJump(
        state.kind === "ready" ? state.items : [],
        uploadId,
        duplicateIdSet,
      );
      if (uid) {
        jumpToUploadCard(uid);
        return;
      }
      clearUploadHighlight();
      scrollUploadListSectionIntoView();
    },
    [
      uploadIdsOnPage,
      state,
      duplicateIdSet,
      jumpToUploadCard,
      clearUploadHighlight,
    ],
  );

  useEffect(() => {
    if (state.kind !== "ready") {
      if (state.kind === "error" || state.kind === "empty") {
        pendingScrollToUploadUidAfterListRef.current = null;
      }
      return;
    }
    const pending = pendingScrollToUploadUidAfterListRef.current;
    if (!pending) return;
    if (!state.items.some((i) => i.uid === pending)) {
      pendingScrollToUploadUidAfterListRef.current = null;
      return;
    }
    pendingScrollToUploadUidAfterListRef.current = null;
    const uid = pending;
    requestAnimationFrame(() => {
      jumpToUploadCard(uid);
    });
  }, [state, jumpToUploadCard]);

  const busy =
    savingUpdate ||
    savingCreate ||
    editItem !== null ||
    advancingId !== null ||
    deletingId !== null ||
    aiLoading;

  const loadList = useCallback(async (signal: AbortSignal, showSpinner: boolean) => {
    if (showSpinner) {
      setState({ kind: "loading" });
    }
    try {
      const result = await fetchUploads({ signal });
      if (signal.aborted) return;
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      if (result.items.length === 0 && result.issues.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({
        kind: "ready",
        items: result.items,
        issues: result.issues,
      });
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

  useEffect(() => {
    if (!editItem) return;
    if (duplicateIdSet.has(editItem.id)) {
      setEditItem(null);
    }
  }, [editItem, duplicateIdSet]);

  const openCreate = () => {
    setActionError(null);
    setNewTitle("");
    setNewFileName("");
    setNewUploadedAt("");
    setNewNote("");
    setNewStatus("");
    setCreateOpen(true);
  };

  const openEdit = useCallback(
    (item: UploadItem) => {
      if (duplicateIdSet.has(item.id)) return;
      setActionError(null);
      setEditItem(item);
      setDraftStatus(item.status ?? "");
      setDraftNote(item.note ?? "");
      setDraftUploadedAt(item.uploaded_at);
    },
    [duplicateIdSet],
  );

  const openEditByUploadId = useCallback(
    (uploadId: string) => {
      if (busy) return;
      if (state.kind !== "ready") return;
      if (duplicateIdSet.has(uploadId)) return;
      const item = findUploadItemById(state.items, uploadId);
      if (!item) return;
      const uid = resolveUidForExactUploadJump(
        state.items,
        uploadId,
        duplicateIdSet,
      );
      if (uid) jumpToUploadCard(uid);
      openEdit(item);
    },
    [busy, state, duplicateIdSet, jumpToUploadCard, openEdit],
  );

  const handleSaveCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      setActionError("[파싱] 제목은 비울 수 없습니다.");
      return;
    }
    const fn = newFileName.trim();
    const ua = newUploadedAt.trim();
    const nt = newNote.trim();
    const st = newStatus.trim();
    setActionError(null);
    setSavingCreate(true);
    try {
      const result = await createUploadItem({
        title,
        file_name: fn === "" ? null : fn,
        uploaded_at: ua === "" ? null : ua,
        note: nt === "" ? null : nt,
        status: st === "" ? null : st,
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
        e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.",
      );
    } finally {
      setSavingCreate(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    if (duplicateIdSet.has(editItem.id)) return;
    // POST /uploads/update·delete·next-episode 는 A열 id만 보냄. 동일 id가 여러 행이면 서버는 그중 한 행만 조작.
    const iso = draftUploadedAt.trim();
    if (!iso) {
      setActionError(
        "[파싱] 업로드 시각은 비울 수 없습니다. ISO 8601 형식으로 입력하세요.",
      );
      return;
    }
    const statusTrim = draftStatus.trim();
    const noteTrim = draftNote.trim();
    setActionError(null);
    setSavingUpdate(true);
    try {
      const result = await updateUploadItem({
        id: editItem.id,
        status: statusTrim === "" ? null : statusTrim,
        note: noteTrim === "" ? null : noteTrim,
        uploaded_at: iso,
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

  const executeDelete = useCallback(
    async (item: UploadItem) => {
      if (duplicateIdSet.has(item.id)) return;
      setActionError(null);
      setDeletingId(item.id);
      try {
        const result = await deleteUploadItem(item.id);
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        setEditItem((cur) => (cur?.id === item.id ? null : cur));
        clearUploadHighlight();
        setRefreshKey((k) => k + 1);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        setActionError(
          e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [clearUploadHighlight, duplicateIdSet],
  );

  const handleDelete = async (item: UploadItem) => {
    if (duplicateIdSet.has(item.id)) return;
    const ok = window.confirm(
      `"${item.title}" 항목을 시트에서 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!ok) return;
    await executeDelete(item);
  };

  const handleDeleteByUploadId = useCallback(
    (uploadId: string) => {
      if (busy) return;
      if (state.kind !== "ready") return;
      if (duplicateIdSet.has(uploadId)) return;
      const item = findUploadItemById(state.items, uploadId);
      if (!item) return;
      const uid = resolveUidForExactUploadJump(
        state.items,
        uploadId,
        duplicateIdSet,
      );
      if (uid) jumpToUploadCard(uid);
      const ok = window.confirm(
        `"${item.title}" 항목을 시트에서 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      );
      if (!ok) return;
      void executeDelete(item);
    },
    [busy, state, duplicateIdSet, jumpToUploadCard, executeDelete],
  );

  const handleAiSuggest = async () => {
    clearUploadHighlight();
    setAiError(null);
    setAiLoading(true);
    try {
      const promptTrim = aiPrompt.trim();
      const result = await suggestUploadsAi({
        mode: aiMode,
        prompt: promptTrim === "" ? null : promptTrim,
      });
      if (!result.ok) {
        setAiError(result.message);
        return;
      }
      setAiResult(result.data);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setAiError(
        e instanceof Error ? e.message : "AI 요청 중 오류가 발생했습니다.",
      );
    } finally {
      setAiLoading(false);
    }
  };

  const executeNextEpisode = useCallback(async (item: UploadItem) => {
    if (duplicateIdSet.has(item.id)) return;
    setActionError(null);
    setAdvancingId(item.id);
    try {
      const result = await nextEpisodeUpload(item.id);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      pendingScrollToUploadUidAfterListRef.current =
        "uid" in item ? (item as UploadListItem).uid : null;
      setRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setActionError(
        e instanceof Error
          ? e.message
          : "다음 회차 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setAdvancingId(null);
    }
  }, [duplicateIdSet]);

  const handleNextEpisode = async (item: UploadItem) => {
    if (duplicateIdSet.has(item.id)) return;
    const ok = window.confirm(
      `"${item.title}" 항목을 다음 회차 단계로 진행할까요? 상태와 업로드 시각(D열)이 갱신됩니다.`,
    );
    if (!ok) return;
    await executeNextEpisode(item);
  };

  const handleNextEpisodeByUploadId = useCallback(
    (uploadId: string) => {
      if (busy) return;
      if (state.kind !== "ready") return;
      if (duplicateIdSet.has(uploadId)) return;
      const item = findUploadItemById(state.items, uploadId);
      if (!item) return;
      const uid = resolveUidForExactUploadJump(
        state.items,
        uploadId,
        duplicateIdSet,
      );
      if (uid) jumpToUploadCard(uid);
      const ok = window.confirm(
        `"${item.title}" 항목을 다음 회차 단계로 진행할까요? 상태와 업로드 시각(D열)이 갱신됩니다.`,
      );
      if (!ok) return;
      void executeNextEpisode(item);
    },
    [busy, state, duplicateIdSet, jumpToUploadCard, executeNextEpisode],
  );

  const aiCanMutateUploadId = useCallback(
    (uploadId: string) =>
      uploadIdIsListed(uploadId, uploadIdsOnPage) && !duplicateIdSet.has(uploadId),
    [uploadIdsOnPage, duplicateIdSet],
  );

  return (
    <div className="mt-6 space-y-4">
      {state.kind === "ready" ? (
        <section
          className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:p-4"
          aria-label="업로드 보기 필터"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            무엇을 먼저 볼까요?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["today", "오늘 업로드"],
                ["incomplete", "미완료"],
                ["overdue", "지연"],
                ["data", "데이터 이상"],
                ["dup", "중복 id"],
                ["all", "전체 목록"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setUploadPreset(id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  uploadPreset === id
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
            <span className="tabular-nums">제외 행 {rowSkippedIssues.length}건</span>
            <span className="tabular-nums">중복 id {duplicateIdIssues.length}건</span>
            <span className="tabular-nums">
              표시 {visibleItems.length} / {state.items.length}건
            </span>
            {duplicateIdIssues.length > 0 ? (
              <span className="text-rose-800 dark:text-rose-200">
                중복 id 행은 수정·삭제·다음 회차가 제한됩니다.
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={openCreate}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          새 업로드 추가
        </button>
      </div>

      {state.kind === "ready" && duplicateIdIssues.length > 0 ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/35"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-rose-950 dark:text-rose-100">
            일부 업로드 id가 중복되어 있어 수정·삭제·다음 회차 액션 대상이 모호할 수 있습니다
          </p>
          <p className="mt-1 text-xs text-rose-900/90 dark:text-rose-200/85">
            목록은 행마다 구분되어 보이지만, API는 A열 id 하나만 받습니다. 서버는 같은 id가 여러
            행일 때 그중 한 행만 조작합니다. 아래 카드에{" "}
            <span className="font-semibold text-rose-950 dark:text-rose-100">중복 id</span>{" "}
            배지가 붙은 항목은 수정·삭제·다음 회차 버튼이 비활성화됩니다. 시트에서 id를 유일하게 맞추세요.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-rose-950 dark:text-rose-50">
            {duplicateIdIssues.map((iss, i) => (
              <li key={`dup-id-${iss.id}-${i}`}>
                <span className="font-mono text-xs">{iss.id}</span>
                <span className="tabular-nums">
                  {" "}
                  (행 {iss.sheet_rows.join(", ")})
                </span>
                : {iss.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === "ready" && rowSkippedIssues.length > 0 ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/55 dark:bg-amber-950/30"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            일부 시트 행은 필수 열 누락 등으로 목록에서 제외되었습니다
          </p>
          <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/85">
            제외된 행은 이 화면에서 수정·삭제·다음 회차 대상이 아닙니다. 시트를 고친 뒤 목록을
            새로고침하세요.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-950 dark:text-amber-50">
            {rowSkippedIssues.map((iss, i) => (
              <li key={`upload-skip-${iss.sheet_row}-${i}`}>
                <span className="tabular-nums">행 {iss.sheet_row}</span>: {iss.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}


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
            aria-labelledby="uploads-create-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3
              id="uploads-create-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              새 업로드 추가
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              제목(B열)은 필수입니다. 파일명·시각을 비우면 시트에 기본값이 들어갑니다.
            </p>
            <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              제목 (B열) <span className="text-red-600 dark:text-red-400">*</span>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={savingCreate}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              파일명 (C열, 선택)
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                disabled={savingCreate}
                placeholder="비우면 “(파일명 미입력)”"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              업로드 시각 (D열, ISO, 선택)
              <input
                type="text"
                value={newUploadedAt}
                onChange={(e) => setNewUploadedAt(e.target.value)}
                disabled={savingCreate}
                placeholder="비우면 서버 시각(서울)"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              메모 (E열, 선택)
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                disabled={savingCreate}
                rows={2}
                className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              상태 (F열, 선택)
              <input
                type="text"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                disabled={savingCreate}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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
                onClick={handleSaveCreate}
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
            aria-labelledby="uploads-edit-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3
              id="uploads-edit-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              항목 수정
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              제목·파일명은 시트 A·B·C열이라 여기서 바꾸지 않습니다. 상태·메모·업로드
              시각만 갱신합니다.
            </p>
            <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              상태 (F열)
              <input
                type="text"
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
                disabled={savingUpdate}
                placeholder="비우면 F열 삭제"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              메모 (E열)
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                disabled={savingUpdate}
                rows={3}
                placeholder="비우면 E열 삭제"
                className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              업로드 시각 (D열, ISO 8601)
              <input
                type="text"
                value={draftUploadedAt}
                onChange={(e) => setDraftUploadedAt(e.target.value)}
                disabled={savingUpdate}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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

      {actionError ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      {state.kind === "loading" ? (
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
            업로드 목록 불러오는 중…
          </p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40"
          role="alert"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            업로드 목록을 불러오지 못했습니다
          </p>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
            {userFacingListError("uploads", state.message)}
          </p>
          <p className="mt-2 text-xs text-red-800/90 dark:text-red-200/90">
            시트 열 구성·백엔드 로그를 확인하세요. 형식 오류면 어떤 행이 문제인지
            복구 후 다시 불러오기를 시도하면 됩니다.
          </p>
        </div>
      ) : null}

      {state.kind === "empty" ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            업로드된 항목이 없습니다
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            위 버튼으로 추가하거나 시트에 행을 넣으면 여기에 표시됩니다.
          </p>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        state.items.length === 0 ? (
          <div
            id={UPLOAD_LIST_SCROLL_ROOT_ID}
            className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              파싱 가능한 업로드 행이 없습니다
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {state.issues.length > 0
                ? "위 경고 상자의 제외·중복 사유를 확인하고 시트를 수정한 뒤 다시 불러오세요."
                : "시트에 데이터 행이 없거나 모두 비어 있습니다."}
            </p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div
            id={UPLOAD_LIST_SCROLL_ROOT_ID}
            className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-8 text-center dark:border-zinc-600 dark:bg-zinc-900/40"
          >
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              이 필터에 맞는 행이 없습니다
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              상단에서 「전체 목록」 또는 다른 필터로 바꿔 보세요.
            </p>
          </div>
        ) : (
        <ul
          id={UPLOAD_LIST_SCROLL_ROOT_ID}
          className="grid list-none gap-3 sm:grid-cols-2 sm:gap-4"
          aria-label="업로드 목록"
        >
          {visibleItems.map((item) => {
            const isDupId = duplicateIdSet.has(item.id);
            return (
            <li key={item.uid}>
              <article
                id={uploadListAnchorUid(item.uid)}
                className={`flex h-full flex-col rounded-xl border bg-white p-4 shadow-sm transition-[box-shadow,ring] duration-300 hover:shadow-md dark:bg-zinc-950 ${
                  highlightedUploadUid === item.uid
                    ? "border-amber-400 ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-50 dark:border-amber-500 dark:ring-amber-400 dark:ring-offset-zinc-950"
                    : isDupId
                      ? "border-rose-300 ring-1 ring-rose-200/90 dark:border-rose-800 dark:ring-rose-900/60"
                      : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                    {item.title}
                  </h2>
                  {isDupId ? (
                    <span
                      className="inline-flex shrink-0 items-center rounded-md border border-rose-400 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-950 dark:border-rose-600 dark:bg-rose-950/70 dark:text-rose-100"
                      title={UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON}
                    >
                      중복 id
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {item.file_name}
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                  {formatUploadedAt(item.uploaded_at)}
                </p>
                {item.status ? (
                  <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    상태: {item.status}
                  </p>
                ) : null}
                {item.note ? (
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {item.note}
                  </p>
                ) : null}
                {isDupId ? (
                  <p className="mt-2 text-xs leading-relaxed text-rose-800 dark:text-rose-200/90">
                    위쪽 로즈색 안내와 같이 이 id가 시트에서 중복입니다. 수정·삭제·다음 회차는
                    비활성화되었습니다.
                  </p>
                ) : null}
                <div className="mt-3 flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || isDupId}
                    title={isDupId ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON : undefined}
                    onClick={() => openEdit(item)}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition-opacity hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
                  >
                    수정
                  </button>
                <button
                  type="button"
                  disabled={busy || isDupId}
                  title={isDupId ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON : undefined}
                  onClick={() => handleNextEpisode(item)}
                  className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 transition-opacity hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                >
                  {advancingId === item.id ? "처리 중…" : "다음 회차"}
                </button>
                <button
                  type="button"
                  disabled={busy || isDupId}
                  title={isDupId ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON : undefined}
                  onClick={() => handleDelete(item)}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 transition-opacity hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-900/40"
                >
                  {deletingId === item.id ? "삭제 중…" : "삭제"}
                </button>
              </div>
              </article>
            </li>
            );
          })}
        </ul>
        )
      ) : null}

      {state.kind === "ready" && state.items.length > 0 ? (
        <UploadsAiAssistantPanel
          busy={busy}
          aiMode={aiMode}
          onAiModeChange={(m) => {
            clearUploadHighlight();
            setAiMode(m);
            setAiResult(null);
          }}
          aiPrompt={aiPrompt}
          setAiPrompt={setAiPrompt}
          aiLoading={aiLoading}
          aiError={aiError}
          aiResult={aiResult}
          onSuggest={() => void handleAiSuggest()}
          clearUploadHighlight={clearUploadHighlight}
          uploadIdsOnPage={uploadIdsOnPage}
          duplicateIdSet={duplicateIdSet}
          jumpToUploadFromAiSuggestion={jumpToUploadFromAiSuggestion}
          openEditByUploadId={openEditByUploadId}
          handleNextEpisodeByUploadId={handleNextEpisodeByUploadId}
          handleDeleteByUploadId={handleDeleteByUploadId}
          advancingId={advancingId}
          deletingId={deletingId}
          aiCanMutateUploadId={aiCanMutateUploadId}
        />
      ) : null}
    </div>
  );
}
