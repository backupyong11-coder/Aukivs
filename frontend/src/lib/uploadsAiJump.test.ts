import { describe, expect, it } from "vitest";

import {
  UPLOAD_CARD_HIGHLIGHT_MS,
  UPLOAD_LIST_SCROLL_ROOT_ID,
  canUseAiDeleteButton,
  canUseAiNextEpisodeButton,
  findUploadItemById,
  resolveUidForExactUploadJump,
  uploadIdIsListed,
  uploadListAnchorUid,
  uploadUidIsListed,
} from "@/lib/uploadsAiJump";

describe("uploadListAnchorUid", () => {
  it("접두사와 uid를 이어 붙여 카드마다 고유한 DOM id 문자열을 만든다", () => {
    expect(uploadListAnchorUid("u-1")).toBe("upload-item-u-1");
    expect(
      uploadListAnchorUid("upload-dup-2026-04-01T10:00:00+09:00-2"),
    ).toBe("upload-item-upload-dup-2026-04-01T10:00:00+09:00-2");
    expect(
      uploadListAnchorUid("upload-dup-2026-04-02T10:00:00+09:00-3"),
    ).not.toBe(
      uploadListAnchorUid("upload-dup-2026-04-01T10:00:00+09:00-2"),
    );
  });
});

describe("uploadUidIsListed", () => {
  it("Set에 uid가 있으면 true", () => {
    expect(uploadUidIsListed("uid-a", new Set(["uid-a"]))).toBe(true);
  });
});

describe("resolveUidForExactUploadJump", () => {
  const items = [
    { id: "a", uid: "upload-a-2026-04-01T00:00:00+09:00-2" },
    { id: "dup", uid: "upload-dup-2026-04-01T10:00:00+09:00-3" },
    { id: "dup", uid: "upload-dup-2026-04-02T10:00:00+09:00-4" },
  ];
  const dup = new Set(["dup"]);

  it("중복 id 집합에 있으면 null (목록 스크롤 fallback)", () => {
    expect(resolveUidForExactUploadJump(items, "dup", dup)).toBeNull();
  });

  it("유일 id면 해당 uid", () => {
    expect(resolveUidForExactUploadJump(items, "a", dup)).toBe(
      "upload-a-2026-04-01T00:00:00+09:00-2",
    );
  });

  it("duplicate 집합은 비었지만 동명 id 2건이면 null", () => {
    const onlyDup = [
      { id: "x", uid: "u1" },
      { id: "x", uid: "u2" },
    ];
    expect(resolveUidForExactUploadJump(onlyDup, "x", new Set())).toBeNull();
  });
});

describe("uploadIdIsListed", () => {
  it("Set에 있으면 true", () => {
    expect(uploadIdIsListed("a", new Set(["a", "b"]))).toBe(true);
  });

  it("없으면 false", () => {
    expect(uploadIdIsListed("gone", new Set(["a"]))).toBe(false);
  });
});

describe("findUploadItemById", () => {
  const rows = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
  ];

  it("id가 일치하면 해당 객체를 반환한다", () => {
    expect(findUploadItemById(rows, "b")).toEqual({ id: "b", title: "B" });
  });

  it("없으면 undefined", () => {
    expect(findUploadItemById(rows, "x")).toBeUndefined();
  });
});

describe("canUseAiNextEpisodeButton", () => {
  it("busy이면 false", () => {
    expect(canUseAiNextEpisodeButton(true, true)).toBe(false);
  });

  it("목록에 id 없으면 false", () => {
    expect(canUseAiNextEpisodeButton(false, false)).toBe(false);
  });

  it("둘 다 아니면 true", () => {
    expect(canUseAiNextEpisodeButton(false, true)).toBe(true);
  });
});

describe("canUseAiDeleteButton", () => {
  it("busy이면 false", () => {
    expect(canUseAiDeleteButton(true, true)).toBe(false);
  });

  it("목록에 id 없으면 false", () => {
    expect(canUseAiDeleteButton(false, false)).toBe(false);
  });

  it("둘 다 아니면 true", () => {
    expect(canUseAiDeleteButton(false, true)).toBe(true);
  });
});

describe("UPLOAD_CARD_HIGHLIGHT_MS", () => {
  it("하이라이트 유지 시간이 2~3초 사이", () => {
    expect(UPLOAD_CARD_HIGHLIGHT_MS).toBeGreaterThanOrEqual(2000);
    expect(UPLOAD_CARD_HIGHLIGHT_MS).toBeLessThanOrEqual(3500);
  });
});

describe("UPLOAD_LIST_SCROLL_ROOT_ID", () => {
  it("고정 문자열", () => {
    expect(UPLOAD_LIST_SCROLL_ROOT_ID).toBe("uploads-list-scroll-root");
  });
});
