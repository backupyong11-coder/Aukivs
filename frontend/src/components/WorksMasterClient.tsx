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
  boolToCell,
  isWorksBoolValue,
  WorksMasterInlineCell,
} from "@/components/WorksMasterInlineCell";
import {
  createWorksMasterRow,
  updateWorksMasterRow,
} from "@/lib/worksMasterMutate";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";
import {
  fetchWorksMasterPreferences,
  saveWorksMasterPreferences,
} from "@/lib/worksMasterPreferencesApi";
import {
  getWorkGenre,
  mergeWorkGenreOptions,
  WORK_GENRE_FIELD,
} from "@/lib/worksGenre";

type WorkRow = Record<string, string>;

const COLUMN_ORDER_STORAGE_KEY = "works_master_col_order_v1";
const FILTER_TAG_FIELD = WORK_GENRE_FIELD;
const BOOL_FIELD = "제작완료";

const WORKS_PINNED_ORDER: string[] = [
  "제작완료",
  WORK_GENRE_FIELD,
  "작품명",
  "글작가",
  "그림작가",
  "분류(일반/성인)",
  "형식(웹툰/웹소설 등)",
  "현재상태",
  "총화수/시즌정보",
  "연령등급",
  "첫 공급 일정",
  "줄거리",
  "태그",
  "UCI (구 ISBN)",
  "카피라이트",
  "대여가격",
  "소장가격",
  "무료제공화수",
  "업로드해야 하는 사이트",
  "런칭된 사이트",
  "대기중 사이트",
  "계약된 사이트",
  "연재중인 사이트",
  "연재요일",
  "연재중인 곳 갯수",
  "캐릭터",
  "스태프",
  "보유에셋/비고",
];

const CREATE_MODAL_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: WORK_GENRE_FIELD, label: "분류" },
  { key: "작품명", label: "작품명", required: true },
  { key: "글작가", label: "글작가" },
  { key: "그림작가", label: "그림작가" },
  { key: "분류(일반/성인)", label: "장르/성인여부" },
  { key: "형식(웹툰/웹소설 등)", label: "형식(웹툰/애니 등)" },
  { key: "현재상태", label: "완결/제작상태" },
  { key: "총화수/시즌정보", label: "화수/회차" },
  { key: "연령등급", label: "연령등급" },
  { key: "첫 공급 일정", label: "첫 공급/서비스일" },
  { key: "줄거리", label: "줄거리" },
  { key: "태그", label: "태그" },
  { key: "UCI (구 ISBN)", label: "UCI/ISBN" },
  { key: "카피라이트", label: "카피라이트" },
  { key: "대여가격", label: "대여가격" },
  { key: "소장가격", label: "소장가격" },
  { key: "무료제공화수", label: "무료제공화수" },
  { key: "연재중인 사이트", label: "연재중인 사이트" },
  { key: "런칭된 사이트", label: "런칭된 사이트" },
  { key: "업로드해야 하는 사이트", label: "업로드해야 하는 사이트" },
  { key: "대기중 사이트", label: "대기중 사이트" },
  { key: "계약된 사이트", label: "계약된 사이트" },
  { key: "보유에셋/비고", label: "비고" },
];

const META_FIELDS = new Set(["id", "sheet_row"]);

function normalizeWorkRow(raw: WorksMasterItem): WorkRow {
  const out: WorkRow = {};
  for (const [k, v] of Object.entries(raw)) {
    if (META_FIELDS.has(k)) continue;
    if (k === BOOL_FIELD) {
      out[k] = boolToCell(!!v || isWorksBoolValue(String(v ?? "")));
      continue;
    }
    out[k] = String(v ?? "").trim();
  }
  if (!out[WORK_GENRE_FIELD]) out[WORK_GENRE_FIELD] = getWorkGenre(raw);
  if (raw["id"] != null) out["__id"] = String(raw["id"]);
  return out;
}

function mergeColumnOrder(items: WorkRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of WORKS_PINNED_ORDER) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  for (const row of items) {
    for (const k of Object.keys(row)) {
      if (k.startsWith("__")) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
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

function loadHiddenSet(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const saved = window.localStorage.getItem("works.hidden.작품분류");
    if (saved) return new Set<string>(JSON.parse(saved) as string[]);
  } catch { /* ignore */ }
  return new Set<string>();
}

function saveHiddenSet(next: Set<string>) {
  try {
    window.localStorage.setItem("works.hidden.작품분류", JSON.stringify([...next]));
  } catch { /* ignore */ }
}

function emptyCreateForm(): Record<string, string> {
  const f: Record<string, string> = {};
  CREATE_MODAL_FIELDS.forEach(({ key }) => {
    f[key] = "";
  });
  return f;
}

function rowTitle(item: WorkRow): string {
  return (item["작품명"] ?? "").trim() || "(이름 없음)";
}

function rowKey(item: WorkRow): string {
  const stable = (item["__id"] ?? "").trim();
  return stable || rowTitle(item);
}

function rowStableId(item: WorkRow): string {
  return (item["__id"] ?? "").trim();
}

export function WorksMasterClient() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: WorkRow[] }
  >({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<string>("작품명");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [patchingCell, setPatchingCell] = useState<string | null>(null);
  const [togglingCell, setTogglingCell] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [workGenres, setWorkGenres] = useState<string[]>([]);
  const [hiddenGenres, setHiddenGenres] = useState<Set<string>>(() => loadHiddenSet());

  const [modalItem, setModalItem] = useState<WorkRow | null>(null);
  const [modalOriginalTitle, setModalOriginalTitle] = useState("");
  const [modalForm, setModalForm] = useState<Record<string, string>>({});
  const [savingModal, setSavingModal] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>(emptyCreateForm);
  const [savingCreate, setSavingCreate] = useState(false);
  const [genrePanelOpen, setGenrePanelOpen] = useState(false);
  const [genreDraft, setGenreDraft] = useState<string[]>([]);
  const [newGenre, setNewGenre] = useState("");
  const [genreSaving, setGenreSaving] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [worksRes, prefRes] = await Promise.all([
        fetchWorksMaster(),
        fetchWorksMasterPreferences(),
      ]);
      if (!worksRes.ok) throw new Error("작품 DB를 불러오지 못했습니다.");
      const list = worksRes.items.map(normalizeWorkRow);
      setWorkGenres(prefRes.workGenres);
      setState({ kind: "ready", items: list });
      const defaultKeys = mergeColumnOrder(list);
      setColumnOrder(loadColumnOrder(defaultKeys));
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [refreshKey, load]);

  const colVis = useTableColumnVisibility("works-master", columnOrder);
  const colLabels = useColumnLabels("works-master");

  const genreOptions = useMemo(() => {
    if (state.kind !== "ready") return workGenres;
    return mergeWorkGenreOptions(workGenres, state.items as unknown as WorksMasterItem[]);
  }, [state, workGenres]);

  const persistColumnOrder = useCallback((next: string[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const resetColumnOrder = useCallback(() => {
    if (state.kind !== "ready") return;
    const next = mergeColumnOrder(state.items);
    persistColumnOrder(next);
    setColumnOrder(next);
  }, [persistColumnOrder, state]);

  const handleColDrop = useCallback(
    (targetField: string) => {
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

  const handleSort = useCallback(
    (field: string) => {
      if (sortKey === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(field);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const hideColumn = useCallback(
    (field: string) => {
      colVis.setColumnVisible(field, false);
    },
    [colVis],
  );

  const filtered = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = filterText.trim().toLowerCase();
    return state.items.filter((it) => {
      const genre = it[WORK_GENRE_FIELD] ?? "";
      if (hiddenGenres.size > 0 && genre && hiddenGenres.has(genre)) return false;
      if (!q) return true;
      return columnOrder.some((key) => String(it[key] ?? "").toLowerCase().includes(q));
    });
  }, [state, filterText, hiddenGenres, columnOrder]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "").trim();
      const bv = String(b[sortKey] ?? "").trim();
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return av.localeCompare(bv, "ko") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const list = useTableListDisplay("works-master", sorted);
  const colWidths = useTableColumnWidths("works-master", colVis.visibleKeys, colLabels.getLabel);

  const genreFilterOptions = useMemo(() => {
    if (state.kind !== "ready") return [] as string[];
    const keys = [...new Set(state.items.map((it) => (it[WORK_GENRE_FIELD] ?? "").trim()))];
    keys.sort((a, b) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      return a.localeCompare(b, "ko");
    });
    return keys;
  }, [state]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const toggleGenreFilter = (key: string) => {
    setHiddenGenres((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHiddenSet(next);
      return next;
    });
  };

  const setFieldInState = useCallback((title: string, field: string, value: string) => {
    setState((s) => {
      if (s.kind !== "ready") return s;
      return {
        kind: "ready",
        items: s.items.map((it) => {
          if (rowKey(it) !== title) return it;
          const next = { ...it, [field]: value };
          if (field === "작품명") return next;
          return next;
        }),
      };
    });
  }, []);

  const patchField = useCallback(
    async (rowTitleKey: string, field: string, newValue: string) => {
      if (state.kind !== "ready") return;
      const item = state.items.find((it) => rowKey(it) === rowTitleKey);
      if (!item) return;
      const prev = item[field] ?? "";
      if (prev === newValue) return;
      const cellKey = `${rowTitleKey}:${field}`;
      if (field === BOOL_FIELD) setTogglingCell(cellKey);
      else setPatchingCell(cellKey);
      setActionError(null);
      setFieldInState(rowTitleKey, field, newValue);
      try {
        const r = await updateWorksMasterRow(
          { id: rowStableId(item), originalTitle: rowTitle(item) },
          { [field]: newValue },
        );
        if (!r.ok) throw new Error(r.message);
        setRefreshKey((k) => k + 1);
      } catch (e) {
        setFieldInState(rowTitleKey, field, prev);
        setActionError(e instanceof Error ? e.message : "저장 실패");
        throw e;
      } finally {
        setPatchingCell(null);
        setTogglingCell(null);
      }
    },
    [setFieldInState, state],
  );

  const handleInlineSave = useCallback(
    async (rowId: string, field: string, newValue: string) => {
      try {
        await patchField(rowId, field, newValue);
      } catch {
        /* actionError set */
      }
    },
    [patchField],
  );

  const openEditModal = (item: WorkRow) => {
    setModalOriginalTitle(rowTitle(item));
    setModalItem(item);
    const form: Record<string, string> = {};
    columnOrder.forEach((key) => {
      form[key] = item[key] ?? "";
    });
    setModalForm(form);
    setActionError(null);
  };

  const handleModalSave = async () => {
    if (!modalItem) return;
    setSavingModal(true);
    setActionError(null);
    try {
      const payload: Record<string, string> = {};
      columnOrder.forEach((key) => {
        payload[key] = modalForm[key] ?? "";
      });
      const r = await updateWorksMasterRow(
        { id: rowStableId(modalItem), originalTitle: modalOriginalTitle },
        payload,
      );
      if (!r.ok) throw new Error(r.message);
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
      const title = createForm["작품명"]?.trim() ?? "";
      if (!title) throw new Error("작품명을 입력하세요.");
      const payload: Record<string, string> = {};
      CREATE_MODAL_FIELDS.forEach(({ key }) => {
        payload[key] = createForm[key] ?? "";
      });
      const r = await createWorksMasterRow(payload);
      if (!r.ok) throw new Error(r.message);
      setCreateModalOpen(false);
      setCreateForm(emptyCreateForm());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSavingCreate(false);
    }
  };

  const openGenrePanel = () => {
    setGenreDraft([...genreOptions]);
    setNewGenre("");
    setGenrePanelOpen(true);
  };

  const handleGenreSave = async () => {
    setGenreSaving(true);
    const r = await saveWorksMasterPreferences(genreDraft);
    setGenreSaving(false);
    if (!r.ok) {
      setActionError(r.message);
      return;
    }
    setWorkGenres(genreDraft);
    setGenrePanelOpen(false);
  };

  const isCellBusy = (title: string, field: string) =>
    patchingCell === `${title}:${field}` || togglingCell === `${title}:${field}`;

  const thAction =
    "sticky left-0 z-10 whitespace-nowrap border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  const tableColSpan = 1 + colVis.visibleKeys.length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        작품정리 DB입니다. 셀을 클릭해 바로 수정할 수 있습니다. 플랫폼 매트릭스·캘린더·관제실과 연동됩니다.
      </p>

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
        <button
          type="button"
          onClick={openGenrePanel}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300"
        >
          분류 관리
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
          title="열 순서를 기본 순서로"
        >
          열 순서 초기화
        </button>
      </div>

      {state.kind === "ready" && columnOrder.includes(FILTER_TAG_FIELD) && (
        <FilterTagsFlow
          listLabel={listLabel}
          groups={[
            {
              title: "분류",
              keys: genreFilterOptions,
              hidden: hiddenGenres,
              onToggle: toggleGenreFilter,
              onShowAll: () => {
                saveHiddenSet(new Set());
                setHiddenGenres(new Set());
              },
              onHideAll: () => {
                const all = new Set(genreFilterOptions.filter(Boolean));
                saveHiddenSet(all);
                setHiddenGenres(all);
              },
            },
          ]}
        />
      )}

      {actionError && !modalItem && !createModalOpen && !genrePanelOpen && (
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
            dateFieldHint={TABLE_LIST_DATE_FIELDS["works-master"].join(" · ")}
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
                          if (
                            window.confirm(
                              `「${colLabels.getLabel(field)}」 열을 목록에서 숨길까요?`,
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
                        {filterText || hiddenGenres.size > 0 || list.dateFilter.preset !== "all"
                          ? "조건에 맞는 항목이 없습니다"
                          : "항목이 없습니다"}
                      </td>
                    </tr>
                  ) : (
                    list.displayed.map((item) => {
                      const title = rowKey(item);
                      return (
                        <tr
                          key={title}
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
                            const isBool = field === BOOL_FIELD;
                            const wide =
                              field.includes("사이트") ||
                              field.includes("줄거리") ||
                              field.includes("비고") ||
                              field.includes("태그");
                            return (
                              <td
                                key={field}
                                className={`${tableDataCellClass} ${isBool ? "text-center" : ""}`}
                              >
                                <WorksMasterInlineCell
                                  value={item[field] ?? ""}
                                  field={field}
                                  rowId={title}
                                  boolean={isBool}
                                  required={field === "작품명"}
                                  wide={wide}
                                  muted={field.includes("일정")}
                                  tabular={isBool}
                                  disabled={isCellBusy(title, field)}
                                  genreOptions={genreOptions}
                                  onGenresChange={setWorkGenres}
                                  onSave={handleInlineSave}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
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
        <p className="text-sm text-zinc-500">표시할 작품이 없습니다.</p>
      )}

      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {rowTitle(modalItem)} · 전체 필드 수정
            </h3>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {columnOrder.map((key) => (
                <div key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {colLabels.getLabel(key)}
                  </span>
                  {key === BOOL_FIELD ? (
                    <label className="mt-1 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isWorksBoolValue(modalForm[key])}
                        onChange={(e) =>
                          setModalForm((prev) => ({
                            ...prev,
                            [key]: boolToCell(e.target.checked),
                          }))
                        }
                        className="h-4 w-4 accent-zinc-800 dark:accent-zinc-200"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-200">제작완료</span>
                    </label>
                  ) : key === WORK_GENRE_FIELD ? (
                    <>
                      <select
                        value={modalForm[key] ?? ""}
                        onChange={(e) => setModalForm({ ...modalForm, [key]: e.target.value })}
                        className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
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
                        value={modalForm[key] ?? ""}
                        onChange={(e) => setModalForm({ ...modalForm, [key]: e.target.value })}
                        placeholder="직접 입력"
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      value={modalForm[key] ?? ""}
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
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
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
            <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">새 작품</h3>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {CREATE_MODAL_FIELDS.map(({ key, label, required }) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {label}
                    {required ? " *" : ""}
                  </span>
                  {key === WORK_GENRE_FIELD ? (
                    <>
                      <select
                        value={createForm[key] ?? ""}
                        onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })}
                        className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
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
                        value={createForm[key] ?? ""}
                        onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })}
                        placeholder="직접 입력"
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      value={createForm[key] ?? ""}
                      onChange={(e) => setCreateForm({ ...createForm, [key]: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  )}
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
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleCreateSave()}
                disabled={savingCreate}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingCreate ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {genrePanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">분류 관리</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              분류 목록은 웹에 저장되어 플랫폼 매트릭스와 공유됩니다.
            </p>
            <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto">
              {genreDraft.map((g) => (
                <li
                  key={g}
                  className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700"
                >
                  <span>{g}</span>
                  <button
                    type="button"
                    onClick={() => setGenreDraft((prev) => prev.filter((x) => x !== g))}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
                placeholder="새 분류"
                className="flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => {
                  const v = newGenre.trim();
                  if (!v || genreDraft.includes(v)) return;
                  setGenreDraft((prev) => [...prev, v]);
                  setNewGenre("");
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                추가
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={genreSaving}
                onClick={() => setGenrePanelOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                취소
              </button>
              <button
                type="button"
                disabled={genreSaving}
                onClick={() => void handleGenreSave()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {genreSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
