"use client";

import { useEffect, useRef, useState } from "react";
import { SheetDateInlineCell } from "@/components/SheetDateInlineCell";
import { TableTruncatedText } from "@/components/TableTruncatedText";
import { TagSelectInlineCell, isPriorityTagField } from "@/components/TagSelectInlineCell";
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

  if (isPriorityTagField(field)) {
    return (
      <TagSelectInlineCell
        value={value}
        field={field}
        rowId={rowId}
        disabled={disabled}
        align={align}
        onSave={onSave}
      />
    );
  }

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
        className={`w-full min-w-0 max-w-full rounded border border-zinc-400 bg-white px-1 py-0.5 text-xs shadow-sm outline-none ring-1 ring-zinc-400/40 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100 ${alignCls}`}
      />
    );
  }

  return (
    <div className="min-w-0 w-full max-w-full">
      <TableTruncatedText
        value={value}
        disabled={disabled}
        align={align}
        muted={muted}
        tabular={tabular}
        onRequestEdit={() => setEditing(true)}
      />
    </div>
  );
}
