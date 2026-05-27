"use client";

export function TableListFooter(props: {
  canLoadMore: boolean;
  onLoadMore: () => void;
  onNewPage: () => void;
  creating?: boolean;
  newPageLabel?: string;
}) {
  const {
    canLoadMore,
    onLoadMore,
    onNewPage,
    creating = false,
    newPageLabel = "새 페이지",
  } = props;

  const rowBtn =
    "group flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50";

  return (
    <div className="border-t border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      {canLoadMore ? (
        <button type="button" onClick={onLoadMore} className={rowBtn}>
          <span
            className="text-xs text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
            aria-hidden
          >
            ↓
          </span>
          <span>더 불러오기</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={onNewPage}
        disabled={creating}
        className={`${rowBtn} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span
          className="text-base leading-none text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
          aria-hidden
        >
          +
        </span>
        <span>{creating ? "추가 중…" : newPageLabel}</span>
      </button>
    </div>
  );
}
