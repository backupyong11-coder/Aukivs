import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMN_MAJOR_ID,
  defaultColumnMajorGroups,
  groupColumnKeysByMajor,
} from "@/lib/tableColumnMajorGroups";

describe("groupColumnKeysByMajor", () => {
  it("puts unassigned keys in default major", () => {
    const data = defaultColumnMajorGroups();
    const grouped = groupColumnKeysByMajor(["a", "b"], data);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.major.id).toBe(DEFAULT_COLUMN_MAJOR_ID);
    expect(grouped[0]!.keys).toEqual(["a", "b"]);
  });

  it("groups by assignment", () => {
    const data = {
      groups: [
        { id: DEFAULT_COLUMN_MAJOR_ID, name: "기본", order: 0 },
        { id: "sched", name: "일정", order: 1 },
      ],
      assignments: { a: "sched" },
    };
    const grouped = groupColumnKeysByMajor(["a", "b"], data);
    const sched = grouped.find((g) => g.major.id === "sched");
    const basic = grouped.find((g) => g.major.id === DEFAULT_COLUMN_MAJOR_ID);
    expect(sched?.keys).toEqual(["a"]);
    expect(basic?.keys).toEqual(["b"]);
  });
});
