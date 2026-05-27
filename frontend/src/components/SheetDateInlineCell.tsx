"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SheetMiniCalendar } from "@/components/SheetMiniCalendar";
import { normalizeSheetDateYmd } from "@/lib/sheetDates";

type Props = {
  value: string;
  field: string;
  rowId: string;
  disabled?: boolean;
  align?: "left" | "center";
  className?: string;
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
  onSave: (rowId: string, field: string, nextValue: string) => Promise<void>;
};

function displayDate(raw: string): string {
  const ymd = normalizeSheetDateYmd(raw);
  if (ymd) return ymd;
  const t = raw.trim();
  return t || "";
}

export function SheetDateInlineCell({
  value,
  field,
  rowId,
  disabled = false,
  align = "left",
  className = "",
  wide = false,
  muted = false,
  tabular = false,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function apply(next: string) {
    const normalized = normalizeSheetDateYmd(next) ?? next.trim();
    if (normalized === (normalizeSheetDateYmd(value) ?? value.trim())) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(rowId, field, normalized);
      setOpen(false);
    } catch {
      /* parent shows error */
    } finally {
      setSaving(false);
    }
  }

  const alignCls = align === "center" ? "text-center" : "text-left";
  const toneCls = muted ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50";
  const shown = displayDate(value);

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className="fixed z-[200]"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <SheetMiniCalendar
              value={value}
              onSelect={(ymd) => void apply(ymd)}
              onClear={() => void apply("")}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="min-w-0 w-full max-w-full">
      <span
        ref={anchorRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (!disabled && !saving) {
            updatePosition();
            setOpen((o) => !o);
          }
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            updatePosition();
            setOpen(true);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        title={disabled ? undefined : "클릭하여 날짜 선택"}
        className={`block w-full min-w-0 max-w-full cursor-pointer truncate rounded px-0.5 py-0 transition-colors ${alignCls} ${toneCls} ${tabular ? "tabular-nums" : ""} ${
          hovered && !disabled
            ? "bg-zinc-100/90 ring-1 ring-inset ring-zinc-300 dark:bg-zinc-800/90 dark:ring-zinc-600"
            : ""
        } ${disabled || saving ? "cursor-default opacity-60" : ""} ${className}`}
      >
        {shown || <span className="font-normal text-zinc-300 dark:text-zinc-600">—</span>}
      </span>
      {popover}
    </div>
  );
}
