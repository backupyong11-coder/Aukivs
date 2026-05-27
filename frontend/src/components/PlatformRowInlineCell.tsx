"use client";

import { useEffect, useRef, useState } from "react";
import { SheetDateInlineCell } from "@/components/SheetDateInlineCell";
import { isSheetTableDateField } from "@/lib/tableDateFields";

type Props = {
  value: string;
  field: string;
  rowId: string;
  disabled?: boolean;
  boolean?: boolean;
  required?: boolean;
  align?: "left" | "center";
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
  onSave: (rowId: string, field: string, nextValue: string) => Promise<void>;
};

export function isPlatformBoolValue(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "O" || v === "✓";
}

export function boolToCell(checked: boolean): string {
  return checked ? "TRUE" : "";
}

export function PlatformRowInlineCell({
  value,
  field,
  rowId,
  disabled = false,
  boolean = false,
  required = false,
  align = "left",
  wide = false,
  muted = false,
  tabular = false,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hovered, setHovered] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const alignCls = align === "center" ? "text-center" : "text-left";
  const toneCls = muted ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50";

  if (isSheetTableDateField(field)) {
    return (
      <SheetDateInlineCell
        value={value}
        field={field}
        rowId={rowId}
        disabled={disabled}
        align={align}
        wide={wide}
        muted={muted}
        tabular={tabular}
        onSave={onSave}
      />
    );
  }

  if (boolean) {
    return (
      <input
        type="checkbox"
        checked={isPlatformBoolValue(value)}
        disabled={disabled || saving}
        onChange={(e) => void onSave(rowId, field, boolToCell(e.target.checked))}
        aria-label={field}
        className="h-4 w-4 accent-emerald-600 disabled:opacity-50 dark:accent-emerald-400"
      />
    );
  }

  async function commit() {
    const trimmed = draft.trim();
    if (required && !trimmed) {
      setDraft(value);
      setEditing(false);
      return;
    }
    const next = required ? trimmed : draft;
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(rowId, field, next);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={`w-full min-w-0 rounded border border-zinc-400 bg-white px-1 py-0.5 text-xs shadow-sm outline-none ring-1 ring-zinc-400/40 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100 ${alignCls} ${wide ? "max-w-[280px]" : ""}`}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!disabled) setEditing(true);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      title={disabled ? undefined : "클릭하여 편집"}
      className={`block min-h-[1.25rem] min-w-[1.5rem] cursor-text rounded px-0.5 py-0 transition-colors ${alignCls} ${toneCls} ${tabular ? "tabular-nums" : ""} ${
        wide ? "max-w-[280px] truncate" : "truncate"
      } ${
        hovered && !disabled
          ? "bg-zinc-100/90 ring-1 ring-inset ring-zinc-300 dark:bg-zinc-800/90 dark:ring-zinc-600"
          : ""
      } ${disabled ? "cursor-default opacity-60" : ""}`}
    >
      {value || <span className="font-normal text-zinc-300 dark:text-zinc-600">—</span>}
    </span>
  );
}
