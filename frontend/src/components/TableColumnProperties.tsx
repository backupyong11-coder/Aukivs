"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnMajorGroup } from "@/lib/tableColumnMajorGroups";

const chipBtn = (active: boolean) =>
  `rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
    active
      ? "border-zinc-500 bg-zinc-500 text-zinc-50 dark:border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900"
      : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;

const miniBtn =
  "rounded px-1 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200";

export function TableColumnProperties(props: {
  allKeys: string[];
  hiddenColumns: Set<string>;
  onSetVisible: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  labelForKey?: (key: string) => string;
  majorGroups?: {
    majors: ColumnMajorGroup[];
    majorForKey: (key: string) => string;
    majorName: (majorId: string) => string;
    onSetColumnMajor: (key: string, majorId: string) => void;
    onAddMajor: (name: string) => string | null;
    onRenameMajor: (majorId: string) => void;
    onDeleteMajor: (majorId: string) => void;
    groupKeys: (keys: string[]) => { major: ColumnMajorGroup; keys: string[] }[];
  };
}) {
  const {
    allKeys,
    hiddenColumns,
    onSetVisible,
    onShowAll,
    labelForKey = (k) => k,
    majorGroups,
  } = props;
  const [open, setOpen] = useState(false);
  const [majorPanelOpen, setMajorPanelOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hiddenKeys = allKeys.filter((k) => hiddenColumns.has(k));
  const visibleCount = allKeys.length - hiddenKeys.length;

  const groupedHidden = majorGroups ? majorGroups.groupKeys(hiddenKeys) : null;
  const groupedAll = majorGroups ? majorGroups.groupKeys(allKeys) : null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const renderKeyRow = (key: string, visible: boolean) => (
    <li key={key}>
      <div className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => onSetVisible(key, e.target.checked)}
            className="h-3.5 w-3.5 shrink-0 accent-zinc-700 dark:accent-zinc-300"
          />
          <span
            className={`truncate text-[11px] ${
              visible
                ? "text-zinc-800 dark:text-zinc-100"
                : "text-zinc-400 line-through dark:text-zinc-500"
            }`}
          >
            {labelForKey(key)}
          </span>
        </label>
        {majorGroups ? (
          <select
            value={majorGroups.majorForKey(key)}
            onChange={(e) => majorGroups.onSetColumnMajor(key, e.target.value)}
            className="max-w-[5.5rem] shrink-0 rounded border border-zinc-200 bg-white px-0.5 py-0 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            aria-label={`${labelForKey(key)} 대분류`}
            title="대분류"
          >
            {majorGroups.majors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </li>
  );

  const renderMajorSection = (
    sections: { major: ColumnMajorGroup; keys: string[] }[],
    sectionKey: string,
  ) =>
    sections
      .filter((s) => s.keys.length > 0)
      .map(({ major, keys }) => (
        <div key={`${sectionKey}-${major.id}`} className="mb-2 last:mb-0">
          <p className="mb-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
            {major.name}
            <span className="ml-1 font-normal text-zinc-400">({keys.length})</span>
          </p>
          <ul className="space-y-0.5">
            {keys.map((key) => renderKeyRow(key, !hiddenColumns.has(key)))}
          </ul>
        </div>
      ));

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className={chipBtn(open)}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="표에 표시할 열(속성)·대분류"
      >
        속성
        {hiddenKeys.length > 0 ? (
          <span className="ml-0.5 tabular-nums text-zinc-400 dark:text-zinc-500">
            {hiddenKeys.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="열 속성"
          className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,92vw)] rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-2.5 pb-2 dark:border-zinc-800">
            <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
              열 표시 ({visibleCount}/{allKeys.length})
            </p>
            {hiddenKeys.length > 0 ? (
              <button type="button" onClick={() => onShowAll()} className={miniBtn}>
                전부 표시
              </button>
            ) : null}
          </div>

          {majorGroups ? (
            <div className="border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  대분류
                </p>
                <button
                  type="button"
                  className={miniBtn}
                  onClick={() => setMajorPanelOpen((o) => !o)}
                >
                  {majorPanelOpen ? "접기" : "관리"}
                </button>
              </div>
              {majorPanelOpen ? (
                <ul className="mb-2 max-h-28 space-y-1 overflow-y-auto">
                  {majorGroups.majors.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-1 rounded bg-zinc-50 px-1.5 py-1 dark:bg-zinc-900"
                    >
                      <span className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                        {m.name}
                      </span>
                      <span className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className={miniBtn}
                          onClick={() => majorGroups.onRenameMajor(m.id)}
                        >
                          이름
                        </button>
                        {m.id !== "default" ? (
                          <button
                            type="button"
                            className={`${miniBtn} text-red-600 dark:text-red-400`}
                            onClick={() => majorGroups.onDeleteMajor(m.id)}
                          >
                            삭제
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="button"
                className={`${chipBtn(false)} w-full`}
                onClick={() => {
                  const name = window.prompt("새 대분류 이름");
                  if (name === null) return;
                  majorGroups.onAddMajor(name);
                }}
              >
                + 대분류 추가
              </button>
            </div>
          ) : null}

          {hiddenKeys.length > 0 ? (
            <div className="border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                숨긴 속성
              </p>
              {groupedHidden ? (
                <div className="max-h-36 overflow-y-auto">{renderMajorSection(groupedHidden, "hidden")}</div>
              ) : (
                <ul className="max-h-36 space-y-1 overflow-y-auto">
                  {hiddenKeys.map((key) => renderKeyRow(key, false))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="px-2.5 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              모든 속성
            </p>
            <div className="max-h-52 overflow-y-auto">
              {groupedAll && majorGroups ? (
                renderMajorSection(groupedAll, "all")
              ) : (
                <ul className="space-y-1">
                  {allKeys.map((key) => renderKeyRow(key, !hiddenColumns.has(key)))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
