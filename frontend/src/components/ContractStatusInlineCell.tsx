"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CONTRACT_STATUS_OPTIONS,
  contractStatusStyle,
} from "@/lib/contractStatus";

type Props = {
  value: string;
  field: string;
  rowId: string;
  disabled?: boolean;
  align?: "left" | "center";
  onSave: (rowId: string, field: string, nextValue: string) => Promise<void>;
};

/** 계약정리 DB — K열 계약 상태 태그 선택 */
export function ContractStatusInlineCell({
  value,
  field,
  rowId,
  disabled = false,
  align = "left",
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
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

  async function pick(status: string) {
    const next = status.trim();
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
            aria-label="계약 상태 선택"
          >
            <div className="flex flex-wrap gap-1">
              {CONTRACT_STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={saving}
                  onClick={() => void pick(status)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${contractStatusStyle(status)} ${
                    display === status ? "ring-2 ring-zinc-400 ring-offset-1 dark:ring-zinc-500" : ""
                  }`}
                >
                  {status}
                </button>
              ))}
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
        title={disabled ? undefined : "클릭하여 계약 상태 선택"}
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
            className={`inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${contractStatusStyle(display)}`}
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
