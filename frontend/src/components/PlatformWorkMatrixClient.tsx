"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPlatformRow,
  fetchPlatformRowsLookup,
  findPlatformRowByLabel,
  PLATFORM_MATRIX_CREATE_FIELDS,
  PLATFORM_MATRIX_EDIT_FIELDS,
  platformRowToEditForm,
  updatePlatformRow,
  type PlatformRowRecord,
} from "@/lib/platformRowsMutate";
import { fetchPlatformMatrixBootstrap } from "@/lib/platformMatrixBootstrap";
import type { PlatformMasterItem } from "@/lib/platformMaster";
import {
  createWorksMasterRow,
  updateWorksMasterRow,
  WORK_MATRIX_FIELDS,
} from "@/lib/worksMasterMutate";
import {
  fetchPlatformMatrixPreferences,
  savePlatformMatrixPreferences,
} from "@/lib/platformMatrixPreferencesApi";
import {
  fetchWorksMasterPreferences,
} from "@/lib/worksMasterPreferencesApi";
import { mergeWorkGenreOptions, WORK_GENRE_FIELD } from "@/lib/worksGenre";
import type { WorksMasterItem } from "@/lib/worksMaster";
import {
  buildPlatformWorkMatrix,
  clearMatrixColumnOrder,
  clearMatrixHiddenColumns,
  clearMatrixRowOrder,
  getMatrixCellOverride,
  loadMatrixCellOverrides,
  loadMatrixHiddenColumns,
  loadMatrixColumnOrder,
  loadMatrixRowOrder,
  reorderPlatformWorkMatrix,
  reorderPlatformWorkMatrixRows,
  saveMatrixColumnOrder,
  saveMatrixHiddenColumns,
  saveMatrixRowOrder,
  setMatrixCellOverride,
  type MatrixCellKind,
} from "@/lib/platformWorkMatrix";

const inputCls =
  "mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

function emptyForm(fields: { key: string }[]): Record<string, string> {
  const f: Record<string, string> = {};
  fields.forEach(({ key }) => {
    f[key] = "";
  });
  return f;
}

function workToForm(w: WorksMasterItem): Record<string, string> {
  const f = emptyForm(WORK_MATRIX_FIELDS);
  WORK_MATRIX_FIELDS.forEach(({ key }) => {
    f[key] = String(w[key] ?? "").trim();
  });
  return f;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; emptyHint: string };

function platformDisplayName(p: PlatformMasterItem): string {
  return (p["플랫폼명"] ?? p["회사명"] ?? "").trim();
}

function optFirst(item: PlatformMasterItem | null, keys: string[]): string {
  if (!item) return "";
  for (const k of keys) {
    const v = (item[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function MatrixIcon({ kind }: { kind: MatrixCellKind }) {
  if (kind === "active") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm"
        title="런칭·연재 중"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (kind === "progress") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm"
        title="업로드·세팅 진행"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.06-.68-1.66-.87l-.36-2.54c-.04-.24-.25-.41-.5-.41h-3.84c-.24 0-.45.17-.49.41l-.36 2.54c-.6.19-1.16.49-1.66.87l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.06.68 1.66.87l.36 2.54c.05.24.25.41.5.41h3.84c.24 0 .45-.17.49-.41l.36-2.54c.6-.19 1.16-.49 1.66-.87l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
      </span>
    );
  }
  if (kind === "early") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-300 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200"
        title="대기·계약 단계"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (kind === "blocked") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm"
        title="불가"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="8" />
          <path d="M8 8l8 8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return <span className="inline-block h-7 w-7" aria-hidden />;
}

export function PlatformWorkMatrixClient() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  /** null → localStorage(또는 기본 모델 순서); 비-null → 방금 조작한 순서 */
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);
  const [rowOrder, setRowOrder] = useState<string[] | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set());
  const [colDragOver, setColDragOver] = useState<string | null>(null);
  const [rowDragOver, setRowDragOver] = useState<string | null>(null);

  const [model, setModel] = useState<ReturnType<typeof buildPlatformWorkMatrix> | null>(null);
  const [platformRows, setPlatformRows] = useState<PlatformRowRecord[]>([]);
  const [worksItems, setWorksItems] = useState<WorksMasterItem[]>([]);
  const [platformMasterItems, setPlatformMasterItems] = useState<PlatformMasterItem[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [workCreateOpen, setWorkCreateOpen] = useState(false);
  const [workEditTitle, setWorkEditTitle] = useState<string | null>(null);
  const [workForm, setWorkForm] = useState<Record<string, string>>(() => emptyForm(WORK_MATRIX_FIELDS));
  const [workSaving, setWorkSaving] = useState(false);
  const [platformCreateOpen, setPlatformCreateOpen] = useState(false);
  const [platformEditLabel, setPlatformEditLabel] = useState<string | null>(null);
  const [platformEditId, setPlatformEditId] = useState<string | null>(null);
  const [platformEditRow, setPlatformEditRow] = useState<PlatformRowRecord | null>(null);
  const [platformForm, setPlatformForm] = useState<Record<string, string>>(() =>
    emptyForm(PLATFORM_MATRIX_CREATE_FIELDS),
  );
  const [platformSaving, setPlatformSaving] = useState(false);
  const [cellOverrides, setCellOverrides] = useState<Record<string, "blocked">>(() => ({}));
  const [workGenres, setWorkGenres] = useState<string[]>([]);
  const [genreSavingTitle, setGenreSavingTitle] = useState<string | null>(null);

  useEffect(() => {
    setCellOverrides(loadMatrixCellOverrides());
    setHiddenCols(new Set(loadMatrixHiddenColumns()));
    void (async () => {
      const res = await fetchPlatformMatrixPreferences();
      if (!res.ok) return;
      setColumnOrder(res.preferences.columnOrder.length > 0 ? res.preferences.columnOrder : null);
      setRowOrder(res.preferences.rowOrder.length > 0 ? res.preferences.rowOrder : null);
      setHiddenCols(new Set(res.preferences.hiddenColumns));
      saveMatrixColumnOrder(res.preferences.columnOrder);
      saveMatrixRowOrder(res.preferences.rowOrder);
      saveMatrixHiddenColumns(res.preferences.hiddenColumns);
    })();
    void (async () => {
      const res = await fetchWorksMasterPreferences();
      setWorkGenres(res.workGenres);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setLoad({ kind: "loading" });
      try {
        const boot = await fetchPlatformMatrixBootstrap();
        if (!boot.ok) {
          setLoad({ kind: "error", message: boot.message });
          setModel(null);
          setPlatformRows([]);
          setWorksItems([]);
          setPlatformMasterItems([]);
          return;
        }
        setWorksItems(boot.data.worksMaster);
        setPlatformMasterItems(boot.data.platformMaster);
        setPlatformRows([]);
        const m = buildPlatformWorkMatrix(boot.data.worksMaster, boot.data.platformMaster);
        let emptyHint = "";
        if (m.columns.length === 0) {
          emptyHint = "플랫폼 열이 없습니다. 플랫폼정리에 플랫폼명(또는 회사명)이 있는지 확인하세요.";
        } else if (m.rows.length === 0) {
          emptyHint = "작품 행이 없습니다. 작품정리에 작품명이 있는지 확인하세요.";
        }
        setModel(m);
        setLoad({ kind: "ready", emptyHint });
      } catch (e) {
        setModel(null);
        setLoad({
          kind: "error",
          message: e instanceof Error ? e.message : "불러오기 실패",
        });
        setPlatformMasterItems([]);
      }
    })();
  }, [refreshKey]);

  const displayModel = useMemo(() => {
    if (!model) return null;
    const preferred = columnOrder ?? loadMatrixColumnOrder();
    const ordered = reorderPlatformWorkMatrix(model, preferred);
    const preferredRows = rowOrder ?? loadMatrixRowOrder();
    const orderedRows = reorderPlatformWorkMatrixRows(ordered, preferredRows);
    if (hiddenCols.size === 0) return orderedRows;
    const keepIndexes: number[] = [];
    orderedRows.columns.forEach((c, i) => {
      if (!hiddenCols.has(c.label)) keepIndexes.push(i);
    });
    if (keepIndexes.length === orderedRows.columns.length) return orderedRows;
    return {
      columns: keepIndexes.map((i) => orderedRows.columns[i]!),
      rows: orderedRows.rows.map((r) => ({
        title: r.title,
        genre: r.genre,
        cells: keepIndexes.map((i) => r.cells[i] ?? "none"),
      })),
    };
  }, [model, columnOrder, rowOrder, hiddenCols]);

  const persistPlatformPrefs = useCallback((order: string[] | null, hidden: Set<string>, rows: string[] | null = rowOrder) => {
    const columnOrderToSave = order ?? loadMatrixColumnOrder();
    const rowOrderToSave = rows ?? loadMatrixRowOrder();
    const hiddenColumns = Array.from(hidden);
    saveMatrixColumnOrder(columnOrderToSave);
    saveMatrixRowOrder(rowOrderToSave);
    saveMatrixHiddenColumns(hiddenColumns);
    void savePlatformMatrixPreferences({
      columnOrder: columnOrderToSave,
      hiddenColumns,
      rowOrder: rowOrderToSave,
    });
  }, [rowOrder]);

  const movePlatformColumn = useCallback((idx: number, edge: "start" | "end") => {
    if (!displayModel) return;
    const labels = displayModel.columns.map((c) => c.label);
    if (idx < 0 || idx >= labels.length) return;
    if (edge === "start" && idx === 0) return;
    if (edge === "end" && idx === labels.length - 1) return;
    const next = [...labels];
    const [moved] = next.splice(idx, 1);
    if (!moved) return;
    if (edge === "start") next.unshift(moved);
    else next.push(moved);
    setColumnOrder(next);
    persistPlatformPrefs(next, hiddenCols);
  }, [displayModel, hiddenCols, persistPlatformPrefs]);

  const resetColumnOrder = useCallback(() => {
    clearMatrixColumnOrder();
    setColumnOrder(null);
    persistPlatformPrefs([], hiddenCols);
  }, [hiddenCols, persistPlatformPrefs]);

  const moveWorkRowTo = useCallback((idx: number, edge: "start" | "end") => {
    if (!displayModel) return;
    const titles = displayModel.rows.map((r) => r.title);
    if (idx < 0 || idx >= titles.length) return;
    if (edge === "start" && idx === 0) return;
    if (edge === "end" && idx === titles.length - 1) return;
    const next = [...titles];
    const [moved] = next.splice(idx, 1);
    if (!moved) return;
    if (edge === "start") next.unshift(moved);
    else next.push(moved);
    setRowOrder(next);
    persistPlatformPrefs(columnOrder, hiddenCols, next);
  }, [columnOrder, displayModel, hiddenCols, persistPlatformPrefs]);

  const resetRowOrder = useCallback(() => {
    clearMatrixRowOrder();
    setRowOrder(null);
    persistPlatformPrefs(columnOrder, hiddenCols, []);
  }, [columnOrder, hiddenCols, persistPlatformPrefs]);

  const resetHiddenColumns = useCallback(() => {
    clearMatrixHiddenColumns();
    const next = new Set<string>();
    setHiddenCols(next);
    persistPlatformPrefs(columnOrder, next);
  }, [columnOrder, persistPlatformPrefs]);

  const hideColumn = useCallback((label: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      next.add(label);
      persistPlatformPrefs(columnOrder, next);
      return next;
    });
  }, [columnOrder, persistPlatformPrefs]);

  const unhideColumn = useCallback((label: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      next.delete(label);
      persistPlatformPrefs(columnOrder, next);
      return next;
    });
  }, [columnOrder, persistPlatformPrefs]);

  const colCount = displayModel?.columns.length ?? 0;
  const [openCards, setOpenCards] = useState<Set<string>>(() => new Set());

  const platformByLabel = useMemo(() => {
    const m = new Map<string, PlatformMasterItem>();
    for (const p of platformMasterItems) {
      const name = platformDisplayName(p);
      if (!name) continue;
      if (!m.has(name)) m.set(name, p);
    }
    return m;
  }, [platformMasterItems]);

  const platformCards = useMemo(() => {
    if (!displayModel) return [];
    const totalWorks = displayModel.rows.length;
    return displayModel.columns.map((c, colIdx) => {
      let active = 0;
      let progress = 0;
      let early = 0;
      let none = 0;
      for (const r of displayModel.rows) {
        const k = r.cells[colIdx] ?? "none";
        if (k === "active") active += 1;
        else if (k === "progress") progress += 1;
        else if (k === "early") early += 1;
        else none += 1;
      }
      return {
        label: c.label,
        active,
        progress,
        early,
        none,
        totalWorks,
      };
    });
  }, [displayModel]);

  const effectiveCellKind = useCallback(
    (workTitle: string, platformLabel: string, base: MatrixCellKind): MatrixCellKind => {
      const ov = getMatrixCellOverride(cellOverrides, workTitle, platformLabel);
      return ov === "blocked" ? "blocked" : base;
    },
    [cellOverrides],
  );

  const openWorkEdit = (title: string) => {
    const w = worksItems.find((x) => (x["작품명"] ?? "").trim() === title.trim());
    setActionError(null);
    setWorkEditTitle(title);
    setWorkForm(w ? workToForm(w) : { ...emptyForm(WORK_MATRIX_FIELDS), 작품명: title });
  };

  const openPlatformEdit = (label: string) => {
    void (async () => {
      setActionError(null);
      let rows = platformRows;
      if (rows.length === 0) {
        try {
          rows = await fetchPlatformRowsLookup();
          setPlatformRows(rows);
        } catch {
          setActionError("플랫폼정리 행을 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
          return;
        }
      }
      const row = findPlatformRowByLabel(rows, label);
      if (!row) {
        setActionError(
          `「${label}」에 해당하는 플랫폼정리 행을 찾지 못했습니다. 플랫폼정리 메뉴에서 먼저 추가하세요.`,
        );
        return;
      }
      setPlatformEditLabel(label);
      setPlatformEditId(row.id);
      setPlatformEditRow(row);
      setPlatformForm(platformRowToEditForm(row));
    })();
  };

  const genreOptions = useMemo(
    () => mergeWorkGenreOptions(workGenres, worksItems),
    [workGenres, worksItems],
  );

  const handleWorkGenreChange = async (title: string, genre: string) => {
    setGenreSavingTitle(title);
    setActionError(null);
    const r = await updateWorksMasterRow({ originalTitle: title }, {
      작품명: title,
      [WORK_GENRE_FIELD]: genre,
    });
    setGenreSavingTitle(null);
    if (!r.ok) {
      setActionError(r.message);
      return;
    }
    setRefreshKey((k) => k + 1);
  };

  const handleWorkSave = async () => {
    setWorkSaving(true);
    setActionError(null);
    const title = workForm["작품명"]?.trim() ?? "";
    if (!title) {
      setActionError("작품명을 입력하세요.");
      setWorkSaving(false);
      return;
    }
    const r = workEditTitle
      ? await updateWorksMasterRow({ originalTitle: workEditTitle }, workForm)
      : await createWorksMasterRow(workForm);
    setWorkSaving(false);
    if (!r.ok) {
      setActionError(r.message);
      return;
    }
    setWorkCreateOpen(false);
    setWorkEditTitle(null);
    setRefreshKey((k) => k + 1);
  };

  const handlePlatformSave = async () => {
    setPlatformSaving(true);
    setActionError(null);
    const r = platformEditId
      ? await updatePlatformRow(platformEditId, platformForm, platformEditRow ?? undefined)
      : await createPlatformRow(platformForm);
    setPlatformSaving(false);
    if (!r.ok) {
      setActionError(r.message);
      return;
    }
    setPlatformCreateOpen(false);
    setPlatformEditLabel(null);
    setPlatformEditId(null);
    setPlatformEditRow(null);
    setRefreshKey((k) => k + 1);
  };

  const workModalOpen = workCreateOpen || workEditTitle !== null;
  const platformModalOpen = platformCreateOpen || platformEditLabel !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          작품 DB(작품정리)와 연동됩니다. 분류·작품명·사이트 열을 편집하면 매트릭스에 반영됩니다.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setColumnOrder(null);
              setRefreshKey((k) => k + 1);
            }}
            disabled={load.kind === "loading"}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {load.kind === "loading" ? "불러오는 중…" : "새로고침"}
          </button>
          <button
            type="button"
            onClick={resetColumnOrder}
            disabled={load.kind === "loading" || colCount === 0}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            title="플랫폼 열 순서를 가나다 기본 순서로 되돌립니다."
          >
            열 순서 초기화
          </button>
          <button
            type="button"
            onClick={resetRowOrder}
            disabled={load.kind === "loading" || (displayModel?.rows.length ?? 0) === 0}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            title="작품명 행 순서를 작품정리 기본 순서로 되돌립니다."
          >
            작품 순서 초기화
          </button>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setWorkForm(emptyForm(WORK_MATRIX_FIELDS));
              setWorkCreateOpen(true);
              setWorkEditTitle(null);
            }}
            disabled={load.kind === "loading"}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            작품 추가
          </button>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setPlatformForm(emptyForm(PLATFORM_MATRIX_CREATE_FIELDS));
              setPlatformCreateOpen(true);
              setPlatformEditLabel(null);
              setPlatformEditId(null);
              setPlatformEditRow(null);
            }}
            disabled={load.kind === "loading"}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            플랫폼 추가
          </button>
        </div>
      </div>

      {actionError && !workModalOpen && !platformModalOpen ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <MatrixIcon kind="active" />
          런칭·연재
        </span>
        <span className="inline-flex items-center gap-2">
          <MatrixIcon kind="progress" />
          업로드·세팅
        </span>
        <span className="inline-flex items-center gap-2">
          <MatrixIcon kind="early" />
          대기·계약
        </span>
      </div>

      {load.kind === "ready" && displayModel && colCount > 0 ? (
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3 px-1">
            {platformCards.map((s) => {
              const touched = s.active + s.progress + s.early;
              const p = platformByLabel.get(s.label) ?? null;
              const lastStatus = optFirst(p, ["마지막상황", "마지막 상황", "최근상황", "최근 상황", "상황"]);
              const nextAction = optFirst(p, ["다음액션", "다음 액션", "다음행동", "다음 행동"]);
              const managerName = optFirst(p, ["담당자명", "담당자"]);
              const managerEmail = optFirst(p, ["담당자이메일", "담당자 이메일", "이메일"]);
              const contact = optFirst(p, ["연락수단/연락처", "연락수단연락처", "연락처"]);
              const bannerSpec = optFirst(p, ["배너 규격", "배너규격", "배너사이즈", "배너 사이즈"]);
              const thumbSpec = optFirst(p, ["썸네일 규격", "썸네일규격", "썸네일사이즈", "썸네일 사이즈", "thumbnail"]);
              const manuscriptSpec = optFirst(p, ["원고 규격", "원고규격", "원고사이즈", "원고 사이즈"]);
              const uploadMethod = optFirst(p, ["업로드방식", "업로드 방식", "업로드"]);
              const settlement = optFirst(p, ["정산방식", "정산 방식", "정산"]);
              const ownCoin = optFirst(p, ["업체별 소장 코인", "소장 코인", "소장코인", "소장"]);
              const rentCoin = optFirst(p, ["업체별 대여 코인", "대여 코인", "대여코인", "대여"]);
              const opened = openCards.has(s.label);
              const hasAny = touched > 0;
              return (
                <div key={`card-${s.label}`} className="w-[18rem] shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCards((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.label)) next.delete(s.label);
                        else next.add(s.label);
                        return next;
                      })
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{s.label}</p>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {touched}/{s.totalWorks}
                          </span>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            런칭·연재{" "}
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{s.active}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                            업로드·세팅{" "}
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{s.progress}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                            대기·계약{" "}
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{s.early}</span>
                          </span>
                        </p>
                      </div>
                      <span className="shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden>
                        {opened ? "▾" : "▸"}
                      </span>
                    </div>

                    {opened ? (
                      <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                        {hasAny ? (
                          <>
                            <div className="grid gap-2">
                              {lastStatus ? (
                                <div>
                                  <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">마지막상황</p>
                                  <p className="mt-0.5 whitespace-pre-wrap">{lastStatus}</p>
                                </div>
                              ) : null}
                              {nextAction ? (
                                <div>
                                  <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">다음액션</p>
                                  <p className="mt-0.5 whitespace-pre-wrap">{nextAction}</p>
                                </div>
                              ) : null}
                              {(managerName || managerEmail || contact) ? (
                                <div>
                                  <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">담당자</p>
                                  <p className="mt-0.5">
                                    {[managerName, managerEmail, contact].filter(Boolean).join(" · ") || "—"}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            <div className="grid gap-1.5 pt-1">
                              <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">규격·정산</p>
                              <p>배너 규격: {bannerSpec || "—"}</p>
                              <p>썸네일 규격: {thumbSpec || "—"}</p>
                              <p>원고 규격: {manuscriptSpec || "—"}</p>
                              <p>업로드방식: {uploadMethod || "—"}</p>
                              <p>정산방식: {settlement || "—"}</p>
                              <p>업체별 소장 코인: {ownCoin || "—"}</p>
                              <p>업체별 대여 코인: {rentCoin || "—"}</p>
                            </div>
                          </>
                        ) : (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
                            런칭·연재/업로드·세팅/대기·계약 연결이 없는 플랫폼입니다.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {load.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {load.message}
        </div>
      )}

      {load.kind === "loading" && (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          매트릭스 구성 중…
        </div>
      )}

      {load.kind === "ready" && displayModel && colCount > 0 && displayModel.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <p className="border-b border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            플랫폼 열과 작품명 행은 드래그로 옮길 수 있고, 머리글에서 숨길 수 있습니다. 순서와 숨김은 웹에 저장됩니다.
          </p>
          {hiddenCols.size > 0 ? (
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              숨김:{" "}
              {Array.from(hiddenCols)
                .sort((a, b) => a.localeCompare(b, "ko"))
                .slice(0, 12)
                .map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => unhideColumn(l)}
                    className="mx-0.5 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    title="클릭: 다시 표시"
                  >
                    {l} ✕
                  </button>
                ))}
              {hiddenCols.size > 12 ? <span className="ml-1 text-zinc-400">+{hiddenCols.size - 12}</span> : null}
              <button
                type="button"
                onClick={resetHiddenColumns}
                className="ml-2 rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                숨김 초기화
              </button>
            </div>
          ) : null}
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="sticky left-0 z-20 min-w-[5.5rem] border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  <span className="block px-1">분류</span>
                </th>
                <th className="sticky left-[5.5rem] z-20 min-w-[11rem] border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  <span className="block px-1">작품명</span>
                </th>
                {displayModel.columns.map((c, colIdx) => {
                  const thMoveBtn =
                    "rounded border border-zinc-200 bg-white px-0.5 py-0 text-[8px] leading-none text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800";
                  return (
                    <th
                      key={c.label}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-platform-col", c.label);
                        e.dataTransfer.setData("text/plain", c.label);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setColDragOver(c.label);
                      }}
                      onDragLeave={() => setColDragOver(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const drag =
                          e.dataTransfer.getData("application/x-platform-col") ||
                          e.dataTransfer.getData("text/plain");
                        setColDragOver(null);
                        const dragLabel = (drag || "").trim();
                        if (!dragLabel || dragLabel === c.label) return;
                        const labels = displayModel.columns.map((x) => x.label);
                        const fromIdx = labels.indexOf(dragLabel);
                        const toIdx = labels.indexOf(c.label);
                        if (fromIdx < 0 || toIdx < 0) return;
                        const next = [...labels];
                        next.splice(fromIdx, 1);
                        next.splice(toIdx, 0, dragLabel);
                        setColumnOrder(next);
                        persistPlatformPrefs(next, hiddenCols);
                      }}
                      className={`min-w-[6rem] border-l border-zinc-200 align-top dark:border-zinc-700 ${
                        colDragOver === c.label ? "ring-2 ring-emerald-500 ring-inset" : ""
                      }`}
                    >
                      <div className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-1.5">
                        <span className="text-center text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                          {c.label}
                        </span>
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openPlatformEdit(c.label)}
                            className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            편집
                          </button>
                          <button
                            type="button"
                            onClick={() => hideColumn(c.label)}
                            className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            title="이 플랫폼 열 숨기기"
                          >
                            숨김
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            className={thMoveBtn}
                            aria-label={`${c.label} 열을 맨 왼쪽으로`}
                            title="맨 왼쪽으로"
                            disabled={colIdx === 0}
                            onClick={() => movePlatformColumn(colIdx, "start")}
                          >
                            ◀◀
                          </button>
                          <button
                            type="button"
                            className={thMoveBtn}
                            aria-label={`${c.label} 열을 맨 오른쪽으로`}
                            title="맨 오른쪽으로"
                            disabled={colIdx === displayModel.columns.length - 1}
                            onClick={() => movePlatformColumn(colIdx, "end")}
                          >
                            ▶▶
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayModel.rows.map((row, ri) => (
                <tr
                  key={`${ri}-${row.title}`}
                  className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-1.5 py-2 text-left dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <select
                      value={row.genre}
                      disabled={genreSavingTitle === row.title}
                      onChange={(e) => void handleWorkGenreChange(row.title, e.target.value)}
                      className="w-full min-w-[5rem] rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      aria-label={`${row.title} 분류`}
                    >
                      <option value="">—</option>
                      {genreOptions.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th
                    scope="row"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-platform-work-row", row.title);
                      e.dataTransfer.setData("text/plain", row.title);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setRowDragOver(row.title);
                    }}
                    onDragLeave={() => setRowDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const drag =
                        e.dataTransfer.getData("application/x-platform-work-row") ||
                        e.dataTransfer.getData("text/plain");
                      setRowDragOver(null);
                      const dragTitle = (drag || "").trim();
                      if (!dragTitle || dragTitle === row.title) return;
                      const titles = displayModel.rows.map((x) => x.title);
                      const fromIdx = titles.indexOf(dragTitle);
                      const toIdx = titles.indexOf(row.title);
                      if (fromIdx < 0 || toIdx < 0) return;
                      const next = [...titles];
                      next.splice(fromIdx, 1);
                      next.splice(toIdx, 0, dragTitle);
                      setRowOrder(next);
                      persistPlatformPrefs(columnOrder, hiddenCols, next);
                    }}
                    className={`sticky left-[5.5rem] z-10 cursor-grab border-r border-zinc-200 bg-white px-2 py-2 text-left active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-950 ${
                      rowDragOver === row.title ? "ring-2 ring-emerald-500 ring-inset" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <div className="flex shrink-0 flex-col gap-px">
                        <button
                          type="button"
                          disabled={ri === 0}
                          onClick={() => moveWorkRowTo(ri, "start")}
                          className="rounded border border-zinc-200 bg-white px-0.5 py-0 text-[8px] leading-none text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          title="맨 위로"
                          aria-label={`${row.title} 행을 맨 위로`}
                        >
                          ▲▲
                        </button>
                        <button
                          type="button"
                          disabled={ri === displayModel.rows.length - 1}
                          onClick={() => moveWorkRowTo(ri, "end")}
                          className="rounded border border-zinc-200 bg-white px-0.5 py-0 text-[8px] leading-none text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          title="맨 아래로"
                          aria-label={`${row.title} 행을 맨 아래로`}
                        >
                          ▼▼
                        </button>
                      </div>
                      <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-50" title={row.title}>
                        {row.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => openWorkEdit(row.title)}
                        className="shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] leading-none text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        편집
                      </button>
                    </div>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={`${row.title}-${displayModel.columns[i]?.label ?? i}`}
                      className="border-l border-zinc-100 px-2 py-2 text-center align-middle dark:border-zinc-800"
                    >
                      <div className="flex justify-center">
                        <button
                          type="button"
                          className="rounded-md p-0.5 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:hover:bg-zinc-800 dark:focus:ring-zinc-600"
                          onClick={() => {
                            const label = displayModel.columns[i]?.label ?? "";
                            if (!label) return;
                            const cur = getMatrixCellOverride(cellOverrides, row.title, label);
                            const next = cur === "blocked" ? null : "blocked";
                            setCellOverrides((prev) => setMatrixCellOverride(prev, row.title, label, next));
                          }}
                          title="클릭: 불가(🚫) 토글 (로컬 저장)"
                          aria-label="불가 상태 토글"
                        >
                          <MatrixIcon
                            kind={effectiveCellKind(row.title, displayModel.columns[i]!.label, cell)}
                          />
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 bg-zinc-50/90 dark:border-zinc-600 dark:bg-zinc-900/80">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 px-2 py-3 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <th
                  scope="row"
                  className="sticky left-[5.5rem] z-10 border-r border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  플랫폼 메모
                </th>
                {displayModel.columns.map((c) => (
                  <td
                    key={`foot-${c.label}`}
                    className="max-w-[14rem] border-l border-zinc-200 px-2 py-3 align-top text-left text-[11px] leading-snug text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    {c.footerNote ? c.footerNote : "—"}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {load.kind === "ready" && load.emptyHint && (
        <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {load.emptyHint}
        </p>
      )}

      {workModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {workEditTitle ? `작품 수정 · ${workEditTitle}` : "작품 추가"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              사이트 열에 플랫폼명을 쉼표로 구분해 넣으면 매트릭스 아이콘이 표시됩니다.
            </p>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {WORK_MATRIX_FIELDS.map(({ key, label }) => (
                <label key={key} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {label}
                  {key === WORK_GENRE_FIELD ? (
                    <>
                      <select
                        value={workForm[key] ?? ""}
                        onChange={(e) => setWorkForm({ ...workForm, [key]: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">선택…</option>
                        {genreOptions.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={workForm[key] ?? ""}
                        onChange={(e) => setWorkForm({ ...workForm, [key]: e.target.value })}
                        placeholder="직접 입력"
                        className={`${inputCls} mt-1`}
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      value={workForm[key] ?? ""}
                      onChange={(e) => setWorkForm({ ...workForm, [key]: e.target.value })}
                      className={inputCls}
                    />
                  )}
                </label>
              ))}
            </div>
            {actionError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={workSaving}
                onClick={() => {
                  setWorkCreateOpen(false);
                  setWorkEditTitle(null);
                  setActionError(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                취소
              </button>
              <button
                type="button"
                disabled={workSaving}
                onClick={() => void handleWorkSave()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {workSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {platformModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {platformEditLabel ? `플랫폼 수정 · ${platformEditLabel}` : "플랫폼 추가"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              회사명 또는 플랫폼명 중 하나는 필수입니다. 저장 후 새로고침됩니다.
            </p>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {(platformEditId ? PLATFORM_MATRIX_EDIT_FIELDS : PLATFORM_MATRIX_CREATE_FIELDS).map(
                ({ key, label }) => (
                  <label key={key} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {label}
                    <input
                      type="text"
                      value={platformForm[key] ?? ""}
                      onChange={(e) => setPlatformForm({ ...platformForm, [key]: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                ),
              )}
            </div>
            {actionError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={platformSaving}
                onClick={() => {
                  setPlatformCreateOpen(false);
                  setPlatformEditLabel(null);
                  setPlatformEditId(null);
                  setPlatformEditRow(null);
                  setActionError(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                취소
              </button>
              <button
                type="button"
                disabled={platformSaving}
                onClick={() => void handlePlatformSave()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {platformSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
