"use client";

import { useCallback, useState } from "react";

export type FilterTagGroup = {
  title: string;
  keys: string[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
};

function filterTagBtnClass(active: boolean) {
  return `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
    active
      ? "border-zinc-500 bg-zinc-500 text-zinc-50 hover:bg-zinc-600 dark:border-zinc-500 dark:bg-zinc-500 dark:text-zinc-100 dark:hover:bg-zinc-400"
      : "border-zinc-300 bg-zinc-100 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
  }`;
}

export function FilterTagsFlow(props: {
  groups: FilterTagGroup[];
  listLabel: (key: string) => string;
}) {
  const visible = props.groups.filter((g) => g.keys.length > 0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isGroupOpen = useCallback(
    (title: string) => expanded[title] !== false,
    [expanded],
  );

  const toggleGroup = (title: string) => {
    setExpanded((prev) => ({
      ...prev,
      [title]: prev[title] === false,
    }));
  };

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      {visible.map((group) => {
        const open = isGroupOpen(group.title);
        return (
          <div
            key={group.title}
            className="rounded-lg border border-zinc-200/90 bg-white/60 dark:border-zinc-700/80 dark:bg-zinc-950/30"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={open}
                className="flex shrink-0 items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <span
                  className={`inline-block text-[10px] text-zinc-400 transition-transform dark:text-zinc-500 ${
                    open ? "" : "-rotate-90"
                  }`}
                  aria-hidden
                >
                  ▼
                </span>
                <span>{group.title}</span>
                <span className="font-normal text-zinc-400 dark:text-zinc-500">
                  ({group.keys.length})
                </span>
              </button>
              <span className="hidden h-3 w-px shrink-0 bg-zinc-300 sm:inline-block dark:bg-zinc-600" aria-hidden />
              <button
                type="button"
                onClick={group.onShowAll}
                className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                전체
              </button>
              <button
                type="button"
                onClick={group.onHideAll}
                className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                전체숨김
              </button>
            </div>
            {open ? (
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-2.5 pb-2.5 pt-2 dark:border-zinc-800">
                {group.keys.map((key) => {
                  const active = !group.hidden.has(key);
                  return (
                    <button
                      key={`${group.title}-${key || "__empty__"}`}
                      type="button"
                      onClick={() => group.onToggle(key)}
                      aria-pressed={active}
                      className={filterTagBtnClass(active)}
                    >
                      {props.listLabel(key)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
