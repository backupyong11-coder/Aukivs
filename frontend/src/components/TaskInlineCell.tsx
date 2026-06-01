"use client";

import { useEffect, useRef, useState } from "react";
import { TableTruncatedText } from "@/components/TableTruncatedText";
import { TagSelectInlineCell, isPriorityTagField } from "@/components/TagSelectInlineCell";
import { isTaskDateField, toDateInputValue } from "@/lib/sheetDates";

export type EditableTaskField =
  | "우선순위"
  | "마감일"
  | "실행일"
  | "분야"
  | "분류"
  | "대분류"
  | "정량화 분"
  | "업무명"
  | "정량화"
  | "정량화 구분"
  | "시간"
  | "시간변환"
  | "관련플랫폼"
  | "세부수치"
  | "세부단위"
  | "관련작품"
  | "난이도"
  | "담당자"
  | "외부담당자"
  | "메모";

type Props = {
  value: string;
  field: EditableTaskField;
  taskId: string;
  disabled?: boolean;
  align?: "left" | "center";
  className?: string;
  wide?: boolean;
  muted?: boolean;
  tabular?: boolean;
  onSave: (taskId: string, field: EditableTaskField, nextValue: string) => Promise<void>;
};

function displayValue(field: EditableTaskField, value: string): string {
  if (!isTaskDateField(field)) return value;
  const normalized = toDateInputValue(value);
  return normalized || value;
}

function commitValue(field: EditableTaskField, draft: string): string {
  if (!isTaskDateField(field)) return draft;
  const trimmed = draft.trim();
  if (!trimmed) return "";
  return toDateInputValue(trimmed) || trimmed;
}

export function TaskInlineCell({
  value,
  field,
  taskId,
  disabled = false,
  align = "left",
  className = "",
  wide = false,
  muted = false,
  tabular = false,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => displayValue(field, value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(displayValue(field, value));
  }, [value, editing, field]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (!isTaskDateField(field)) inputRef.current.select();
    }
  }, [editing, field]);

  const alignCls = align === "center" ? "text-center" : "text-left";
  const shown = displayValue(field, value);

  async function commit() {
    const trimmed = draft.trim();
    if (field === "업무명" && !trimmed) {
      setDraft(shown);
      setEditing(false);
      return;
    }
    const next = field === "업무명" ? trimmed : commitValue(field, draft);
    if (next === shown) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(taskId, field, next);
      setEditing(false);
    } catch {
      setDraft(shown);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(shown);
    setEditing(false);
  }

  function startEdit() {
    setDraft(displayValue(field, value));
    setEditing(true);
  }

  if (isPriorityTagField(field)) {
    return (
      <TagSelectInlineCell
        value={value}
        field={field}
        rowId={taskId}
        disabled={disabled}
        align={align}
        onSave={(id, f, v) => onSave(id, f as EditableTaskField, v)}
      />
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={isTaskDateField(field) ? "date" : "text"}
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
        value={shown}
        disabled={disabled}
        align={align}
        muted={muted}
        tabular={tabular}
        onRequestEdit={startEdit}
      />
    </div>
  );
}
