"use client";

type Props = {
  value: string;
  disabled?: boolean;
  align?: "left" | "center";
  muted?: boolean;
  tabular?: boolean;
  className?: string;
  onRequestEdit?: () => void;
};

/** 셀 너비 안에서 줄임표 — 클릭 시 바로 편집 */
export function TableTruncatedText({
  value,
  disabled = false,
  align = "left",
  muted = false,
  tabular = false,
  className = "",
  onRequestEdit,
}: Props) {
  const alignCls = align === "center" ? "text-center" : "text-left";
  const toneCls = muted ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50";
  const text = value.trim();

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onRequestEdit?.();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRequestEdit?.();
        }
      }}
      title={disabled ? undefined : text ? text : "클릭하여 편집"}
      className={`block w-full min-w-0 max-w-full cursor-text truncate rounded px-0.5 py-0 ${alignCls} ${toneCls} ${tabular ? "tabular-nums" : ""} ${
        disabled ? "cursor-default opacity-60" : "hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90"
      } ${className}`}
    >
      {text || <span className="font-normal text-zinc-300 dark:text-zinc-600">—</span>}
    </span>
  );
}
