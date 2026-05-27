"use client";

import { useState } from "react";
import { PersonnelBoardClient } from "@/components/PersonnelBoardClient";
import { PersonnelTasksClient } from "@/components/PersonnelTasksClient";

type TabId = "tasks" | "board";

export function PersonnelHubClient() {
  const [tab, setTab] = useState<TabId>("tasks");

  const tabBtn = (active: boolean) =>
    active
      ? "rounded-t-md border border-b-0 border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
      : "rounded-t-md border border-transparent px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-px dark:border-zinc-700">
        <button type="button" className={tabBtn(tab === "tasks")} onClick={() => setTab("tasks")}>
          업무 대시보드
        </button>
        <button type="button" className={tabBtn(tab === "board")} onClick={() => setTab("board")}>
          인물 보드
        </button>
      </div>
      {tab === "tasks" ? <PersonnelTasksClient /> : <PersonnelBoardClient />}
    </div>
  );
}
