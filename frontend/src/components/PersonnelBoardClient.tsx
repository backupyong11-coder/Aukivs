"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createDefaultPersonnelBoard,
  defaultPersonnelColumns,
  ensureCellGrid,
  loadPersonnelBoard,
  newPersonnelEntityId,
  savePersonnelBoard,
  type PersonnelBoardBundle,
  type PersonnelCol,
} from "@/lib/personnelBoardStorage";

/** 이름 열 = 짧은 고정 폭(표의 30% 아님), 작업 열 = w-24와 동일 */
const PERSONNEL_NAME_COL_WIDTH = "7.5rem";
const PERSONNEL_ACTION_COL_WIDTH = "6rem";

/** 주간 아젠다와 동일 토큰 */
const inputCls =
  "w-full min-h-[2.5rem] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";

/** 본문 업무 칸: 셀 배경과 동일(흰 박스 없음) */
const cellTextareaCls =
  "w-full min-h-[5rem] resize-y border-0 bg-transparent px-1 py-1 text-sm text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/60 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-500";

/** 이름 열 헤더·본문 (가로는 colgroup 고정 폭) */
const nameHeaderThCls =
  "border border-zinc-400 bg-zinc-200 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50";
const nameBodyTdCls =
  "align-top border border-zinc-400 bg-zinc-100 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800";
const nameInputCls =
  "w-full min-h-[2rem] border-0 bg-transparent px-0 py-0.5 text-sm font-semibold text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/60 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-400";

export function PersonnelBoardClient() {
  const [bundle, setBundle] = useState<PersonnelBoardBundle | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const l = loadPersonnelBoard();
    setBundle(ensureCellGrid(l ?? createDefaultPersonnelBoard()));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !bundle) return;
    savePersonnelBoard(ensureCellGrid(bundle));
  }, [bundle, hydrated]);

  const addRow = useCallback(() => {
    setBundle((b) => {
      if (!b) return b;
      const id = newPersonnelEntityId("row");
      const cells = { ...b.cells };
      cells[id] = {};
      for (const col of b.columns) {
        cells[id][col.id] = "";
      }
      return { ...b, rows: [...b.rows, { id, name: "" }], cells };
    });
  }, []);

  const addColumn = useCallback(() => {
    setBundle((b) => {
      if (!b) return b;
      const col = { id: newPersonnelEntityId("col"), label: "새 열" };
      const cells = { ...b.cells };
      for (const row of b.rows) {
        cells[row.id] = { ...cells[row.id], [col.id]: "" };
      }
      return { ...b, columns: [...b.columns, col], cells };
    });
  }, []);

  const renameColumn = useCallback((colId: string, label: string) => {
    setBundle((b) =>
      b
        ? {
            ...b,
            columns: b.columns.map((c) => (c.id === colId ? { ...c, label } : c)),
          }
        : b,
    );
  }, []);

  const moveColumn = useCallback((colId: string, dir: -1 | 1) => {
    setBundle((b) => {
      if (!b) return b;
      const idx = b.columns.findIndex((c) => c.id === colId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= b.columns.length) return b;
      const next = [...b.columns];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...b, columns: next };
    });
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setBundle((b) => {
      if (!b) return b;
      const rows = b.rows.filter((r) => r.id !== rowId);
      const cells = { ...b.cells };
      delete cells[rowId];
      return { ...b, rows, cells };
    });
  }, []);

  const removeColumn = useCallback((colId: string) => {
    setBundle((b) => {
      if (!b || b.columns.length <= 1) return b;
      const columns = b.columns.filter((c) => c.id !== colId);
      const cells: typeof b.cells = {};
      for (const row of b.rows) {
        cells[row.id] = { ...b.cells[row.id] };
        delete cells[row.id][colId];
      }
      return { ...b, columns, cells };
    });
  }, []);

  const resetBoard = useCallback(() => {
    if (!window.confirm("표를 초기 상태(제목·열·내용)로 되돌릴까요?")) return;
    setBundle(createDefaultPersonnelBoard());
  }, []);

  const resetColumns = useCallback(() => {
    if (
      !window.confirm(
        "열을 제작·유통·기타업무로 다시 맞춥니다. 칸 내용은 새 열 id 때문에 비워질 수 있습니다. 계속할까요?",
      )
    )
      return;
    setBundle((b) => {
      if (!b) return b;
      const columns = defaultPersonnelColumns();
      const cells: typeof b.cells = {};
      for (const row of b.rows) {
        cells[row.id] = {};
        for (const col of columns) {
          cells[row.id][col.id] = "";
        }
      }
      return { ...b, columns, cells, title: b.title };
    });
  }, []);

  if (!bundle) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>;
  }

  const firstColLabel = bundle.columns[0]?.label ?? "제작";
  const dataColCount = bundle.columns.length;
  const dataColWidthStyle =
    dataColCount > 0
      ? {
          width: `calc((100% - ${PERSONNEL_NAME_COL_WIDTH} - ${PERSONNEL_ACTION_COL_WIDTH}) / ${dataColCount})`,
        }
      : undefined;

  return (
    <div id="personnel" className="scroll-mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          표 제목
          <input
            type="text"
            value={bundle.title}
            onChange={(e) => setBundle((b) => (b ? { ...b, title: e.target.value } : b))}
            className={`${inputCls} max-w-md`}
            placeholder="인물별"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {settingsOpen ? "설정 닫기" : "열·표 설정"}
          </button>
          <button
            type="button"
            onClick={resetColumns}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="열 이름·개수를 제작·유통·기타업무 템플릿으로"
          >
            기본 열로 맞추기
          </button>
          <button
            type="button"
            onClick={resetBoard}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            표 초기화
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <strong className="font-medium text-zinc-700 dark:text-zinc-300">행</strong>은 인물 이름,{" "}
        <strong className="font-medium text-zinc-700 dark:text-zinc-300">열</strong>은 제작·유통 등 구분입니다. 아래
        검은 버튼은 주간 아젠다와 같이 열 이름을 붙여 두었고, 모두 같은 방식으로{" "}
        <strong className="font-medium text-zinc-700 dark:text-zinc-300">인물 행</strong>을 추가합니다.
      </p>

      {settingsOpen ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">열 설정</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            열 이름·순서·삭제를 바꿉니다. 표 머리글에 바로 반영됩니다.
          </p>
          <ul className="mt-4 space-y-3">
            {bundle.columns.map((col: PersonnelCol) => (
              <li
                key={col.id}
                className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) => renameColumn(col.id, e.target.value)}
                    className={`${inputCls} max-w-xs font-medium`}
                    aria-label="열 이름"
                  />
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                    onClick={() => moveColumn(col.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                    onClick={() => moveColumn(col.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
                    onClick={() => removeColumn(col.id)}
                    disabled={bundle.columns.length <= 1}
                  >
                    열 삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addColumn}
            className="mt-4 rounded-lg border border-dashed border-zinc-400 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-500 dark:text-zinc-300"
          >
            + 열 추가
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-zinc-500 dark:text-zinc-400">행 추가:</span>
        {bundle.columns.map((col) => (
          <button
            key={col.id}
            type="button"
            onClick={addRow}
            className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {col.label || "열"} +
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-300 dark:border-zinc-600">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: PERSONNEL_NAME_COL_WIDTH }} />
            {bundle.columns.map((col) => (
              <col key={col.id} style={dataColWidthStyle} />
            ))}
            <col style={{ width: PERSONNEL_ACTION_COL_WIDTH }} />
          </colgroup>
          <thead>
            <tr className="bg-zinc-200 dark:bg-zinc-800">
              <th className={nameHeaderThCls}>이름</th>
              {bundle.columns.map((col) => (
                <th
                  key={col.id}
                  className="border border-zinc-400 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50"
                >
                  {col.label || "(열)"}
                </th>
              ))}
              <th className="w-24 border border-zinc-400 px-1 py-2 text-center font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {bundle.rows.length === 0 ? (
              <tr className="bg-white dark:bg-zinc-950">
                <td className={`${nameBodyTdCls} font-semibold text-zinc-900 dark:text-zinc-100`}>—</td>
                <td
                  colSpan={bundle.columns.length + 1}
                  className="border border-zinc-400 px-3 py-4 text-center text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                >
                  행이 없습니다. 위 「{firstColLabel} +」로 추가하세요.
                </td>
              </tr>
            ) : (
              bundle.rows.map((row) => (
                <tr key={row.id} className="bg-white dark:bg-zinc-950">
                  <td className={nameBodyTdCls}>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) =>
                        setBundle((b) =>
                          b
                            ? {
                                ...b,
                                rows: b.rows.map((r) =>
                                  r.id === row.id ? { ...r, name: e.target.value } : r,
                                ),
                              }
                            : b,
                        )
                      }
                      className={nameInputCls}
                      placeholder="이름"
                      aria-label="이름"
                    />
                  </td>
                  {bundle.columns.map((col) => (
                    <td key={col.id} className="align-top border border-zinc-400 p-1 dark:border-zinc-600">
                      <textarea
                        value={bundle.cells[row.id]?.[col.id] ?? ""}
                        onChange={(e) =>
                          setBundle((b) => {
                            if (!b) return b;
                            const v = e.target.value;
                            return {
                              ...b,
                              cells: {
                                ...b.cells,
                                [row.id]: { ...b.cells[row.id], [col.id]: v },
                              },
                            };
                          })
                        }
                        className={cellTextareaCls}
                        placeholder="내용(여러 줄)"
                        rows={4}
                        aria-label={`${row.name || "이름 없음"} · ${col.label}`}
                      />
                    </td>
                  ))}
                  <td className="align-top border border-zinc-400 p-1 text-center dark:border-zinc-600">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-xs text-red-600 underline hover:no-underline dark:text-red-400"
                    >
                      행 삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
