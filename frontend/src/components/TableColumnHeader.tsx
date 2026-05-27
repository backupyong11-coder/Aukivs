"use client";

import { useEffect, useRef, useState } from "react";

const menuBtn =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200";

const menuItem =
  "block w-full rounded px-2 py-1.5 text-left text-[11px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800";

const menuItemDanger =
  "block w-full rounded px-2 py-1.5 text-left text-[11px] text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40";

export function TableColumnHeader(props: {
  field: string;
  label: string;
  widthPx: number;
  onResizeStart: (clientX: number) => void;
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
  onDelete: () => void;
}) {
  const {
    label,
    widthPx,
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
    onDelete,
    onResizeStart,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <th
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        width: widthPx,
        minWidth: widthPx,
        maxWidth: widthPx,
      }}
      className={`group relative align-top font-semibold text-zinc-600 dark:text-zinc-400 ${
        dragActive ? "bg-zinc-200/80 dark:bg-zinc-700/80" : ""
      }`}
    >
      <div className="relative flex min-h-[2.125rem] items-center overflow-hidden py-1 pl-4 pr-1">
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 cursor-grab text-[10px] leading-none text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-500"
          aria-hidden
          title="드래그하여 열 이동"
        >
          ⋮⋮
        </span>

        <span className="relative inline-block min-w-0 max-w-full shrink" title={label}>
          <span className="whitespace-nowrap text-left text-[11px] leading-snug text-zinc-700 dark:text-zinc-200">
            {label}
            {sortActive ? (
              <span className="ml-0.5 font-normal text-zinc-500" aria-hidden>
                {sortDir === "asc" ? " ↑" : " ↓"}
              </span>
            ) : null}
          </span>

          <div
            ref={menuRef}
            className="absolute left-full top-1/2 z-20 ml-px -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[:focus-visible]:opacity-100"
            style={menuOpen ? { opacity: 1 } : undefined}
          >
          <button
            type="button"
            className={`${menuBtn} ${menuOpen ? "bg-zinc-200/80 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="열 메뉴"
            aria-label={`${label} 메뉴`}
          >
            <span className="text-sm leading-none" aria-hidden>
              ⋯
            </span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-0.5 min-w-[7.5rem] rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
            >
              {sortable && onSort ? (
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => {
                    onSort();
                    closeMenu();
                  }}
                >
                  정렬{sortActive ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  onHide();
                  closeMenu();
                }}
              >
                숨기기
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  onEdit();
                  closeMenu();
                }}
              >
                이름 편집
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemDanger}
                onClick={() => {
                  onDelete();
                  closeMenu();
                }}
              >
                제거
              </button>
            </div>
          ) : null}
          </div>
        </span>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label} 열 너비 조절`}
        title="드래그하여 열 너비 조절"
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-zinc-400/50 active:bg-zinc-500/60 dark:hover:bg-zinc-500/50"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(e.clientX);
        }}
      />
    </th>
  );
}

/** 데이터 셀 — colgroup 너비에 맞춰 넘침 숨김 */
export const tableDataCellClass = "overflow-hidden px-2 py-1.5 align-top";
