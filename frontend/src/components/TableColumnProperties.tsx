"use client";

import { useEffect, useRef, useState } from "react";

const chipBtn = (active: boolean) =>
  `rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
    active
      ? "border-zinc-500 bg-zinc-500 text-zinc-50 dark:border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900"
      : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
  }`;

export function TableColumnProperties(props: {
  allKeys: string[];
  hiddenColumns: Set<string>;
  onSetVisible: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  labelForKey?: (key: string) => string;
}) {
  const { allKeys, hiddenColumns, onSetVisible, onShowAll, labelForKey = (k) => k } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hiddenKeys = allKeys.filter((k) => hiddenColumns.has(k));
  const visibleCount = allKeys.length - hiddenKeys.length;

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

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className={chipBtn(open)}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="표에 표시할 열(속성) 선택"
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
          className="absolute right-0 top-full z-50 mt-1 w-[min(16rem,85vw)] rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-2.5 pb-2 dark:border-zinc-800">
            <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
              열 표시 ({visibleCount}/{allKeys.length})
            </p>
            {hiddenKeys.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onShowAll();
                }}
                className="text-[10px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                전부 표시
              </button>
            ) : null}
          </div>

          {hiddenKeys.length > 0 ? (
            <div className="border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                숨긴 속성
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {hiddenKeys.map((key) => (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onSetVisible(key, true)}
                        className="h-3.5 w-3.5 accent-zinc-700 dark:accent-zinc-300"
                      />
                      <span className="truncate text-[11px] text-zinc-700 dark:text-zinc-300">
                        {labelForKey(key)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="px-2.5 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              모든 속성
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {allKeys.map((key) => {
                const visible = !hiddenColumns.has(key);
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(e) => onSetVisible(key, e.target.checked)}
                        className="h-3.5 w-3.5 accent-zinc-700 dark:accent-zinc-300"
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
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
