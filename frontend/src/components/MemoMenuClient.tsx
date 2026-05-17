"use client";

import { useCallback, useEffect, useState } from "react";
import {
  appendMemo,
  deleteMemo,
  fetchMemos,
  updateMemo,
  type MemoItem,
} from "@/lib/memos";

function compareMemoNewestFirst(a: MemoItem, b: MemoItem): number {
  const da = a.memo_date.trim();
  const db = b.memo_date.trim();
  if (da !== db) return db.localeCompare(da, "ko");
  return b.sheet_row - a.sheet_row;
}

function memoRowKey(m: MemoItem): string {
  return m.id ? `id:${m.id}` : `row:${m.sheet_row}`;
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

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);

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

  const startEdit = (m: MemoItem) => {
    const k = memoRowKey(m);
    setEditingKey(k);
    setEditCategory(m.category?.trim() ?? "");
    setEditContent(m.content.trim());
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditCategory("");
    setEditContent("");
  };

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

  const onSaveEdit = async (m: MemoItem) => {
    const k = memoRowKey(m);
    const c = editContent.trim();
    if (!c || rowBusy) return;
    setRowBusy(k);
    setMessage(null);
    try {
      const r = await updateMemo({
        sheet_row: m.sheet_row,
        content: c,
        category: editCategory,
        id: m.id ?? null,
      });
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      cancelEdit();
      await load();
      setMessage("메모를 수정했습니다.");
    } finally {
      setRowBusy(null);
    }
  };

  const onDeleteRow = async (m: MemoItem) => {
    if (!window.confirm("이 메모를 삭제할까요?")) return;
    const k = memoRowKey(m);
    setRowBusy(k);
    setMessage(null);
    try {
      const r = await deleteMemo({ sheet_row: m.sheet_row, id: m.id ?? null });
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      if (editingKey === k) cancelEdit();
      await load();
      setMessage("메모를 삭제했습니다.");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">새 메모</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          저장 시 서버가 메모날짜·시각을 시트(또는 DB)에 기록합니다.
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
          <label className="flex min-w-0 flex-[3] flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 lg:flex-[4]">
            내용
            <input
              type="text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMessage(null);
              }}
              placeholder="메모 내용…"
              className={inputCls}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
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
              message.includes("저장했습니다") ||
              message.includes("수정했습니다") ||
              message.includes("삭제했습니다")
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-800 dark:text-amber-200"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-300 dark:border-zinc-600">
        <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-200 dark:bg-zinc-800">
              <th className="w-14 border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                행
              </th>
              <th className="w-40 border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                메모 날짜
              </th>
              <th className="w-40 border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                분류
              </th>
              <th className="border border-zinc-400 px-2 py-2 text-left text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                내용
              </th>
              <th className="w-44 border border-zinc-400 px-2 py-2 text-center text-xs font-bold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-zinc-400 px-4 py-8 text-center text-zinc-500 dark:border-zinc-600"
                >
                  불러오는 중…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-zinc-400 px-4 py-8 text-center text-zinc-500 dark:border-zinc-600"
                >
                  메모가 없거나 불러오지 못했습니다.
                </td>
              </tr>
            ) : (
              items.map((m) => {
                const k = memoRowKey(m);
                const isEditing = editingKey === k;
                const busy = rowBusy === k;
                return (
                  <tr key={k} className="bg-white dark:bg-zinc-950">
                    <td className="border border-zinc-400 px-2 py-2 tabular-nums text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                      {m.sheet_row}
                    </td>
                    <td className="border border-zinc-400 px-2 py-2 tabular-nums text-zinc-800 dark:border-zinc-600 dark:text-zinc-200">
                      {m.memo_date?.trim() || "—"}
                    </td>
                    <td className="border border-zinc-400 px-2 py-2 dark:border-zinc-600">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className={`${inputCls} w-full`}
                          autoComplete="off"
                        />
                      ) : (
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {m.category?.trim() || "—"}
                        </span>
                      )}
                    </td>
                    <td className="border border-zinc-400 px-2 py-2 align-top dark:border-zinc-600">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className={`${inputCls} w-full`}
                          spellCheck={false}
                          autoComplete="off"
                        />
                      ) : (
                        <p className="break-words text-zinc-900 dark:text-zinc-100">{m.content}</p>
                      )}
                    </td>
                    <td className="border border-zinc-400 px-2 py-2 text-center align-middle dark:border-zinc-600">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={busy || !editContent.trim()}
                            onClick={() => void onSaveEdit(m)}
                            className="rounded border border-zinc-400 bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:border-zinc-500 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            {busy ? "저장 중…" : "저장"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={cancelEdit}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={busy || editingKey !== null}
                            onClick={() => startEdit(m)}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            편집
                          </button>
                          <button
                            type="button"
                            disabled={busy || editingKey !== null}
                            onClick={() => void onDeleteRow(m)}
                            className="text-xs text-red-600 underline hover:no-underline disabled:opacity-50 dark:text-red-400"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
