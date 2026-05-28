"use client";

import { useState } from "react";
import { PersonnelBoardClient } from "@/components/PersonnelBoardClient";
import { PersonnelTasksClient } from "@/components/PersonnelTasksClient";

type TabId = "manager" | "external" | "board";

export function PersonnelHubClient() {
  const [tab, setTab] = useState<TabId>("manager");

  const tabBtn = (active: boolean) =>
    active
      ? "rounded-t-md border border-b-0 border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
      : "rounded-t-md border border-transparent px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-px dark:border-zinc-700">
        <button type="button" className={tabBtn(tab === "manager")} onClick={() => setTab("manager")}>
          담당자
        </button>
        <button type="button" className={tabBtn(tab === "external")} onClick={() => setTab("external")}>
          외부담당자
        </button>
        <button type="button" className={tabBtn(tab === "board")} onClick={() => setTab("board")}>
          업무 담당자 보드
        </button>
      </div>
      {tab === "board" ? (
        <PersonnelBoardClient />
      ) : tab === "manager" ? (
        <PersonnelTasksClient
          mode="manager"
          labels={{
            fieldLabel: "담당자",
            emptyHint: "담당자를 입력해 주세요.",
            unassignedHint: "담당자가 비어 있는 미완료 업무",
          }}
        />
      ) : (
        <PersonnelTasksClient
          mode="employee"
          labels={{
            fieldLabel: "외부담당자",
            emptyHint: "외부담당자를 입력해 주세요.",
            unassignedHint: "외부담당자가 비어 있는 미완료 업무",
          }}
        />
      )}
    </div>
  );
}
