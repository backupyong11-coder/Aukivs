import { describe, expect, it } from "vitest";

import { duplicateUploadIdsFromIssues } from "@/lib/uploads";

describe("duplicateUploadIdsFromIssues", () => {
  it("returns empty set when no duplicate_id issues", () => {
    expect(
      duplicateUploadIdsFromIssues([
        {
          kind: "row_skipped",
          sheet_row: 3,
          message: "skip",
        },
      ]).size,
    ).toBe(0);
  });

  it("collects ids from duplicate_id issues", () => {
    const s = duplicateUploadIdsFromIssues([
      { kind: "duplicate_id", id: "a", sheet_rows: [2, 3], message: "m1" },
      { kind: "duplicate_id", id: "b", sheet_rows: [4, 5, 6], message: "m2" },
    ]);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
    expect(s.size).toBe(2);
  });
});
