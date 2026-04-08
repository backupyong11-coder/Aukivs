import { describe, expect, it } from "vitest";

import {
  canStartDraftAddToChecklist,
  canToggleDraftRowSelection,
  draftSuggestItemKey,
  filterBatchDraftTargets,
  showDraftAddToChecklist,
} from "@/lib/draftSuggestItem";

describe("draftSuggestItemKey", () => {
  it("같은 인덱스라도 note가 다르면 키가 다르다", () => {
    const a = draftSuggestItemKey(0, "제목", null);
    const b = draftSuggestItemKey(0, "제목", "메모");
    expect(a).not.toBe(b);
  });

  it("인덱스가 다르면 제목이 같아도 키가 다르다", () => {
    const a = draftSuggestItemKey(0, "제목", null);
    const b = draftSuggestItemKey(1, "제목", null);
    expect(a).not.toBe(b);
  });
});

describe("showDraftAddToChecklist", () => {
  it("prioritize 에서는 false", () => {
    expect(showDraftAddToChecklist("prioritize")).toBe(false);
  });

  it("draft 에서는 true", () => {
    expect(showDraftAddToChecklist("draft")).toBe(true);
  });
});

describe("canStartDraftAddToChecklist", () => {
  const key = "k1";

  it("이미 추가된 키는 false", () => {
    expect(
      canStartDraftAddToChecklist(key, new Set([key]), {}),
    ).toBe(false);
  });

  it("추가 중인 키는 false", () => {
    expect(
      canStartDraftAddToChecklist(key, new Set(), { [key]: true }),
    ).toBe(false);
  });

  it("둘 다 아니면 true", () => {
    expect(canStartDraftAddToChecklist(key, new Set(), {})).toBe(true);
  });

  it("일괄 처리 중이면 false", () => {
    expect(
      canStartDraftAddToChecklist(key, new Set(), {}, true),
    ).toBe(false);
  });
});

describe("filterBatchDraftTargets", () => {
  const items = [
    { title: "A", note: null as string | null },
    { title: "B", note: "n" },
  ];
  const k0 = draftSuggestItemKey(0, "A", null);
  const k1 = draftSuggestItemKey(1, "B", "n");

  it("선택이 없으면 빈 배열", () => {
    expect(
      filterBatchDraftTargets(items, new Set(), new Set(), {}),
    ).toEqual([]);
  });

  it("선택 2개 모두 추가 가능하면 2개", () => {
    const sel = new Set([k0, k1]);
    expect(filterBatchDraftTargets(items, sel, new Set(), {})).toHaveLength(2);
  });

  it("이미 added 인 항목은 제외", () => {
    const sel = new Set([k0, k1]);
    const added = new Set([k0]);
    const t = filterBatchDraftTargets(items, sel, added, {});
    expect(t).toHaveLength(1);
    expect(t[0].key).toBe(k1);
  });

  it("adding 중인 항목은 제외", () => {
    const sel = new Set([k0, k1]);
    const t = filterBatchDraftTargets(items, sel, new Set(), { [k0]: true });
    expect(t).toHaveLength(1);
    expect(t[0].key).toBe(k1);
  });
});

describe("canToggleDraftRowSelection", () => {
  const key = "k";

  it("일괄 처리 중이면 false", () => {
    expect(
      canToggleDraftRowSelection(key, new Set(), {}, true),
    ).toBe(false);
  });

  it("추가됨이면 false", () => {
    expect(
      canToggleDraftRowSelection(key, new Set([key]), {}, false),
    ).toBe(false);
  });

  it("일반적으로 true", () => {
    expect(canToggleDraftRowSelection(key, new Set(), {}, false)).toBe(true);
  });
});
