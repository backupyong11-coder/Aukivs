"use client";

import { useCallback, useEffect, useState } from "react";
import { appendMemo, fetchMemos, type MemoItem } from "@/lib/memos";

function compareMemoNewestFirst(a: MemoItem, b: MemoItem): number {
  const da = a.memo_date.trim();
  const db = b.memo_date.trim();
  if (da !== db) return db.localeCompare(da, "ko");
  return b.sheet_row - a.sheet_row;
}

const inputCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";

export function MemoMenuClient() {
  const [items, setItems] = useState<MemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchMemos();
      if (r.ok) {
        setItems([...r.items].sort(compareMemoNewestFirst));
        setMessage(null);
      } else {
        setItems([]);
        setMessage(r.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAppend = async () => {
    const t = text.trim();
    if (!t || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await appendMemo(t, category);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setText("");
      setCategory("");
      await load();
      setMessage("메모장에 저장했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">새 메모</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          저장 시 서버가 메모날짜·시각을 시트에 기록합니다.
        </p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            분류
            <input
              type="text"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setMessage(null);
              }}
              placeholder="예: 운영 / 긴급"
              className={inputCls}
              autoComplete="off"
            />
          </label>
          <div className="min-w-0 flex-[3] lg:flex-[4]">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              내용
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setMessage(null);
                }}
                placeholder="메모 내용…"
                rows={3}
                className={`${inputCls} min-h-[5rem] w-full resize-y`}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {loading ? "불러오는 중…" : "새로고침"}
            </button>
            <button
              type="button"
              onClick={() => void onAppend()}
              disabled={saving || !text.trim()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "저장 중…" : "추가"}
            </button>
          </div>
        </div>
        {message ? (
          <p
            className={`mt-2 text-sm ${
              message.includes("저장했습니다")
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-800 dark:text-amber-200"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-300 dark:border-zinc-600">
        <table className="w-full min-w-[960px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-200 dark:bg-zinc-800">
              <th className="w-14 border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                행
              </th>
              <th className="w-40 border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                메모 날짜
              </th>
              <th className="w-44 border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                분류
              </th>
              <th className="border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                내용
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="border border-zinc-400 px-4 py-8 text-center text-zinc-500 dark:border-zinc-600">
                  불러오는 중…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-zinc-400 px-4 py-8 text-center text-zinc-500 dark:border-zinc-600">
                  메모가 없거나 불러오지 못했습니다.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.sheet_row} className="bg-white dark:bg-zinc-950">
                  <td className="border border-zinc-400 px-2 py-2 tabular-nums text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                    {m.sheet_row}
                  </td>
                  <td className="border border-zinc-400 px-2 py-2 tabular-nums text-zinc-800 dark:border-zinc-600 dark:text-zinc-200">
                    {m.memo_date?.trim() || "—"}
                  </td>
                  <td className="border border-zinc-400 px-2 py-2 text-zinc-800 dark:border-zinc-600 dark:text-zinc-200">
                    {m.category?.trim() || "—"}
                  </td>
                  <td className="border border-zinc-400 px-2 py-2 align-top text-zinc-900 dark:border-zinc-600 dark:text-zinc-100">
                    <p className="max-w-none whitespace-pre-wrap break-words">{m.content}</p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
