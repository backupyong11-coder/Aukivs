"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDefaultState,
  createDefaultWorkbook,
  createMajor,
  createMinorPreset,
  createNewEmptySheet,
  createRow,
  getSuggestedAgendaTabLabel,
  loadWeeklyAgendaWorkbook,
  saveWeeklyAgendaWorkbook,
  type AgendaRow,
  type MajorCategory,
  type MinorPreset,
  type WeeklyAgendaState,
  type PersonGridState,
  type WeeklyAgendaWorkbook,
} from "@/lib/weeklyAgendaStorage";
import { WeeklyAgendaPersonGrid } from "@/components/WeeklyAgendaPersonGrid";

function sortMajors(majors: MajorCategory[]): MajorCategory[] {
  return [...majors].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function rowSliceForTable(
  majors: MajorCategory[],
  rows: AgendaRow[],
): { major: MajorCategory; rows: AgendaRow[] }[] {
  const sorted = sortMajors(majors);
  const majorIds = new Set(sorted.map((m) => m.id));
  const out: { major: MajorCategory; rows: AgendaRow[] }[] = [];
  for (const major of sorted) {
    out.push({ major, rows: rows.filter((r) => r.majorId === major.id) });
  }
  const orphan = rows.filter((r) => !majorIds.has(r.majorId));
  if (orphan.length > 0) {
    out.push({
      major: {
        id: "__orphan__",
        name: "⚠ 미지정(삭제된 대분류 등)",
        order: 9999,
      },
      rows: orphan,
    });
  }
  return out;
}

const inputCls =
  "w-full min-h-[2.5rem] rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
/** 본문 칸: 셀 배경과 동일(흰 박스 없음) */
const cellInputCls =
  "w-full min-h-[2rem] border-0 bg-transparent px-1 py-1 text-sm text-zinc-900 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/60 focus:ring-offset-0 dark:text-zinc-100 dark:placeholder:text-zinc-500";

export function WeeklyAgendaClient() {
  const [workbook, setWorkbook] = useState<WeeklyAgendaWorkbook | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [tabDragOverId, setTabDragOverId] = useState<string | null>(null);
  const [tabDragOverEnd, setTabDragOverEnd] = useState(false);

  useEffect(() => {
    const loaded = loadWeeklyAgendaWorkbook();
    setWorkbook(loaded ?? createDefaultWorkbook());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !workbook) return;
    saveWeeklyAgendaWorkbook(workbook);
  }, [workbook, hydrated]);

  const sortedSheets = useMemo(() => {
    if (!workbook) return [];
    return [...workbook.sheets].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ko"));
  }, [workbook]);

  const activeSheet = useMemo(() => {
    if (!workbook) return null;
    return workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0] ?? null;
  }, [workbook]);

  const state = activeSheet?.state;

  const updateActiveState = useCallback((fn: (s: WeeklyAgendaState) => WeeklyAgendaState) => {
    setWorkbook((wb) => {
      if (!wb) return wb;
      const id = wb.activeSheetId;
      return {
        ...wb,
        sheets: wb.sheets.map((s) => (s.id === id ? { ...s, state: fn(s.state) } : s)),
      };
    });
  }, []);

  const updateState = updateActiveState;

  const updatePersonGrid = useCallback(
    (fn: (pg: PersonGridState) => PersonGridState) => {
      updateActiveState((s) => ({ ...s, personGrid: fn(s.personGrid) }));
    },
    [updateActiveState],
  );

  const groups = useMemo(() => {
    if (!state) return [];
    return rowSliceForTable(state.majors, state.rows);
  }, [state]);

  const presetsByMajor = useMemo(() => {
    if (!state) return new Map<string, MinorPreset[]>();
    const m = new Map<string, MinorPreset[]>();
    for (const p of state.minorPresets) {
      const list = m.get(p.majorId) ?? [];
      list.push(p);
      m.set(p.majorId, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    }
    return m;
  }, [state]);

  function setActiveSheetId(sheetId: string) {
    setWorkbook((wb) => {
      if (!wb || !wb.sheets.some((s) => s.id === sheetId)) return wb;
      return { ...wb, activeSheetId: sheetId };
    });
  }

  function addSheetTab() {
    const labelIn = window.prompt("새 기간 탭 이름", getSuggestedAgendaTabLabel());
    if (labelIn === null) return;
    setWorkbook((wb) => {
      if (!wb) return wb;
      const maxOrder = wb.sheets.reduce((acc, s) => Math.max(acc, s.order), -1);
      const sheet = createNewEmptySheet(labelIn.trim(), maxOrder + 1);
      return { ...wb, sheets: [...wb.sheets, sheet], activeSheetId: sheet.id };
    });
  }

  function removeSheetTab(sheetId: string) {
    setWorkbook((wb) => {
      if (!wb || wb.sheets.length <= 1) {
        window.alert("탭은 최소 1개 필요합니다.");
        return wb;
      }
      if (!window.confirm("이 기간 탭을 삭제할까요? 내용은 복구할 수 없습니다.")) return wb;
      const next = wb.sheets.filter((s) => s.id !== sheetId);
      let active = wb.activeSheetId;
      if (active === sheetId) active = next[0]?.id ?? active;
      const normalized = next.map((s, i) => ({ ...s, order: i }));
      return { ...wb, sheets: normalized, activeSheetId: active };
    });
  }

  function renameActiveTabViaPrompt() {
    if (!activeSheet) return;
    const n = window.prompt("탭 이름 바꾸기", activeSheet.label);
    if (n === null || !n.trim()) return;
    const id = activeSheet.id;
    setWorkbook((wb) => {
      if (!wb) return wb;
      return {
        ...wb,
        sheets: wb.sheets.map((s) => (s.id === id ? { ...s, label: n.trim() } : s)),
      };
    });
  }

  /** 더블 클릭: 해당 기간 탭 이름 수정 후 그 탭으로 전환 */
  function renameTabByDoubleClick(sheetId: string, currentLabel: string) {
    const n = window.prompt("탭 이름 바꾸기", currentLabel);
    if (n === null || !n.trim()) return;
    setWorkbook((wb) => {
      if (!wb) return wb;
      return {
        ...wb,
        activeSheetId: sheetId,
        sheets: wb.sheets.map((s) => (s.id === sheetId ? { ...s, label: n.trim() } : s)),
      };
    });
  }

  function orderedSheetsList(wb: WeeklyAgendaWorkbook) {
    return [...wb.sheets].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ko"));
  }

  /** dropBeforeId 탭 앞에 삽입 */
  function reorderSheetTabs(dragId: string, dropBeforeId: string) {
    if (dragId === dropBeforeId) return;
    setWorkbook((wb) => {
      if (!wb) return wb;
      const list = orderedSheetsList(wb);
      const fromIdx = list.findIndex((x) => x.id === dragId);
      let toIdx = list.findIndex((x) => x.id === dropBeforeId);
      if (fromIdx < 0 || toIdx < 0) return wb;
      const next = [...list];
      const [item] = next.splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx -= 1;
      next.splice(toIdx, 0, item);
      return { ...wb, sheets: next.map((s, i) => ({ ...s, order: i })) };
    });
  }

  function moveSheetTabToEnd(dragId: string) {
    setWorkbook((wb) => {
      if (!wb) return wb;
      const list = orderedSheetsList(wb);
      const fromIdx = list.findIndex((x) => x.id === dragId);
      if (fromIdx < 0) return wb;
      const next = [...list];
      const [item] = next.splice(fromIdx, 1);
      next.push(item);
      return { ...wb, sheets: next.map((s, i) => ({ ...s, order: i })) };
    });
  }

  if (!workbook || !state) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
    );
  }

  function addRow(majorId: string) {
    updateState((s) => ({ ...s, rows: [...s.rows, createRow(majorId)] }));
  }

  function patchRow(id: string, patch: Partial<AgendaRow>) {
    updateState((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function removeRow(id: string) {
    updateState((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }));
  }

  function moveRow(id: string, dir: -1 | 1) {
    updateState((s) => {
      const rows = [...s.rows];
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return s;
      const majorId = rows[idx].majorId;
      const sameMajorIndices = rows
        .map((r, i) => (r.majorId === majorId ? i : -1))
        .filter((i) => i >= 0);
      const posInGroup = sameMajorIndices.indexOf(idx);
      if (posInGroup < 0) return s;
      const targetPos = posInGroup + dir;
      if (targetPos < 0 || targetPos >= sameMajorIndices.length) return s;
      const swapIdx = sameMajorIndices[targetPos];
      [rows[idx], rows[swapIdx]] = [rows[swapIdx], rows[idx]];
      return { ...s, rows };
    });
  }

  function moveMajor(majorId: string, dir: -1 | 1) {
    updateState((s) => {
      const sorted = sortMajors([...s.majors]);
      const i = sorted.findIndex((m) => m.id === majorId);
      if (i < 0) return s;
      const j = i + dir;
      if (j < 0 || j >= sorted.length) return s;
      const swapped = [...sorted];
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
      const majors = swapped.map((m, idx) => ({ ...m, order: idx }));
      return { ...s, majors };
    });
  }

  function renameMajor(majorId: string, name: string) {
    updateState((s) => ({
      ...s,
      majors: s.majors.map((m) => (m.id === majorId ? { ...m, name } : m)),
    }));
  }

  function addMajor() {
    updateState((s) => {
      const maxOrder = s.majors.reduce((acc, m) => Math.max(acc, m.order), -1);
      return { ...s, majors: [...s.majors, createMajor("새 대분류", maxOrder + 1)] };
    });
  }

  function deleteMajor(majorId: string) {
    updateState((s) => {
      if (s.rows.some((r) => r.majorId === majorId)) {
        window.alert("이 대분류에 행이 있습니다. 먼저 행을 삭제하거나 다른 대분류로 옮기세요.");
        return s;
      }
      if (s.majors.length <= 1) {
        window.alert("대분류는 최소 1개 필요합니다.");
        return s;
      }
      return {
        ...s,
        majors: s.majors.filter((m) => m.id !== majorId),
        minorPresets: s.minorPresets.filter((p) => p.majorId !== majorId),
      };
    });
  }

  function addPreset(majorId: string, label: string) {
    const t = label.trim();
    if (!t) return;
    updateState((s) => {
      const forMajor = s.minorPresets.filter((p) => p.majorId === majorId);
      const maxO = forMajor.reduce((acc, p) => Math.max(acc, p.order), -1);
      return {
        ...s,
        minorPresets: [...s.minorPresets, createMinorPreset(majorId, t, maxO + 1)],
      };
    });
  }

  function removePreset(presetId: string) {
    updateState((s) => ({
      ...s,
      minorPresets: s.minorPresets.filter((p) => p.id !== presetId),
    }));
  }

  function resetToDemo() {
    if (!window.confirm("현재 선택한 기간 탭만 초기 템플릿으로 덮어씁니다. 계속할까요?")) {
      return;
    }
    updateState(() => createDefaultState());
  }

  return (
    <div className="space-y-4 pb-[4.25rem] sm:pb-[4.5rem]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          표 제목
          <input
            type="text"
            spellCheck={false}
            value={state.title}
            onChange={(e) => updateState((s) => ({ ...s, title: e.target.value }))}
            className={`${inputCls} max-w-md`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={renameActiveTabViaPrompt}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="현재 선택된 하단 탭(기간) 이름만 바꿉니다. 표 제목은 왼쪽 입력란입니다."
          >
            탭 이름 바꾸기
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {settingsOpen ? "설정 닫기" : "대분류·소분류 설정"}
          </button>
          <button
            type="button"
            onClick={resetToDemo}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            이 탭 초기화
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        화면 맨 아래에 <strong className="font-medium text-zinc-700 dark:text-zinc-300">고정된 시트 탭</strong>에서 기간별 시트를
        바꿉니다. 표가 길어도 탭은 항상 보입니다. 탭을 <strong className="font-medium text-zinc-700 dark:text-zinc-300">드래그</strong>
        하여 순서를 바꿀 수 있습니다. 더블 클릭으로 이름 수정, (+)로 새 기간 추가.
      </p>

      {settingsOpen ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            대분류 / 소분류 빠른 입력
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            대분류 이름과 순서를 바꾸면 표 왼쪽 열(셀 통합)에 그대로 반영됩니다. 소분류 빠른 입력은 행 편집 시
            드롭다운으로 넣을 수 있는 라벨 목록입니다.
          </p>
          <ul className="mt-4 space-y-4">
            {sortMajors(state.majors).map((major) => {
              const presets = presetsByMajor.get(major.id) ?? [];
              return (
                <li
                  key={major.id}
                  className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      spellCheck={false}
                      value={major.name}
                      onChange={(e) => renameMajor(major.id, e.target.value)}
                      className={`${inputCls} max-w-xs font-medium`}
                      aria-label="대분류 이름"
                    />
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                      onClick={() => moveMajor(major.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                      onClick={() => moveMajor(major.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-400"
                      onClick={() => deleteMajor(major.id)}
                    >
                      대분류 삭제
                    </button>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      소분류 빠른 입력
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {presets.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800"
                        >
                          {p.label}
                          <button
                            type="button"
                            className="text-zinc-500 hover:text-red-600"
                            onClick={() => removePreset(p.id)}
                            aria-label={`${p.label} 제거`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <form
                      className="mt-2 flex max-w-md gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const label = String(fd.get("preset") ?? "");
                        addPreset(major.id, label);
                        e.currentTarget.reset();
                      }}
                    >
                      <input name="preset" spellCheck={false} placeholder="새 라벨" className={inputCls} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        추가
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={addMajor}
            className="mt-4 rounded-lg border border-dashed border-zinc-400 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-500 dark:text-zinc-300"
          >
            + 대분류 추가
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-zinc-500 dark:text-zinc-400">행 추가:</span>
        {sortMajors(state.majors).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => addRow(m.id)}
            className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {m.name} +
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-300 dark:border-zinc-600">
        <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-200 dark:bg-zinc-800">
                <th className="border border-zinc-400 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                  대분류
                </th>
                <th className="border border-zinc-400 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                  소분류
                </th>
                <th className="border border-zinc-400 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                  세부 내용
                </th>
                <th className="border border-zinc-400 px-2 py-2 text-left font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                  체크 사항
                </th>
                <th className="w-32 border border-zinc-400 px-1 py-2 text-center font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ major, rows: groupRows }) => {
                if (groupRows.length === 0) {
                  return (
                    <tr key={`empty-${major.id}`} className="bg-white dark:bg-zinc-950">
                      <td
                        className="align-top border border-zinc-400 bg-zinc-100 px-2 py-2 font-semibold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        rowSpan={1}
                      >
                        {major.name}
                      </td>
                      <td
                        colSpan={3}
                        className="border border-zinc-400 px-3 py-4 text-center text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                      >
                        행이 없습니다. 위 「{major.name} +」로 추가하세요.
                      </td>
                      <td className="border border-zinc-400 p-1 dark:border-zinc-600" />
                    </tr>
                  );
                }
                return groupRows.map((row, idx) => (
                  <tr key={row.id} className="bg-white dark:bg-zinc-950">
                    {idx === 0 ? (
                      <td
                        rowSpan={groupRows.length}
                        className="align-top border border-zinc-400 bg-zinc-100 px-2 py-2 font-semibold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                      >
                        {major.name}
                      </td>
                    ) : null}
                    <td className="border border-zinc-400 p-1 dark:border-zinc-600">
                      {idx === 0 && major.id !== "__orphan__" ? (
                        <datalist id={`presets-${major.id}`}>
                          {(presetsByMajor.get(major.id) ?? []).map((p) => (
                            <option key={p.id} value={p.label} />
                          ))}
                        </datalist>
                      ) : null}
                      <input
                        type="text"
                        spellCheck={false}
                        value={row.minor}
                        onChange={(e) => patchRow(row.id, { minor: e.target.value })}
                        className={cellInputCls}
                        placeholder="프로젝트·항목명"
                        list={major.id !== "__orphan__" ? `presets-${major.id}` : undefined}
                      />
                      {major.id !== "__orphan__" && (presetsByMajor.get(major.id) ?? []).length > 0 ? (
                        <select
                          className={`${cellInputCls} mt-0.5 text-xs text-zinc-600 dark:text-zinc-400`}
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) patchRow(row.id, { minor: v });
                            e.target.value = "";
                          }}
                        >
                          <option value="">빠른 입력…</option>
                          {(presetsByMajor.get(major.id) ?? []).map((p) => (
                            <option key={p.id} value={p.label}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                    <td className="border border-zinc-400 p-1 dark:border-zinc-600">
                      <input
                        type="text"
                        spellCheck={false}
                        value={row.details}
                        onChange={(e) => patchRow(row.id, { details: e.target.value })}
                        className={cellInputCls}
                        placeholder="세부 내용"
                      />
                    </td>
                    <td className="border border-zinc-400 p-1 dark:border-zinc-600">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          spellCheck={false}
                          value={row.checklist}
                          onChange={(e) => patchRow(row.id, { checklist: e.target.value })}
                          className={
                            row.urgent
                              ? `${cellInputCls} min-w-0 flex-1 text-red-600 dark:text-red-400`
                              : `${cellInputCls} min-w-0 flex-1`
                          }
                          placeholder="마감·계약·주의 사항 등"
                        />
                        <label
                          className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400"
                          title="긴급 표시(빨간 글자)"
                        >
                          <input
                            type="checkbox"
                            checked={row.urgent}
                            onChange={(e) => patchRow(row.id, { urgent: e.target.checked })}
                          />
                          긴급
                        </label>
                      </div>
                    </td>
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
                          disabled={idx === groupRows.length - 1}
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
                ));
              })}
            </tbody>
          </table>
        </div>

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <h2 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">인물별 주간 표</h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          행은 인물, 열은 월~금입니다. 아래 <strong className="font-medium text-zinc-700 dark:text-zinc-300">기간 탭</strong>
          과 함께 저장·전환됩니다.
        </p>
        <WeeklyAgendaPersonGrid grid={state.personGrid} onChange={updatePersonGrid} />
      </div>

      {/* 뷰포트 하단 고정 — 스크롤되는 표와 분리 */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-11 shrink-0 items-end gap-0.5 overflow-x-auto border-t border-zinc-300 bg-zinc-200/95 px-1 pt-0.5 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/95 dark:shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.35)] md:left-52"
        role="tablist"
        aria-label="기간별 시트"
        onDragEnd={() => {
          setTabDragOverId(null);
          setTabDragOverEnd(false);
        }}
      >
        {sortedSheets.map((s) => {
          const active = s.id === workbook.activeSheetId;
          const dropHighlight = tabDragOverId === s.id;
          return (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-weekly-agenda-sheet", s.id);
                e.dataTransfer.setData("text/plain", s.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setTabDragOverEnd(false);
                setTabDragOverId(s.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setTabDragOverId(null);
                const dragId =
                  e.dataTransfer.getData("application/x-weekly-agenda-sheet") ||
                  e.dataTransfer.getData("text/plain");
                if (dragId) reorderSheetTabs(dragId, s.id);
              }}
              className={`group flex max-w-[11rem] shrink-0 cursor-grab items-stretch rounded-t-md border border-b-0 text-left text-xs font-medium transition-colors active:cursor-grabbing ${
                dropHighlight ? "ring-2 ring-emerald-500 ring-offset-1 ring-offset-zinc-200 dark:ring-offset-zinc-800" : ""
              } ${
                active
                  ? "border-zinc-400 bg-white text-zinc-900 dark:border-zinc-500 dark:bg-zinc-950 dark:text-zinc-50"
                  : "border-transparent bg-zinc-300/70 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700/80 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
              title="드래그하여 순서 변경 · 더블 클릭: 이름 수정"
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                draggable={false}
                onClick={() => setActiveSheetId(s.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  renameTabByDoubleClick(s.id, s.label);
                }}
                className="min-w-0 flex-1 truncate px-2.5 py-2 text-left"
              >
                {s.label}
              </button>
              {workbook.sheets.length > 1 ? (
                <button
                  type="button"
                  draggable={false}
                  className="shrink-0 px-1.5 py-2 text-zinc-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  aria-label={`${s.label} 탭 삭제`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSheetTab(s.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
        {/* 맨 끝으로 옮길 때 놓는 영역 (+ 버튼 왼쪽) */}
        <div
          aria-hidden
          className={`mb-px min-h-8 min-w-[12px] flex-1 self-stretch rounded-sm transition-colors ${
            tabDragOverEnd ? "bg-emerald-400/35 dark:bg-emerald-500/25" : "hover:bg-zinc-300/40 dark:hover:bg-zinc-600/40"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setTabDragOverId(null);
            setTabDragOverEnd(true);
          }}
          onDragLeave={() => setTabDragOverEnd(false)}
          onDrop={(e) => {
            e.preventDefault();
            setTabDragOverEnd(false);
            const dragId =
              e.dataTransfer.getData("application/x-weekly-agenda-sheet") ||
              e.dataTransfer.getData("text/plain");
            if (dragId) moveSheetTabToEnd(dragId);
          }}
        />
        <button
          type="button"
          onClick={addSheetTab}
          className="mb-px shrink-0 rounded-t-md border border-transparent bg-zinc-300/50 px-2.5 py-1.5 text-base font-light leading-none text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700/50 dark:text-zinc-300 dark:hover:bg-zinc-600"
          title="새 기간 시트"
        >
          +
        </button>
      </div>
    </div>
  );
}
