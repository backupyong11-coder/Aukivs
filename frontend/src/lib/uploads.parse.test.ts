import { describe, expect, it } from "vitest";

import { parseUploadListResponse } from "@/lib/uploads";

describe("parseUploadListResponse", () => {
  it("parses row_skipped and duplicate_id issues", () => {
    const raw = {
      items: [
        {
          uid: "upload-a-2026-04-01T00:00:00+09:00-2",
          id: "a",
          title: "t",
          file_name: "f.png",
          uploaded_at: "2026-04-01T00:00:00+09:00",
          note: null,
          status: null,
        },
      ],
      issues: [
        {
          kind: "row_skipped",
          sheet_row: 4,
          message: "업로드운영 4행: title(열 B) 비어 있어 제외",
        },
        {
          kind: "duplicate_id",
          id: "dup",
          sheet_rows: [2, 3, 5],
          message: "업로드운영에서 id 'dup'가 여러 행(2행, 3행, 5행)에 중복되어 있습니다.",
        },
      ],
    };
    const out = parseUploadListResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.issues).toHaveLength(2);
    expect(out!.issues[0].kind).toBe("row_skipped");
    expect(out!.issues[1].kind).toBe("duplicate_id");
    if (out!.issues[1].kind === "duplicate_id") {
      expect(out!.issues[1].sheet_rows).toEqual([2, 3, 5]);
      expect(out!.issues[1].id).toBe("dup");
    }
  });

  it("fills placeholder file_name and synthetic uid when omitted", () => {
    const raw = {
      items: [
        {
          id: "a",
          title: "제목",
          uploaded_at: "2026-04-01T00:00:00+09:00",
        },
      ],
      issues: [],
    };
    const out = parseUploadListResponse(raw);
    expect(out).not.toBeNull();
    expect(out!.items).toHaveLength(1);
    expect(out!.items[0].file_name).toBe("(파일명 미입력)");
    expect(out!.items[0].uid).toBe(
      "upload-a-2026-04-01T00:00:00+09:00-0",
    );
  });
});
