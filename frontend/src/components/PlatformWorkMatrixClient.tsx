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
import {
  createWorksMasterRow,
  updateWorksMasterRow,
  WORK_MATRIX_FIELDS,
} from "@/lib/worksMasterMutate";
import type { WorksMasterItem } from "@/lib/worksMaster";
import {
  buildPlatformWorkMatrix,
  clearMatrixColumnOrder,
  loadMatrixColumnOrder,
  reorderPlatformWorkMatrix,
  saveMatrixColumnOrder,
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
  return <span className="inline-block h-7 w-7" aria-hidden />;
}

export function PlatformWorkMatrixClient() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  /** null → localStorage(또는 기본 모델 순서); 비-null → 방금 조작한 순서 */
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);

  const [model, setModel] = useState<ReturnType<typeof buildPlatformWorkMatrix> | null>(null);
  const [platformRows, setPlatformRows] = useState<PlatformRowRecord[]>([]);
  const [worksItems, setWorksItems] = useState<WorksMasterItem[]>([]);
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
          return;
        }
        setWorksItems(boot.data.worksMaster);
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
      }
    })();
  }, [refreshKey]);

  const displayModel = useMemo(() => {
    if (!model) return null;
    const preferred = columnOrder ?? loadMatrixColumnOrder();
    return reorderPlatformWorkMatrix(model, preferred);
  }, [model, columnOrder]);

  const movePlatformColumn = useCallback((idx: number, dir: -1 | 1) => {
    if (!displayModel) return;
    const labels = displayModel.columns.map((c) => c.label);
    const j = idx + dir;
    if (j < 0 || j >= labels.length) return;
    const next = [...labels];
    [next[idx], next[j]] = [next[j], next[idx]];
    setColumnOrder(next);
    saveMatrixColumnOrder(next);
  }, [displayModel]);

  const resetColumnOrder = useCallback(() => {
    clearMatrixColumnOrder();
    setColumnOrder(null);
  }, []);

  const colCount = displayModel?.columns.length ?? 0;

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
      ? await updateWorksMasterRow(workEditTitle, workForm)
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
          작품정리의「런칭·연재·업로드·대기·계약」열과 플랫폼명을 매칭합니다. 표기 방식이 다르면 셀이 비어 보일 수 있습니다.
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
            각 플랫폼 열 머리글의 ◀ ▶ 로 좌우 순서를 바꿀 수 있습니다. 이 브라우저에만 저장됩니다.
          </p>
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="sticky left-0 z-20 min-w-[11rem] border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  <span className="block px-1">작품명</span>
                </th>
                {displayModel.columns.map((c, colIdx) => {
                  const thMoveBtn =
                    "rounded border border-zinc-200 bg-white px-1 py-0.5 text-[11px] leading-none text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800";
                  return (
                    <th
                      key={c.label}
                      className="min-w-[6rem] border-l border-zinc-200 align-top dark:border-zinc-700"
                    >
                      <div className="flex items-stretch gap-0">
                        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1.5">
                          <span className="text-center text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                            {c.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => openPlatformEdit(c.label)}
                            className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            편집
                          </button>
                        </div>
                        <div className="flex shrink-0 flex-col justify-center gap-0.5 border-l border-zinc-200 py-0.5 pl-1 dark:border-zinc-600">
                          <button
                            type="button"
                            className={thMoveBtn}
                            aria-label={`${c.label} 열을 왼쪽으로`}
                            disabled={colIdx === 0}
                            onClick={() => movePlatformColumn(colIdx, -1)}
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            className={thMoveBtn}
                            aria-label={`${c.label} 열을 오른쪽으로`}
                            disabled={colIdx === displayModel.columns.length - 1}
                            onClick={() => movePlatformColumn(colIdx, 1)}
                          >
                            ▶
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
                    className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-2 py-2 text-left dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
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
                        <MatrixIcon kind={cell} />
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
                  className="sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900"
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
                  <input
                    type="text"
                    value={workForm[key] ?? ""}
                    onChange={(e) => setWorkForm({ ...workForm, [key]: e.target.value })}
                    className={inputCls}
                  />
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
