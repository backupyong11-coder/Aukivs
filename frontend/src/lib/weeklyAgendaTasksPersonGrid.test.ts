import { describe, expect, it } from "vitest";
import {
  buildAutoPersonGridFromTasks,
  buildWeekColumnDefs,
  compareWeeklyAgendaPersonName,
  taskAgendaDetails,
  taskAgendaMajor,
  taskAgendaMinor,
} from "@/lib/weeklyAgendaTasksPersonGrid";
import type { TaskSheetRow } from "@/lib/tasks";

describe("buildWeekColumnDefs", () => {
  it("maps Mon–Fri with M.D labels for the week containing from", () => {
    const cols = buildWeekColumnDefs("2026-05-18", "2026-05-22");
    expect(cols.map((c) => c.label)).toEqual([
      "월 (5.18)",
      "화 (5.19)",
      "수 (5.20)",
      "목 (5.21)",
      "금 (5.22)",
    ]);
    expect(cols.every((c) => c.inRange)).toBe(true);
  });

  it("marks out-of-range weekdays when period is partial", () => {
    const cols = buildWeekColumnDefs("2026-05-20", "2026-05-22");
    expect(cols.find((c) => c.key === "mon")?.inRange).toBe(false);
    expect(cols.find((c) => c.key === "wed")?.inRange).toBe(true);
  });
});

describe("buildAutoPersonGridFromTasks", () => {
  it("places tasks on person row and weekday column by 실행일 and 담당자", () => {
    const tasks: TaskSheetRow[] = [
      {
        id: "task-row-1",
        실행일: "2026-05-20",
        담당자: "김영화",
        업무명: "코스프레 유부녀 미툰",
        "정량화 분": "[업로드]",
        분류: "유통",
      },
    ];
    const { grid, matchedCount } = buildAutoPersonGridFromTasks(
      tasks,
      "2026-05-18",
      "2026-05-22",
      ["김영화", "황승현"],
      "manager",
    );
    expect(matchedCount).toBe(1);
    const row = grid.rows.find((r) => r.name === "김영화");
    expect(row?.cells.wed).toContain("[업로드]");
    expect(row?.cells.wed).toContain("코스프레 유부녀 미툰");
  });
});

describe("compareWeeklyAgendaPersonName", () => {
  it("orders 김영화 → 황승현 → 문자빈", () => {
    expect(compareWeeklyAgendaPersonName("김영화", "황승현")).toBeLessThan(0);
    expect(compareWeeklyAgendaPersonName("황승현", "문자빈")).toBeLessThan(0);
    expect(compareWeeklyAgendaPersonName("김영화", "문자빈")).toBeLessThan(0);
  });
});

describe("taskAgenda field mapping", () => {
  it("maps 소분류 to 정량화 분 and 세부 내용 to 업무명", () => {
    const task: TaskSheetRow = {
      id: "t1",
      분류: "유통",
      "정량화 분": "[컨택메일]",
      업무명: "작품 A 연락",
    };
    expect(taskAgendaMajor(task)).toBe("유통");
    expect(taskAgendaMinor(task)).toBe("[컨택메일]");
    expect(taskAgendaDetails(task)).toBe("작품 A 연락");
  });
});
