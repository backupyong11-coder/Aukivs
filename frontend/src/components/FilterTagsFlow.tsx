"use client";

import { Fragment } from "react";

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
      ? "border-zinc-700 bg-zinc-700 text-white shadow-sm hover:bg-zinc-800 dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
      : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
  }`;
}

export function FilterTagsFlow(props: {
  groups: FilterTagGroup[];
  listLabel: (key: string) => string;
}) {
  const visible = props.groups.filter(g => g.keys.length > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      {visible.map((group, gi) => (
        <Fragment key={group.title}>
          {gi > 0 ? (
            <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-zinc-300 sm:inline-block dark:bg-zinc-600" aria-hidden />
          ) : null}
          <span className="shrink-0 text-xs font-semibold text-zinc-600 dark:text-zinc-400">{group.title}</span>
          <button type="button" onClick={group.onShowAll}
            className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체</button>
          <button type="button" onClick={group.onHideAll}
            className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">전체숨김</button>
          {group.keys.map(key => {
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
        </Fragment>
      ))}
    </div>
  );
}
