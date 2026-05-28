"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPersonnelBoard } from "@/lib/personnelBoardStorage";
import {
  getDirectoryPerson,
  upsertDirectoryPerson,
  type PersonnelDirectoryPerson,
} from "@/lib/personnelDirectoryStorage";
import {
  type PersonnelAssigneeMode,
  isTaskDone,
  readPersonnelAssignee,
  readTaskManager,
  readWorkAssignee,
  taskMatchesPersonnelAssignee,
} from "@/lib/taskAssignee";
import { fetchTasks, type TaskSheetRow } from "@/lib/tasks";

type PersonStat = {
  name: string;
  open: number;
  done: number;
  total: number;
};

type PersonnelTasksLabels = {
  fieldLabel: string;
  emptyHint: string;
  unassignedHint: string;
};

const EXTERNAL_EXCLUDE = new Set(["문자빈", "황승현", "김영화"]);
const MANAGER_PINNED = ["문자빈", "황승현", "김영화"] as const;

function loadPeopleOrder(mode: PersonnelAssigneeMode): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`worksheet_personnel_people_order_v1:${mode}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

function savePeopleOrder(mode: PersonnelAssigneeMode, names: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`worksheet_personnel_people_order_v1:${mode}`, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

function normalizePeople(
  boardNames: string[],
  tasks: TaskSheetRow[],
  mode: PersonnelAssigneeMode,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const name = raw.trim();
    if (!name || seen.has(name)) return;
    if (mode === "employee" && EXTERNAL_EXCLUDE.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  if (mode === "manager") {
    for (const p of MANAGER_PINNED) add(p);
  }
  for (const raw of boardNames) {
    add(raw);
  }
  for (const task of tasks) {
    add(readPersonnelAssignee(task, mode));
  }
  return out.sort((a, b) => a.localeCompare(b, "ko"));
}

function statsForPerson(
  tasks: TaskSheetRow[],
  name: string,
  mode: PersonnelAssigneeMode,
): PersonStat {
  const matched = tasks.filter((t) => taskMatchesPersonnelAssignee(t, name, mode));
  const done = matched.filter((t) => isTaskDone(t.완료)).length;
  return {
    name,
    open: matched.length - done,
    done,
    total: matched.length,
  };
}

export function PersonnelTasksClient(props: { mode: PersonnelAssigneeMode; labels: PersonnelTasksLabels }) {
  const [tasks, setTasks] = useState<TaskSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mode = props.mode;
  const [selected, setSelected] = useState<string>("");
  const [showDone, setShowDone] = useState(false);
  const [profileDraft, setProfileDraft] = useState<PersonnelDirectoryPerson | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEdit, setProfileEdit] = useState(false);
  const [sortEdit, setSortEdit] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[]>([]);

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
    setTasks(res.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const boardNames = useMemo(() => {
    const board = loadPersonnelBoard();
    return board?.rows.map((r) => r.name.trim()).filter(Boolean) ?? [];
  }, [tasks]);

  useEffect(() => {
    setManualOrder(loadPeopleOrder(mode));
  }, [mode]);

  const people = useMemo(() => {
    const base = normalizePeople(mode === "employee" ? boardNames : [], tasks, mode);
    const seen = new Set(base);
    const ordered: string[] = [];
    for (const n of manualOrder) {
      const name = n.trim();
      if (!name) continue;
      if (mode === "employee" && EXTERNAL_EXCLUDE.has(name)) continue;
      if (!seen.has(name)) continue;
      if (!ordered.includes(name)) ordered.push(name);
    }
    for (const name of base) {
      if (!ordered.includes(name)) ordered.push(name);
    }
    // 담당자 탭: 고정 3명은 항상 포함(정렬에도 들어가게)
    if (mode === "manager") {
      for (const p of MANAGER_PINNED) {
        if (!ordered.includes(p)) ordered.unshift(p);
      }
    }
    return ordered;
  }, [boardNames, tasks, mode, manualOrder]);

  useEffect(() => {
    if (people.length === 0) {
      setSelected("");
      return;
    }
    if (!selected || !people.includes(selected)) {
      setSelected(people[0]);
    }
  }, [people, selected]);

  useEffect(() => {
    if (!selected) {
      setProfileDraft(null);
      setProfileOpen(false);
      setProfileEdit(false);
      return;
    }
    const p = getDirectoryPerson(selected);
    setProfileDraft({
      name: selected,
      company: p?.company ?? "",
      position: p?.position ?? "",
      contact: p?.contact ?? "",
      email: p?.email ?? "",
      role: p?.role ?? "",
      birthdate: p?.birthdate ?? "",
      memo: p?.memo ?? "",
    });
    setProfileOpen(false);
    setProfileEdit(false);
  }, [selected]);

  const stats = useMemo(
    () => people.map((name) => statsForPerson(tasks, name, mode)),
    [people, tasks, mode],
  );

  const selectedTasks = useMemo(() => {
    if (!selected) return [];
    let rows = tasks.filter((t) => taskMatchesPersonnelAssignee(t, selected, mode));
    if (!showDone) rows = rows.filter((t) => !isTaskDone(t.완료));
    return [...rows].sort((a, b) => {
      const da = (a.마감일 ?? "").trim();
      const db = (b.마감일 ?? "").trim();
      if (!da && !db) return (a.업무명 ?? "").localeCompare(b.업무명 ?? "", "ko");
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db, "ko");
    });
  }, [tasks, selected, showDone, mode]);

  const unassignedCount = useMemo(
    () =>
      tasks.filter(
        (t) => !readPersonnelAssignee(t, mode) && !isTaskDone(t.완료),
      ).length,
    [tasks, mode],
  );

  const cfg = props.labels;

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
          업무정리 DB의 <strong className="font-medium text-zinc-800 dark:text-zinc-200">{cfg.fieldLabel}</strong>{" "}
          기준으로 {mode === "employee" ? "임직원" : "담당자"}별 미완료 업무를 봅니다.
          {mode === "employee"
            ? " 인물 보드에 등록한 이름과 자동으로 합쳐집니다."
            : " 담당자 열 값만 표시합니다."}
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
          <button
            type="button"
            onClick={() => setSortEdit((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-900"
            title="카드 순서를 직접 조정합니다 (이 브라우저에 저장)"
          >
            {sortEdit ? "정렬 완료" : "정렬"}
          </button>
        </div>
      </div>

      {unassignedCount > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {cfg.unassignedHint} {unassignedCount}건 — 업무정리 DB에서 {cfg.fieldLabel}을 입력해 주세요.
        </p>
      ) : null}

      {people.length === 0 ? (
        <p className="text-sm text-zinc-500">
          표시할 이름이 없습니다.
          {mode === "employee"
            ? " 아래「인물 보드」탭에서 이름을 추가하거나,"
            : ""}{" "}
          업무정리 DB에 {cfg.emptyHint}
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.name}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected === s.name
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setSelected(s.name)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                  </button>
                  {sortEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        onClick={() => {
                          const idx = people.indexOf(s.name);
                          if (idx <= 0) return;
                          const next = [...people];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          setManualOrder(next);
                          savePeopleOrder(mode, next);
                        }}
                        aria-label="위로"
                        title="위로"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        onClick={() => {
                          const idx = people.indexOf(s.name);
                          if (idx < 0 || idx >= people.length - 1) return;
                          const next = [...people];
                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                          setManualOrder(next);
                          savePeopleOrder(mode, next);
                        }}
                        aria-label="아래로"
                        title="아래로"
                      >
                        ▼
                      </button>
                    </div>
                  ) : null}
                </div>
                {(() => {
                  const p = getDirectoryPerson(s.name);
                  const line1 = [p?.company, p?.position]
                    .map((x) => (x ?? "").trim())
                    .filter(Boolean)
                    .join(" · ");
                  const line2 = [(p?.role ?? "").trim()].filter(Boolean).join(" · ");
                  const line3 = [p?.contact, p?.email]
                    .map((x) => (x ?? "").trim())
                    .filter(Boolean)
                    .join(" · ");
                  const tone = selected === s.name ? "opacity-90" : "text-zinc-400 dark:text-zinc-500";
                  const title = [line1, line2, line3].filter(Boolean).join("\n");
                  return line1 || line2 || line3 ? (
                    <div className={`mt-0.5 text-[11px] ${tone}`} title={title}>
                      {line1 ? <p className="truncate">{line1}</p> : null}
                      {line2 ? <p className="truncate">{line2}</p> : null}
                      {line3 ? <p className="truncate">{line3}</p> : null}
                    </div>
                  ) : null;
                })()}
                <p className={`mt-1 text-xs ${selected === s.name ? "opacity-90" : "text-zinc-500 dark:text-zinc-400"}`}>
                  전체 {s.total}
                  <span className="mx-1">·</span>
                  완료 {s.done}
                  <span className="mx-1">·</span>
                  미완료 <span className="font-semibold">{s.open}</span>
                </p>
              </div>
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

            {selected && profileDraft ? (
              <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {mode === "manager" ? "담당자" : "외부담당자"} 정보
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(true);
                        setProfileEdit((v) => !v);
                      }}
                      className="rounded-md px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      {profileEdit ? "수정 취소" : "수정"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileOpen((v) => !v)}
                      className="rounded-md px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      {profileOpen ? "접기" : "펼치기"}
                    </button>
                    {profileEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          upsertDirectoryPerson(profileDraft);
                          setProfileEdit(false);
                        }}
                        className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        저장
                      </button>
                    ) : null}
                  </div>
                </div>

                {profileOpen && profileEdit ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      업체
                      <input
                        value={profileDraft.company ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, company: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: 오키브스"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      직위
                      <input
                        value={profileDraft.position ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, position: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: 사원 / 과장 / 팀장"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      담당업무
                      <input
                        value={profileDraft.role ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, role: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: 유통 / 제작 / 계약 / 운영"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      생년월일
                      <input
                        value={profileDraft.birthdate ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, birthdate: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: 1999-01-23"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      연락처
                      <input
                        value={profileDraft.contact ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, contact: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: 010-0000-0000"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Email
                      <input
                        value={profileDraft.email ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, email: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: name@example.com"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-600 dark:text-zinc-400 md:col-span-2">
                      메모
                      <input
                        value={profileDraft.memo ?? ""}
                        onChange={(e) =>
                          setProfileDraft((p) => (p ? { ...p, memo: e.target.value } : p))
                        }
                        className="mt-1 w-full bg-transparent px-0 py-1 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                        style={{ borderBottom: "1px solid rgba(161,161,170,0.35)" }}
                        placeholder="예: 특이사항"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedTasks.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">
                {showDone ? "표시할 업무가 없습니다." : "미완료 업무가 없습니다."}
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {selectedTasks.map((task) => {
                  const done = isTaskDone(task.완료);
                  const other =
                    mode === "employee"
                      ? readTaskManager(task)
                      : readWorkAssignee(task);
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
                        {other ? (
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {mode === "employee" ? "담당자" : "인물담당"}: {other}
                          </p>
                        ) : null}
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
