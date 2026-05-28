"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveWorksMasterPreferences } from "@/lib/worksMasterPreferencesApi";
import { WORK_GENRE_FIELD } from "@/lib/worksGenre";

type Props = {
  value: string;
  rowId: string;
  disabled?: boolean;
  genreOptions: string[];
  onGenresChange: (next: string[]) => void;
  onSave: (rowId: string, field: string, nextValue: string) => Promise<void>;
};

export function WorkGenreInlineCell({
  value,
  rowId,
  disabled = false,
  genreOptions,
  onGenresChange,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function pick(tag: string) {
    const next = tag.trim();
    if (saving) return;
    if (next === value.trim()) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(rowId, WORK_GENRE_FIELD, next);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function addTag() {
    const v = newTag.trim();
    if (!v || saving) return;
    const next = genreOptions.includes(v) ? genreOptions : [...genreOptions, v];
    if (next.length !== genreOptions.length) {
      onGenresChange(next);
      await saveWorksMasterPreferences(next);
    }
    setNewTag("");
    await pick(v);
  }

  const label = value.trim() || "—";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled || saving}
        onClick={() => setOpen((o) => !o)}
        className="max-w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
        title={value.trim() || "분류 선택"}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[100] min-w-[10rem] rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => void pick("")}
              >
                (비우기)
              </button>
              {genreOptions.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`block w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    g === value.trim() ? "bg-zinc-100 font-medium dark:bg-zinc-800" : ""
                  }`}
                  onClick={() => void pick(g)}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addTag();
                }}
                placeholder="새 분류"
                className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => void addTag()}
                className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
              >
                추가
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
