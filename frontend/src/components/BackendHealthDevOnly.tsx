"use client";

import { BackendHealth } from "@/components/BackendHealth";

export function BackendHealthDevOnly() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="mx-auto mt-8 max-w-4xl px-4 pb-4 sm:px-6">
      <details className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-3 text-xs dark:border-zinc-600 dark:bg-zinc-900/40">
        <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-400">
          개발용: Backend /health
        </summary>
        <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <BackendHealth />
        </div>
      </details>
    </div>
  );
}
