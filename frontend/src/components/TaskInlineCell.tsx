"use client";

import { useEffect, useRef, useState } from "react";

export type EditableTaskField =
  | "우선순위"
  | "마감일"
  | "분야"
  | "분류"
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
  | "피로도"
  | "상태"
  | "담당자"
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
  const fontCls = field === "업무명" ? "font-medium" : "";

  async function commit() {
    const trimmed = draft.trim();
    if (field === "업무명" && !trimmed) {
      setDraft(value);
      setEditing(false);
      return;
    }
    const next = field === "업무명" ? trimmed : draft;
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(taskId, field, next);
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
