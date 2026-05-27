"use client";

export function TableListFooter(props: {
  colSpan: number;
  canLoadMore: boolean;
  onLoadMore: () => void;
  onNewPage: () => void;
  creating?: boolean;
  newPageLabel?: string;
}) {
  const {
    colSpan,
    canLoadMore,
    onLoadMore,
    onNewPage,
    creating = false,
    newPageLabel = "새 페이지",
  } = props;

  return (
    <>
      {canLoadMore ? (
        <tr className="border-b border-zinc-100 dark:border-zinc-800">
          <td colSpan={colSpan} className="px-2 py-0.5 align-middle">
            <button
              type="button"
              onClick={onLoadMore}
              className="group flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
            >
              <span className="text-xs text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" aria-hidden>
                ↓
              </span>
              <span>더 불러오기</span>
            </button>
          </td>
        </tr>
      ) : null}
      <tr className="border-t border-zinc-200 dark:border-zinc-700">
        <td colSpan={colSpan} className="px-2 py-0.5 align-middle">
          <button
            type="button"
            onClick={onNewPage}
            disabled={creating}
            className="group flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
          >
            <span className="text-base leading-none text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" aria-hidden>
              +
            </span>
            <span>{creating ? "추가 중…" : newPageLabel}</span>
          </button>
        </td>
      </tr>
    </>
  );
}
