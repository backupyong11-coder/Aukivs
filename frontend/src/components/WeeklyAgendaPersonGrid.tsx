"use client";

import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  createPersonRow,
  type PersonGridState,
  type WeekdayKey,
} from "@/lib/weeklyAgendaStorage";

const inputCls =
  "w-full min-h-[2.5rem] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const cellTextareaCls =
  "w-full min-h-[4rem] resize-y border-0 bg-transparent px-1 py-1 text-sm text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/60 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-500";

const nameHeaderThCls =
  "w-[7.5rem] border border-zinc-400 bg-zinc-200 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50";

const nameBodyTdCls =
  "align-top border border-zinc-400 bg-zinc-100 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-800";

const nameInputCls =
  "w-full min-h-[2rem] border-0 bg-transparent px-0 py-0.5 text-sm font-semibold text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/60 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-400";

const thCls =
  "min-w-[6.5rem] border border-zinc-400 px-2 py-2 text-center font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50";

const weekendThCls = `${thCls} bg-zinc-300/80 dark:bg-zinc-700/80`;

type Props = {
  grid: PersonGridState;
  onChange: (fn: (prev: PersonGridState) => PersonGridState) => void;
};

function sortedRows(grid: PersonGridState) {
  return [...grid.rows].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"));
}

function weekdayTdCls(key: WeekdayKey): string {
  const base = "align-top border border-zinc-400 p-1 dark:border-zinc-600";
  if (key === "sat" || key === "sun") {
    return `${base} bg-zinc-50/90 dark:bg-zinc-900/60`;
  }
  return `${base} bg-white dark:bg-zinc-950`;
}

export function WeeklyAgendaPersonGrid({ grid, onChange }: Props) {
  const rows = sortedRows(grid);

  function addPerson() {
    onChange((g) => {
      const maxOrder = g.rows.reduce((acc, r) => Math.max(acc, r.order), -1);
      return { ...g, rows: [...g.rows, createPersonRow(maxOrder + 1)] };
    });
  }

  function patchRow(id: string, patch: Partial<{ name: string; cells: Record<WeekdayKey, string> }>) {
    onChange((g) => ({
      ...g,
      rows: g.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function patchCell(rowId: string, day: WeekdayKey, value: string) {
    onChange((g) => ({
      ...g,
      rows: g.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [day]: value } } : r,
      ),
    }));
  }

  function removeRow(id: string) {
    onChange((g) => ({ ...g, rows: g.rows.filter((r) => r.id !== id) }));
  }

  function moveRow(id: string, dir: -1 | 1) {
    onChange((g) => {
      const sorted = sortedRows(g);
      const idx = sorted.findIndex((r) => r.id === id);
      if (idx < 0) return g;
      const j = idx + dir;
      if (j < 0 || j >= sorted.length) return g;
      const next = [...sorted];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...g, rows: next.map((r, i) => ({ ...r, order: i })) };
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          인물별 표 제목
          <input
            type="text"
            spellCheck={false}
            value={grid.title}
            onChange={(e) => onChange((g) => ({ ...g, title: e.target.value }))}
            className={`${inputCls} max-w-md`}
          />
        </label>
        <button
          type="button"
          onClick={addPerson}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          + 인물 추가
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-300 dark:border-zinc-600">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <colgroup>
            <col className="w-[7.5rem]" />
            {WEEKDAY_KEYS.map((k) => (
              <col key={k} />
            ))}
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="bg-zinc-200 dark:bg-zinc-800">
              <th className={nameHeaderThCls}>인물</th>
              {WEEKDAY_KEYS.map((k) => (
                <th key={k} className={k === "sat" || k === "sun" ? weekendThCls : thCls}>
                  {WEEKDAY_LABELS[k]}
                </th>
              ))}
              <th className={`${thCls} w-24`}>작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="bg-white dark:bg-zinc-950">
                <td
                  colSpan={WEEKDAY_KEYS.length + 2}
                  className="border border-zinc-400 px-3 py-6 text-center text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                >
                  인물이 없습니다. 「+ 인물 추가」로 행을 만드세요.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id} className="bg-white dark:bg-zinc-950">
                  <td className={nameBodyTdCls}>
                    <input
                      type="text"
                      spellCheck={false}
                      value={row.name}
                      onChange={(e) => patchRow(row.id, { name: e.target.value })}
                      className={nameInputCls}
                      placeholder="이름"
                    />
                  </td>
                  {WEEKDAY_KEYS.map((day) => (
                    <td key={day} className={weekdayTdCls(day)}>
                      <textarea
                        spellCheck={false}
                        value={row.cells[day] ?? ""}
                        onChange={(e) => patchCell(row.id, day, e.target.value)}
                        className={cellTextareaCls}
                        placeholder={`${WEEKDAY_LABELS[day]} 일정`}
                        rows={3}
                      />
                    </td>
                  ))}
                  <td className="border border-zinc-400 p-1 text-center align-middle dark:border-zinc-600">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveRow(row.id, -1)}
                        className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs disabled:opacity-40 dark:border-zinc-600"
                        title="위로"
                        aria-label="행 위로"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === rows.length - 1}
                        onClick={() => moveRow(row.id, 1)}
                        className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs disabled:opacity-40 dark:border-zinc-600"
                        title="아래로"
                        aria-label="행 아래로"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="text-xs text-red-600 underline hover:no-underline dark:text-red-400"
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

