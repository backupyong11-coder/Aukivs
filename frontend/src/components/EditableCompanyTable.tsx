"use client";

import { useCallback, useRef, useState } from "react";
import { TableRowDragHandle } from "@/components/TableRowDragHandle";
import {
  clampColumnWidth,
  defaultWidthForField,
  minWidthForLabel,
} from "@/lib/tableColumnWidths";
import {
  companyNewId,
  type CompanyColumn,
  type CompanyRow,
  type CompanyTableSection,
} from "@/lib/companyStorage";

const thCls =
  "relative border border-zinc-300 bg-zinc-100 px-2 py-2 text-left text-xs font-bold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
const tdCls = "max-w-0 overflow-hidden border border-zinc-300 p-0 align-top dark:border-zinc-600";
const inputCls =
  "w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400/50 dark:text-zinc-100";
const ACTION_COL_WIDTH = 96;

type Props = {
  section: CompanyTableSection;
  onChange: (next: CompanyTableSection) => void;
};

function reorderById<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  if (sourceId === targetId) return items;
  const from = items.findIndex((x) => x.id === sourceId);
  const to = items.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function moveByIndex<T>(items: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function colWidth(col: CompanyColumn): number {
  const stored = col.widthPx ?? defaultWidthForField(col.label);
  return clampColumnWidth(Math.max(stored, minWidthForLabel(col.label)));
}

export function EditableCompanyTable({ section, onChange }: Props) {
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [overRowId, setOverRowId] = useState<string | null>(null);
  const resizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  const patch = useCallback(
    (next: CompanyTableSection) => {
      onChange(next);
    },
    [onChange],
  );

  function patchCell(rowId: string, colId: string, value: string) {
    patch({
      ...section,
      rows: section.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
      ),
    });
  }

  function patchColumn(colId: string, patchCol: Partial<CompanyColumn>) {
    patch({
      ...section,
      columns: section.columns.map((c) => (c.id === colId ? { ...c, ...patchCol } : c)),
    });
  }

  function addRow() {
    const cells: Record<string, string> = {};
    for (const c of section.columns) cells[c.id] = "";
    const newRow: CompanyRow = { id: companyNewId("row"), cells };
    patch({ ...section, rows: [...section.rows, newRow] });
  }

  function removeRow(rowId: string) {
    patch({ ...section, rows: section.rows.filter((r) => r.id !== rowId) });
  }

  function moveRow(rowId: string, dir: -1 | 1) {
    const idx = section.rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    patch({ ...section, rows: moveByIndex(section.rows, idx, dir) });
  }

  function addColumn() {
    const col: CompanyColumn = { id: companyNewId("col"), label: "새 열" };
    patch({
      ...section,
      columns: [...section.columns, col],
      rows: section.rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: "" } })),
    });
  }

  function removeColumn(colId: string) {
    if (section.columns.length <= 1) return;
    patch({
      ...section,
      columns: section.columns.filter((c) => c.id !== colId),
      rows: section.rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[colId];
        return { ...r, cells };
      }),
    });
  }

  function handleColDrop(targetColId: string) {
    if (!dragColId || dragColId === targetColId) {
      setDragColId(null);
      return;
    }
    patch({
      ...section,
      columns: reorderById(section.columns, dragColId, targetColId),
    });
    setDragColId(null);
  }

  function handleRowDrop(targetRowId: string) {
    if (!dragRowId || dragRowId === targetRowId) {
      setDragRowId(null);
      setOverRowId(null);
      return;
    }
    patch({
      ...section,
      rows: reorderById(section.rows, dragRowId, targetRowId),
    });
    setDragRowId(null);
    setOverRowId(null);
  }

  function startColResize(colId: string, clientX: number) {
    const col = section.columns.find((c) => c.id === colId);
    if (!col) return;
    const floor = minWidthForLabel(col.label);
    const startW = colWidth(col);
    resizeRef.current = { colId, startX: clientX, startW };

    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const w = Math.max(floor, clampColumnWidth(resizeRef.current.startW + delta));
      const s = sectionRef.current;
      onChange({
        ...s,
        columns: s.columns.map((c) => (c.id === colId ? { ...c, widthPx: w } : c)),
      });
    };

    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const tableMinWidth =
    section.columns.reduce((sum, c) => sum + colWidth(c), 0) + ACTION_COL_WIDTH;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{section.title}</h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            열·행 ⋮⋮ 드래그로 순서 변경 · 열 오른쪽 가장자리로 너비 조절
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addColumn}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            + 열
          </button>
          <button
            type="button"
            onClick={addRow}
            className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            + 행
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-300 dark:border-zinc-600">
        <table
          className="border-collapse text-sm"
          style={{ tableLayout: "fixed", width: "auto", minWidth: tableMinWidth }}
        >
          <colgroup>
            {section.columns.map((col) => (
              <col key={col.id} style={{ width: colWidth(col) }} />
            ))}
            <col style={{ width: ACTION_COL_WIDTH }} />
          </colgroup>
          <thead>
            <tr>
              {section.columns.map((col) => (
                <th
                  key={col.id}
                  className={`group ${thCls} ${dragColId === col.id ? "bg-zinc-200 dark:bg-zinc-700" : ""}`}
                  style={{ width: colWidth(col), minWidth: colWidth(col), maxWidth: colWidth(col) }}
                  onDragOver={(e) => {
                    if (!dragColId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleColDrop(col.id);
                  }}
                >
                  <div className="relative flex min-h-[1.75rem] items-center gap-1 pr-2">
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragColId(col.id);
                      }}
                      onDragEnd={() => setDragColId(null)}
                      className="cursor-grab text-[10px] leading-none text-zinc-400 opacity-60 hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
                      title="드래그하여 열 이동"
                      aria-hidden
                    >
                      ⋮⋮
                    </span>
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) => patchColumn(col.id, { label: e.target.value })}
                      className="min-w-0 flex-1 border-0 bg-transparent text-xs font-bold outline-none"
                    />
                    {section.columns.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeColumn(col.id)}
                        className="shrink-0 text-[10px] text-red-500"
                        title="열 삭제"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`${col.label} 열 너비 조절`}
                    title="드래그하여 열 너비 조절"
                    className="absolute right-0 top-0 z-[1] h-full w-1.5 cursor-col-resize touch-none hover:bg-zinc-400/50 active:bg-zinc-500/60 dark:hover:bg-zinc-500/50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startColResize(col.id, e.clientX);
                    }}
                  />
                </th>
              ))}
              <th
                className={`${thCls} text-center`}
                style={{ width: ACTION_COL_WIDTH, minWidth: ACTION_COL_WIDTH }}
              >
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {section.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={section.columns.length + 1}
                  className="border border-zinc-300 px-3 py-6 text-center text-zinc-500 dark:border-zinc-600"
                >
                  행이 없습니다. 「+ 행」으로 추가하세요.
                </td>
              </tr>
            ) : (
              section.rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`bg-white dark:bg-zinc-950 ${
                    overRowId === row.id && dragRowId !== row.id
                      ? "outline outline-2 outline-zinc-400 dark:outline-zinc-500"
                      : ""
                  } ${dragRowId === row.id ? "opacity-60" : ""}`}
                  onDragOver={(e) => {
                    if (!dragRowId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overRowId !== row.id) setOverRowId(row.id);
                  }}
                  onDragLeave={() => {
                    setOverRowId((cur) => (cur === row.id ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleRowDrop(row.id);
                  }}
                >
                  {section.columns.map((col) => (
                    <td key={col.id} className={tdCls}>
                      <textarea
                        value={row.cells[col.id] ?? ""}
                        onChange={(e) => patchCell(row.id, col.id, e.target.value)}
                        rows={Math.min(4, Math.max(1, (row.cells[col.id] ?? "").split("\n").length))}
                        className={`${inputCls} resize-y`}
                      />
                    </td>
                  ))}
                  <td className={`${tdCls} text-center align-middle`}>
                    <div className="flex flex-wrap items-center justify-center gap-0.5 px-1 py-1">
                      <TableRowDragHandle
                        sourceProps={{
                          draggable: true,
                          onDragStart: (e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            try {
                              e.dataTransfer.setData("text/plain", row.id);
                            } catch {
                              /* ignore */
                            }
                            setDragRowId(row.id);
                          },
                          onDragEnd: () => {
                            setDragRowId(null);
                            setOverRowId(null);
                          },
                        }}
                        active={dragRowId === row.id}
                      />
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveRow(row.id, -1)}
                        className="rounded border border-zinc-300 px-1 py-0.5 text-[10px] disabled:opacity-40 dark:border-zinc-600"
                        title="위로"
                        aria-label="행 위로"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === section.rows.length - 1}
                        onClick={() => moveRow(row.id, 1)}
                        className="rounded border border-zinc-300 px-1 py-0.5 text-[10px] disabled:opacity-40 dark:border-zinc-600"
                        title="아래로"
                        aria-label="행 아래로"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="text-[10px] text-red-600 underline dark:text-red-400"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
