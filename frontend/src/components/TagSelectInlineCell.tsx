"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadPriorityTagOptions,
  priorityTagStyle,
  savePriorityTagOptions,
} from "@/lib/priorityTags";

type Props = {
  value: string;
  field: string;
  rowId: string;
  disabled?: boolean;
  align?: "left" | "center";
  onSave: (rowId: string, field: string, nextValue: string) => Promise<void>;
};

/** 우선순위 등 — 노션식 태그 선택(클릭 1회) */
export function TagSelectInlineCell({
  value,
  field,
  rowId,
  disabled = false,
  align = "left",
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(() => loadPriorityTagOptions());
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
    setTags(loadPriorityTagOptions());
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
    if (!next || next === value.trim() || saving) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(rowId, field, next);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function addCustomTag() {
    const t = newTag.trim();
    if (!t) return;
    const next = tags.includes(t) ? tags : [...tags, t];
    setTags(next);
    savePriorityTagOptions(next);
    setNewTag("");
    void pick(t);
  }

  const display = value.trim();
  const alignCls = align === "center" ? "mx-auto" : "";

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            className="fixed z-[250] w-[min(14rem,calc(100vw-1rem))] rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
            style={{ top: pos.top, left: pos.left }}
            role="listbox"
            aria-label="태그 선택"
          >
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  disabled={saving}
                  onClick={() => void pick(tag)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${priorityTagStyle(tag)} ${
                    display === tag ? "ring-2 ring-zinc-400 ring-offset-1 dark:ring-zinc-500" : ""
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <input
                type="text"
                value={newTag}
                disabled={saving}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                placeholder="새 태그"
                className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-600 dark:bg-zinc-900"
              />
              <button
                type="button"
                disabled={saving || !newTag.trim()}
                onClick={() => addCustomTag()}
                className="shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                추가
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled || saving}
        title={disabled ? undefined : "클릭하여 태그 선택"}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          updatePosition();
          setOpen((o) => !o);
        }}
        className={`block w-full min-w-0 max-w-full truncate rounded px-0.5 py-0 text-left hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90 disabled:opacity-50 ${alignCls}`}
      >
        {display ? (
          <span
            className={`inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityTagStyle(display)}`}
          >
            {display}
          </span>
        ) : (
          <span className="font-normal text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </button>
      {menu}
    </>
  );
}

export function isPriorityTagField(field: string): boolean {
  return field === "우선순위";
}
