"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  disabled?: boolean;
  align?: "left" | "center";
  muted?: boolean;
  tabular?: boolean;
  className?: string;
  onRequestEdit?: () => void;
};

/** 셀 너비 안에서 줄임표 + 클릭 시 전문 팝오버, 더블클릭 시 편집 */
export function TableTruncatedText({
  value,
  disabled = false,
  align = "left",
  muted = false,
  tabular = false,
  className = "",
  onRequestEdit,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const text = value;

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [previewOpen, updatePosition]);

  useEffect(() => {
    if (!previewOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setPreviewOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [previewOpen]);

  const alignCls = align === "center" ? "text-center" : "text-left";
  const toneCls = muted ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50";

  const popover =
    previewOpen && text.trim() && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className="fixed z-[200] max-w-[min(24rem,calc(100vw-1.5rem))] rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
            style={{ top: pos.top, left: pos.left }}
            role="dialog"
            aria-label="전체 내용"
          >
            <p className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-100">
              {text}
            </p>
            {onRequestEdit && !disabled ? (
              <button
                type="button"
                className="mt-2 rounded border border-zinc-300 px-2 py-1 text-[11px] font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                onClick={() => {
                  setPreviewOpen(false);
                  onRequestEdit();
                }}
              >
                편집
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={(e) => {
          if (disabled) return;
          if (!text.trim()) {
            onRequestEdit?.();
            return;
          }
          e.stopPropagation();
          updatePosition();
          setPreviewOpen(true);
        }}
        onDoubleClick={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          setPreviewOpen(false);
          onRequestEdit?.();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (!text.trim()) onRequestEdit?.();
            else {
              updatePosition();
              setPreviewOpen(true);
            }
          }
        }}
        title={disabled ? undefined : "클릭: 전체 보기 · 더블클릭: 편집"}
        className={`block w-full min-w-0 max-w-full cursor-pointer truncate rounded px-0.5 py-0 ${alignCls} ${toneCls} ${tabular ? "tabular-nums" : ""} ${
          disabled ? "cursor-default opacity-60" : "hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90"
        } ${className}`}
      >
        {text.trim() || (
          <span className="font-normal text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </span>
      {popover}
    </>
  );
}
