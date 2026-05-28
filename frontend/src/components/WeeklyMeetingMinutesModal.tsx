"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  upsertWeeklyMeetingMinutes,
  deleteWeeklyMeetingMinutes,
  type WeeklyMeetingMinutesActionItem,
  type WeeklyMeetingMinutesItem,
} from "@/lib/weeklyMeetingMinutesApi";

type Props = {
  open: boolean;
  weekStart: string;
  initial?: WeeklyMeetingMinutesItem | null;
  onClose: () => void;
  onSaved?: (item: WeeklyMeetingMinutesItem) => void;
  onDeleted?: (weekStart: string) => void;
};

function blank(weekStart: string): WeeklyMeetingMinutesItem {
  return {
    week_start: weekStart,
    title: `${weekStart} 주간 회의록`,
    content: "",
    attendees: [],
    decisions: [],
    action_items: [],
    status: "draft",
    tags: [],
  };
}

function formatWeekLabel(ws: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ws);
  if (!m) return ws;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(y, mo - 1, d);
  const end = new Date(y, mo - 1, d + 4);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
  return `${fmt(start)} ~ ${fmt(end)} (월~금)`;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "작성 중" },
  { value: "scheduled", label: "예정" },
  { value: "in_review", label: "검토 중" },
  { value: "done", label: "완료" },
];

export function WeeklyMeetingMinutesModal({
  open,
  weekStart,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [form, setForm] = useState<WeeklyMeetingMinutesItem>(() => initial ?? blank(weekStart));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(initial ?? blank(weekStart));
    setDirty(false);
    setError(null);
  }, [initial, weekStart, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        if (dirty) {
          if (window.confirm("저장하지 않은 변경사항이 있습니다. 닫을까요?")) onClose();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, dirty, saving, onClose]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => titleInputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const weekLabel = useMemo(() => formatWeekLabel(form.week_start), [form.week_start]);

  function patch<K extends keyof WeeklyMeetingMinutesItem>(
    key: K,
    value: WeeklyMeetingMinutesItem[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function patchAction(idx: number, p: Partial<WeeklyMeetingMinutesActionItem>) {
    setForm((prev) => ({
      ...prev,
      action_items: prev.action_items.map((it, i) => (i === idx ? { ...it, ...p } : it)),
    }));
    setDirty(true);
  }

  function addAction() {
    setForm((prev) => ({
      ...prev,
      action_items: [...prev.action_items, { text: "", owner: "", due: "", done: false }],
    }));
    setDirty(true);
  }

  function removeAction(idx: number) {
    setForm((prev) => ({
      ...prev,
      action_items: prev.action_items.filter((_, i) => i !== idx),
    }));
    setDirty(true);
  }

  function patchList<K extends "attendees" | "decisions" | "tags">(
    key: K,
    idx: number,
    value: string,
  ) {
    setForm((prev) => {
      const list = [...prev[key]];
      list[idx] = value;
      return { ...prev, [key]: list };
    });
    setDirty(true);
  }

  function addToList(key: "attendees" | "decisions" | "tags") {
    setForm((prev) => ({ ...prev, [key]: [...prev[key], ""] }));
    setDirty(true);
  }

  function removeFromList(key: "attendees" | "decisions" | "tags", idx: number) {
    setForm((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const cleaned: WeeklyMeetingMinutesItem = {
      ...form,
      attendees: form.attendees.map((s) => s.trim()).filter(Boolean),
      decisions: form.decisions.map((s) => s.trim()).filter(Boolean),
      tags: form.tags.map((s) => s.trim()).filter(Boolean),
      action_items: form.action_items
        .map((a) => ({
          text: (a.text ?? "").trim(),
          owner: (a.owner ?? "").trim(),
          due: (a.due ?? "").trim(),
          done: !!a.done,
        }))
        .filter((a) => a.text.length > 0),
    };
    const r = await upsertWeeklyMeetingMinutes(cleaned);
    setSaving(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setDirty(false);
    onSaved?.(r.item);
    onClose();
  }

  async function handleDelete() {
    if (!window.confirm("이 주간 회의록을 삭제할까요?")) return;
    setSaving(true);
    setError(null);
    const r = await deleteWeeklyMeetingMinutes(form.week_start);
    setSaving(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onDeleted?.(form.week_start);
    onClose();
  }

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const fieldLabel = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  const chipCls =
    "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/50 p-2 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          if (dirty) {
            if (window.confirm("저장하지 않은 변경사항이 있습니다. 닫을까요?")) onClose();
          } else {
            onClose();
          }
        }
      }}
    >
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              주간 회의록 · {weekLabel}
            </p>
            <input
              ref={titleInputRef}
              type="text"
              value={form.title}
              placeholder="회의 제목"
              onChange={(e) => patch("title", e.target.value)}
              className="mt-1 w-full border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-zinc-900 focus:outline-none focus:ring-0 dark:text-zinc-50"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={form.status}
              onChange={(e) => patch("status", e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => (dirty ? (window.confirm("저장하지 않은 변경사항이 있습니다. 닫을까요?") ? onClose() : null) : onClose())}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="닫기"
              title="닫기 (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="space-y-2">
              <p className={fieldLabel}>참석자</p>
              <div className="flex flex-wrap gap-1.5">
                {form.attendees.map((a, i) => (
                  <span key={`att-${i}`} className={chipCls}>
                    <input
                      type="text"
                      value={a}
                      placeholder="이름"
                      onChange={(e) => patchList("attendees", i, e.target.value)}
                      className="w-24 border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromList("attendees", i)}
                      className="text-zinc-500 hover:text-red-600"
                      aria-label="제거"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => addToList("attendees")}
                  className="rounded-full border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  + 추가
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <p className={fieldLabel}>태그</p>
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((t, i) => (
                  <span key={`tag-${i}`} className={chipCls}>
                    <input
                      type="text"
                      value={t}
                      placeholder="태그"
                      onChange={(e) => patchList("tags", i, e.target.value)}
                      className="w-20 border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromList("tags", i)}
                      className="text-zinc-500 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => addToList("tags")}
                  className="rounded-full border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  + 추가
                </button>
              </div>
            </section>
          </div>

          <section className="mt-6 space-y-2">
            <p className={fieldLabel}>본문</p>
            <textarea
              value={form.content}
              onChange={(e) => patch("content", e.target.value)}
              placeholder={"안건, 논의 내용, 메모 등을 자유롭게 작성하세요."}
              className={`${inputCls} min-h-[200px] resize-y leading-relaxed`}
            />
          </section>

          <section className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className={fieldLabel}>결정 사항</p>
              <button
                type="button"
                onClick={() => addToList("decisions")}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                + 결정 추가
              </button>
            </div>
            <ul className="space-y-1.5">
              {form.decisions.length === 0 ? (
                <li className="text-xs text-zinc-400">결정된 사항이 없습니다.</li>
              ) : (
                form.decisions.map((d, i) => (
                  <li key={`dec-${i}`} className="flex items-center gap-2">
                    <span className="text-zinc-400">•</span>
                    <input
                      type="text"
                      value={d}
                      onChange={(e) => patchList("decisions", i, e.target.value)}
                      placeholder="결정 사항"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => removeFromList("decisions", i)}
                      className="shrink-0 text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="mt-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className={fieldLabel}>액션 아이템</p>
              <button
                type="button"
                onClick={addAction}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                + 액션 추가
              </button>
            </div>
            <ul className="space-y-2">
              {form.action_items.length === 0 ? (
                <li className="text-xs text-zinc-400">액션이 없습니다.</li>
              ) : (
                form.action_items.map((a, i) => (
                  <li
                    key={`act-${i}`}
                    className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!a.done}
                        onChange={(e) => patchAction(i, { done: e.target.checked })}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <input
                        type="text"
                        value={a.text}
                        onChange={(e) => patchAction(i, { text: e.target.value })}
                        placeholder="할 일"
                        className={`${inputCls} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => removeAction(i)}
                        className="shrink-0 text-xs text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <label className="flex items-center gap-1">
                        <span className="text-zinc-500">담당</span>
                        <input
                          type="text"
                          value={a.owner ?? ""}
                          onChange={(e) => patchAction(i, { owner: e.target.value })}
                          placeholder="담당자"
                          className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="text-zinc-500">기한</span>
                        <input
                          type="date"
                          value={a.due ?? ""}
                          onChange={(e) => patchAction(i, { due: e.target.value })}
                          className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </label>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (dirty ? (window.confirm("저장하지 않은 변경사항이 있습니다. 닫을까요?") ? onClose() : null) : onClose())}
              disabled={saving}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
