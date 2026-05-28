"use client";

import { useId, useState, type FormEvent } from "react";
import { createTask } from "@/lib/tasks";

type Props = {
  ymd: string;
  categoryHints: string[];
  onCreated?: () => void;
  /** 주간 칸 등 좁은 영역 */
  compact?: boolean;
};

const inputCls =
  "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

export function CalendarQuickTaskAdd({ ymd, categoryHints, onCreated, compact }: Props) {
  const listId = useId();
  const [분류, set분류] = useState("");
  const [업무명, set업무명] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const title = 업무명.trim();
    if (!title) {
      setError("업무명을 입력하세요.");
      return;
    }
    setSaving(true);
    setError(null);
    const r = await createTask({
      업무명: title,
      분류: 분류.trim(),
      마감일: ymd,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    set업무명("");
    onCreated?.();
  }

  const fieldsCls = compact ? "space-y-1" : "flex min-w-0 items-center gap-2";

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={compact ? "space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700" : "space-y-1"}
    >
      <div className={fieldsCls}>
        {!compact ? (
          <p className="shrink-0 text-xs font-semibold text-zinc-600 dark:text-zinc-400">업무 빠른 추가</p>
        ) : null}
        <label className={compact ? "block" : "min-w-[8rem] flex-1 sm:max-w-[12rem]"}>
          {!compact ? (
            <span className="sr-only">분류</span>
          ) : null}
          <input
            type="text"
            list={listId}
            value={분류}
            onChange={(e) => set분류(e.target.value)}
            placeholder={compact ? "분류" : "분류"}
            className={inputCls}
            disabled={saving}
          />
          <datalist id={listId}>
            {categoryHints.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className={compact ? "block" : "min-w-[14rem] flex-[3]"}>
          {!compact ? (
            <span className="sr-only">업무명</span>
          ) : null}
          <input
            type="text"
            value={업무명}
            onChange={(e) => set업무명(e.target.value)}
            placeholder={compact ? "업무명" : "업무명"}
            className={inputCls}
            disabled={saving}
            required
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className={
            compact
              ? "w-full rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              : "shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          }
        >
          {saving ? "저장…" : compact ? "+ 추가" : "추가"}
        </button>
      </div>
      {error ? <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p> : null}
    </form>
  );
}
