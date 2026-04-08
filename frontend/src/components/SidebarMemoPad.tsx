"use client";

import { useCallback, useEffect, useState } from "react";
import { appendMemo, fetchMemos, type MemoItem } from "@/lib/memos";

export function SidebarMemoPad() {
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MemoItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadMemos = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchMemos();
      if (r.ok) {
        setItems(r.items);
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
    void loadMemos();
  }, [loadMemos]);

  const onSubmit = async () => {
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
      await loadMemos();
      setMessage("메모장 탭에 저장했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900/60">
      <label
        htmlFor="sidebar-memo-cat"
        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
      >
        분류
      </label>
      <input
        id="sidebar-memo-cat"
        type="text"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setMessage(null);
        }}
        placeholder="예: 운영 / 긴급"
        className="mb-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        autoComplete="off"
      />
      <label
        htmlFor="sidebar-memo"
        className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
      >
        메모 내용
      </label>
      <textarea
        id="sidebar-memo"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        placeholder="내용 입력 후 아래 버튼으로 시트에 추가…"
        rows={4}
        className="w-full resize-y rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs leading-snug text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={saving || !text.trim()}
        className="mt-2 w-full rounded-md bg-zinc-800 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
      >
        {saving ? "저장 중…" : "메모장 탭에 추가"}
      </button>
      {message ? (
        <p
          className={`mt-1 text-[10px] leading-tight ${
            message.includes("저장했습니다")
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-800 dark:text-amber-200"
          }`}
        >
          {message}
        </p>
      ) : (
        <p className="mt-1 text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
          날짜·시각은 서버에서 메모날짜 열에 넣습니다.
        </p>
      )}
      <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
        <p className="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
          최근 메모
        </p>
        {loading ? (
          <p className="mt-1 text-[10px] text-zinc-400">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="mt-1 text-[10px] text-zinc-400">목록 없음</p>
        ) : (
          <ul className="mt-1 max-h-36 space-y-1.5 overflow-y-auto text-[10px] text-zinc-700 dark:text-zinc-300">
            {items.slice(0, 12).map((m) => (
              <li
                key={m.sheet_row}
                className="rounded border border-zinc-100 bg-white/80 px-1.5 py-1 dark:border-zinc-800 dark:bg-zinc-950/80"
              >
                <span className="text-zinc-400">
                  {m.memo_date || "—"}
                  {m.category ? (
                    <span className="ml-1 text-zinc-600 dark:text-zinc-400">
                      · {m.category}
                    </span>
                  ) : null}
                </span>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
                  {m.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
