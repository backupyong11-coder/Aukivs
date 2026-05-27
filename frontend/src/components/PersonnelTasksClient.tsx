"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPersonnelBoard } from "@/lib/personnelBoardStorage";
import {
  TASK_ASSIGNEE_FIELD,
  isTaskDone,
  readTaskAssignee,
  taskMatchesAssignee,
} from "@/lib/taskAssignee";
import { fetchTasks, type TaskSheetRow } from "@/lib/tasks";

type PersonStat = {
  name: string;
  open: number;
  done: number;
  total: number;
};

function normalizePeople(boardNames: string[], tasks: TaskSheetRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of boardNames) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  for (const task of tasks) {
    const name = readTaskAssignee(task);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, "ko"));
  return out;
}

function statsForPerson(tasks: TaskSheetRow[], name: string): PersonStat {
  const matched = tasks.filter((t) => taskMatchesAssignee(t, name));
  const done = matched.filter((t) => isTaskDone(t.완료)).length;
  return {
    name,
    open: matched.length - done,
    done,
    total: matched.length,
  };
}

export function PersonnelTasksClient() {
  const [tasks, setTasks] = useState<TaskSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchTasks();
    if (!res.ok) {
      setError(res.message);
      setTasks([]);
      setLoading(false);
      return;
    }
    const normalized = res.items.map((row) => ({
      ...row,
      [TASK_ASSIGNEE_FIELD]: readTaskAssignee(row),
    }));
    setTasks(normalized);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const boardNames = useMemo(() => {
    const board = loadPersonnelBoard();
    return board?.rows.map((r) => r.name.trim()).filter(Boolean) ?? [];
  }, [tasks]);

  const people = useMemo(
    () => normalizePeople(boardNames, tasks),
    [boardNames, tasks],
  );

  useEffect(() => {
    if (people.length === 0) {
      setSelected("");
      return;
    }
    if (!selected || !people.includes(selected)) {
      setSelected(people[0]);
    }
  }, [people, selected]);

  const stats = useMemo(
    () => people.map((name) => statsForPerson(tasks, name)),
    [people, tasks],
  );

  const selectedTasks = useMemo(() => {
    if (!selected) return [];
    let rows = tasks.filter((t) => taskMatchesAssignee(t, selected));
    if (!showDone) rows = rows.filter((t) => !isTaskDone(t.완료));
    return [...rows].sort((a, b) => {
      const da = (a.마감일 ?? "").trim();
      const db = (b.마감일 ?? "").trim();
      if (!da && !db) return (a.업무명 ?? "").localeCompare(b.업무명 ?? "", "ko");
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db, "ko");
    });
  }, [tasks, selected, showDone]);

  const unassignedCount = useMemo(
    () => tasks.filter((t) => !readTaskAssignee(t) && !isTaskDone(t.완료)).length,
    [tasks],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
        업무 불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          업무정리 DB의 <strong className="font-medium text-zinc-800 dark:text-zinc-200">업무담당</strong> 기준으로
          직원별 미완료 업무를 봅니다. 인물 보드에 등록한 이름과 자동으로 합쳐집니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tasks"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            업무정리 DB →
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
          >
            새로고침
          </button>
        </div>
      </div>

      {unassignedCount > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          업무담당이 비어 있는 미완료 업무 {unassignedCount}건 — 업무정리 DB에서 담당자를 입력해 주세요.
        </p>
      ) : null}

      {people.length === 0 ? (
        <p className="text-sm text-zinc-500">
          표시할 직원 이름이 없습니다. 아래「인물 보드」탭에서 이름을 추가하거나, 업무정리 DB에 업무담당을
          입력해 주세요.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stats.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelected(s.name)}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected === s.name
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                }`}
              >
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className={`mt-1 text-xs ${selected === s.name ? "opacity-90" : "text-zinc-500 dark:text-zinc-400"}`}>
                  미완료 <span className="font-semibold">{s.open}</span>
                  <span className="mx-1">·</span>
                  완료 {s.done}
                  <span className="mx-1">·</span>
                  전체 {s.total}
                </p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {selected ? `${selected} — 할 일` : "할 일"}
              </h2>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                  className="h-3.5 w-3.5 accent-zinc-800 dark:accent-zinc-200"
                />
                완료 포함
              </label>
            </div>
            {selectedTasks.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">
                {showDone ? "표시할 업무가 없습니다." : "미완료 업무가 없습니다."}
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {selectedTasks.map((task) => {
                  const done = isTaskDone(task.완료);
                  return (
                    <li
                      key={task.id}
                      className={`flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm ${
                        done ? "opacity-60" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium text-zinc-900 dark:text-zinc-100 ${done ? "line-through" : ""}`}>
                          {task.업무명 || "(제목 없음)"}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {[task.분야, task.분류, task.관련플랫폼].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-zinc-500">
                        {task.마감일 ? <p>{task.마감일}</p> : null}
                        {task.우선순위 ? <p>{task.우선순위}</p> : null}
                        {done ? <p className="text-emerald-600 dark:text-emerald-400">완료</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
