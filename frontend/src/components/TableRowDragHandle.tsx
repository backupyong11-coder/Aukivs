"use client";

import type { ComponentProps } from "react";

type SourceProps = {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

export function TableRowDragHandle({
  sourceProps,
  active,
  ...rest
}: {
  sourceProps: SourceProps;
  active?: boolean;
} & Omit<ComponentProps<"span">, keyof SourceProps>) {
  return (
    <span
      {...sourceProps}
      {...rest}
      aria-label="행 이동 핸들"
      title="드래그하여 위/아래 이동"
      className={`inline-flex h-5 w-3.5 cursor-grab select-none items-center justify-center text-zinc-400 hover:text-zinc-700 active:cursor-grabbing dark:text-zinc-500 dark:hover:text-zinc-200 ${
        active ? "text-zinc-700 dark:text-zinc-200" : ""
      }`}
    >
      <span className="text-[10px] leading-none" aria-hidden>
        ⋮⋮
      </span>
    </span>
  );
}
