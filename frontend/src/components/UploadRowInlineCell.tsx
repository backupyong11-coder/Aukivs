"use client";

import { useEffect, useRef, useState } from "react";
import { SheetDateInlineCell } from "@/components/SheetDateInlineCell";
import { TableTruncatedText } from "@/components/TableTruncatedText";
import { isSheetTableDateField } from "@/lib/tableDateFields";

export type EditableUploadRowField =
  | "업로드일"
  | "플랫폼명"
  | "대분류"
  | "작품명"
  | "업로드화수"
  | "남은업로드화수"
  | "업로드완료여부"
  | "업로드주기"
  | "업로드요일"
  | "업로드방식"
  | "런칭일"
  | "마지막업로드일"
  | "다음업로드일"
  | "원고준비"
  | "업로드링크"
  | "마지막업로드회수"
  | "비고";

type Props = {
  value: string;
  field: EditableUploadRowField;
  rowId: string;
  disabled?: boolean;
  align?: "left" | "center";
  className?: string;
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
  onSave: (rowId: string, field: EditableUploadRowField, nextValue: string) => Promise<void>;
};

export function UploadRowInlineCell({
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

  if (isSheetTableDateField(field)) {
    return (
      <SheetDateInlineCell
        value={value}
        field={field}
        rowId={rowId}
        disabled={disabled}
        align={align}
        className={className}
        wide={wide}
        muted={muted}
        tabular={tabular}
        onSave={(id, f, v) => onSave(id, f as EditableUploadRowField, v)}
      />
    );
  }

  async function commit() {
    const trimmed = draft.trim();
    if (field === "작품명" && !trimmed) {
      setDraft(value);
      setEditing(false);
      return;
    }
    const next = field === "작품명" ? trimmed : draft;
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
        className={`w-full min-w-0 max-w-full rounded border border-zinc-400 bg-white px-1 py-0.5 text-xs shadow-sm outline-none ring-1 ring-zinc-400/40 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100 ${alignCls} ${className}`}
      />
    );
  }

  return (
    <div className={`min-w-0 w-full max-w-full ${className}`}>
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
