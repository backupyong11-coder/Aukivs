"use client";

import { useEffect, useRef, useState } from "react";
import { SheetDateInlineCell } from "@/components/SheetDateInlineCell";
import { TableTruncatedText } from "@/components/TableTruncatedText";
import { WorkGenreInlineCell } from "@/components/WorkGenreInlineCell";
import { isSheetTableDateField } from "@/lib/tableDateFields";
import { WORK_GENRE_FIELD } from "@/lib/worksGenre";

type Props = {
  value: string;
  field: string;
  rowId: string;
  disabled?: boolean;
  boolean?: boolean;
  required?: boolean;
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
  genreOptions: string[];
  onGenresChange: (next: string[]) => void;
  onSave: (rowId: string, field: string, nextValue: string) => Promise<void>;
};

export function isWorksBoolValue(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "YES" || v === "Y" || v === "O" || v === "✓";
}

export function boolToCell(checked: boolean): string {
  return checked ? "TRUE" : "";
}

export function WorksMasterInlineCell({
  value,
  field,
  rowId,
  disabled = false,
  boolean = false,
  required = false,
  wide = false,
  muted = false,
  tabular = false,
  genreOptions,
  onGenresChange,
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

  if (field === WORK_GENRE_FIELD) {
    return (
      <WorkGenreInlineCell
        value={value}
        rowId={rowId}
        disabled={disabled}
        genreOptions={genreOptions}
        onGenresChange={onGenresChange}
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
        checked={isWorksBoolValue(value)}
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
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={disabled || saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full min-w-[4rem] rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-900"
      />
    );
  }

  return (
    <div className="min-w-0 w-full max-w-full">
      <TableTruncatedText
        value={value.trim() || "—"}
        disabled={disabled}
        muted={muted || !value.trim()}
        tabular={tabular}
        onRequestEdit={() => setEditing(true)}
      />
    </div>
  );
}
