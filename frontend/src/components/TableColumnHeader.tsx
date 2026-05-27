"use client";

const iconBtn =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200/80 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200";

function IconSort({ active, dir }: { active: boolean; dir?: "asc" | "desc" }) {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      {!active ? (
        <path d="M4 6h8v1H4V6zm0 3h5v1H4V9zm0 3h3v1H4v-1zM11 4l3 3h-2v5h-2V7H8l3-3z" opacity="0.45" />
      ) : dir === "asc" ? (
        <path d="M8 3l4 5H4l4-5zm0 10V8h2v5H8z" />
      ) : (
        <path d="M8 13l-4-5h8l-4 5zm0-10v5H6V3h2z" />
      )}
    </svg>
  );
}

function IconEye() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
    </svg>
  );
}

function IconMajor() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 4h5v8H2V4zm7 0h5v5h-5V4zm0 7h5v1h-5v-1z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 4h10M6 4V3h4v1M5 7v5M8 7v5M11 7v5M4 4l.5 9h7L12 4" />
    </svg>
  );
}

export function TableColumnHeader(props: {
  field: string;
  label: string;
  dragActive?: boolean;
  sortable?: boolean;
  sortActive?: boolean;
  sortDir?: "asc" | "desc";
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onSort?: () => void;
  onHide: () => void;
  onEdit: () => void;
  onSetMajor?: () => void;
  majorHint?: string;
  onDelete: () => void;
}) {
  const {
    label,
    dragActive,
    sortable = true,
    sortActive,
    sortDir,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    onSort,
    onHide,
    onEdit,
    onSetMajor,
    majorHint,
    onDelete,
  } = props;

  return (
    <th
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group min-w-[6.5rem] align-top font-semibold text-zinc-600 dark:text-zinc-400 ${
        dragActive ? "bg-zinc-200/80 dark:bg-zinc-700/80" : ""
      }`}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1.5">
        <span
          className="shrink-0 cursor-grab text-[10px] leading-none text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
          aria-hidden
          title="드래그하여 열 이동"
        >
          ⋮⋮
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[11px]" title={majorHint ? `${label} · ${majorHint}` : label}>
          <span className="block truncate">{label}</span>
          {majorHint ? (
            <span className="block truncate text-[9px] font-normal text-zinc-400 dark:text-zinc-500">
              {majorHint}
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-px opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {sortable && onSort ? (
            <button
              type="button"
              className={`${iconBtn} ${sortActive ? "text-zinc-700 dark:text-zinc-200" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSort();
              }}
              title="정렬"
              aria-label={`${label} 정렬`}
            >
              <IconSort active={!!sortActive} dir={sortDir} />
            </button>
          ) : null}
          <button
            type="button"
            className={iconBtn}
            onClick={(e) => {
              e.stopPropagation();
              onHide();
            }}
            title="열 숨기기"
            aria-label={`${label} 숨기기`}
          >
            <IconEye />
          </button>
          {onSetMajor ? (
            <button
              type="button"
              className={iconBtn}
              onClick={(e) => {
                e.stopPropagation();
                onSetMajor();
              }}
              title="대분류 지정"
              aria-label={`${label} 대분류`}
            >
              <IconMajor />
            </button>
          ) : null}
          <button
            type="button"
            className={iconBtn}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="열 이름 편집"
            aria-label={`${label} 이름 편집`}
          >
            <IconEdit />
          </button>
          <button
            type="button"
            className={`${iconBtn} hover:text-red-600 dark:hover:text-red-400`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="열 제거(숨김)"
            aria-label={`${label} 제거`}
          >
            <IconDelete />
          </button>
        </div>
      </div>
    </th>
  );
}
