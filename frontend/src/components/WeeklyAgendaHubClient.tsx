"use client";

import { useState } from "react";
import { WeeklyAgendaClient } from "@/components/WeeklyAgendaClient";
import { WeeklyAgendaTasksClient } from "@/components/WeeklyAgendaTasksClient";
import { WeeklyMeetingMinutesClient } from "@/components/WeeklyMeetingMinutesClient";

type TabId = "minutes" | "db" | "board";

export function WeeklyAgendaHubClient() {
  const [tab, setTab] = useState<TabId>("minutes");

  const tabBtn = "rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const tabOn = "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
  const tabOff =
    "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${tabBtn} ${tab === "minutes" ? tabOn : tabOff}`}
          onClick={() => setTab("minutes")}
        >
          주간 회의록
        </button>
        <button
          type="button"
          className={`${tabBtn} ${tab === "db" ? tabOn : tabOff}`}
          onClick={() => setTab("db")}
        >
          주간 아젠다
        </button>
        <button
          type="button"
          className={`${tabBtn} ${tab === "board" ? tabOn : tabOff}`}
          onClick={() => setTab("board")}
        >
          주간 아젠다 보드
        </button>
      </div>

      {tab === "minutes" ? (
        <WeeklyMeetingMinutesClient />
      ) : tab === "db" ? (
        <WeeklyAgendaTasksClient />
      ) : (
        <WeeklyAgendaClient />
      )}
    </div>
  );
}

