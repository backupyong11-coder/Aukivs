"use client";

import { useEffect, useRef, useState } from "react";

export type EditableUploadRowField =
  | "업로드일"
  | "플랫폼명"
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
  const fontCls = field === "작품명" ? "font-medium" : "";

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
        className={`w-full min-w-0 rounded border border-zinc-400 bg-white px-1 py-0.5 text-xs shadow-sm outline-none ring-1 ring-zinc-400/40 dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-100 ${alignCls} ${wide ? "max-w-[320px]" : ""} ${className}`}
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
      className={`block min-h-[1.25rem] min-w-[1.5rem] cursor-text rounded px-0.5 py-0 transition-colors ${alignCls} ${toneCls} ${fontCls} ${tabular ? "tabular-nums" : ""} ${
        wide ? "max-w-[320px] truncate" : "truncate"
      } ${
        hovered && !disabled
          ? "bg-zinc-100/90 ring-1 ring-inset ring-zinc-300 dark:bg-zinc-800/90 dark:ring-zinc-600"
          : ""
      } ${disabled ? "cursor-default opacity-60" : ""} ${className}`}
    >
      {value || <span className="font-normal text-zinc-300 dark:text-zinc-600">—</span>}
    </span>
  );
}
