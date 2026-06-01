import { describe, expect, it } from "vitest";
import {
  readTaskAssignee,
  readTaskManager,
  readWorkAssignee,
  taskMatchesManager,
  taskMatchesPersonnelAssignee,
} from "@/lib/taskAssignee";

describe("taskAssignee independence", () => {
  const row = {
    담당자: "김영화",
    외부담당자: "",
    피로도: "",
  };

  it("readWorkAssignee does not fall back to 담당자", () => {
    expect(readWorkAssignee(row)).toBe("");
    expect(readTaskAssignee(row)).toBe("");
  });

  it("readTaskManager reads 담당자 only", () => {
    expect(readTaskManager(row)).toBe("김영화");
  });

  it("personnel modes use separate fields", () => {
    expect(taskMatchesPersonnelAssignee(row, "김영화", "manager")).toBe(true);
    expect(taskMatchesPersonnelAssignee(row, "김영화", "employee")).toBe(false);
  });

  it("readWorkAssignee reads legacy external keys only", () => {
    expect(readWorkAssignee({ 업무담당: "황승현", 담당자: "김영화" })).toBe("황승현");
    expect(readTaskManager({ 업무담당: "황승현", 담당자: "김영화" })).toBe("김영화");
  });

  it("taskMatchesManager does not match external assignee field", () => {
    expect(taskMatchesManager({ 외부담당자: "황승현", 담당자: "" }, "황승현")).toBe(false);
    expect(taskMatchesManager({ 담당자: "김영화" }, "김영화")).toBe(true);
  });
});
