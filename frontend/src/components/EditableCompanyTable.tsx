"use client";

import {
  companyNewId,
  type CompanyColumn,
  type CompanyRow,
  type CompanyTableSection,
} from "@/lib/companyStorage";

const thCls =
  "border border-zinc-300 bg-zinc-100 px-2 py-2 text-left text-xs font-bold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
const tdCls = "border border-zinc-300 p-0 align-top dark:border-zinc-600";
const inputCls =
  "w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400/50 dark:text-zinc-100";

type Props = {
  section: CompanyTableSection;
  onChange: (next: CompanyTableSection) => void;
};

export function EditableCompanyTable({ section, onChange }: Props) {
  function patchCell(rowId: string, colId: string, value: string) {
    onChange({
      ...section,
      rows: section.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
      ),
    });
  }

  function patchColumnLabel(colId: string, label: string) {
    onChange({
      ...section,
      columns: section.columns.map((c) => (c.id === colId ? { ...c, label } : c)),
    });
  }

  function addRow() {
    const cells: Record<string, string> = {};
    for (const c of section.columns) cells[c.id] = "";
    const newRow: CompanyRow = { id: companyNewId("row"), cells };
    onChange({ ...section, rows: [...section.rows, newRow] });
  }

  function removeRow(rowId: string) {
    onChange({ ...section, rows: section.rows.filter((r) => r.id !== rowId) });
  }

  function addColumn() {
    const col: CompanyColumn = { id: companyNewId("col"), label: "새 열" };
    onChange({
      ...section,
      columns: [...section.columns, col],
      rows: section.rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: "" } })),
    });
  }

  function removeColumn(colId: string) {
    if (section.columns.length <= 1) return;
    onChange({
      ...section,
      columns: section.columns.filter((c) => c.id !== colId),
      rows: section.rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[colId];
        return { ...r, cells };
      }),
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{section.title}</h3>
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
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              {section.columns.map((col) => (
                <th key={col.id} className={thCls}>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) => patchColumnLabel(col.id, e.target.value)}
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
                </th>
              ))}
              <th className={`${thCls} w-14`}>작업</th>
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
              section.rows.map((row) => (
                <tr key={row.id} className="bg-white dark:bg-zinc-950">
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
                  <td className={`${tdCls} text-center`}>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-xs text-red-600 underline dark:text-red-400"
                    >
                      삭제
                    </button>
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
