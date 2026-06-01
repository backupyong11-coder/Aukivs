import { describe, expect, it } from "vitest";
import { composeQuantificationType } from "@/lib/taskQuantificationType";

describe("composeQuantificationType", () => {
  it("concatenates 분야, 분류, 정량화 분 in order", () => {
    expect(
      composeQuantificationType({
        분야: "[성인웹툰]",
        분류: "[제작]",
        "정량화 분": "[AI스토리교정]",
      }),
    ).toBe("[성인웹툰][제작][AI스토리교정]");
  });

  it("skips empty parts", () => {
    expect(
      composeQuantificationType({
        분야: "[회사]",
        분류: "",
        "정량화 분": "[주간결산]",
      }),
    ).toBe("[회사][주간결산]");
  });

  it("returns empty when all parts empty", () => {
    expect(composeQuantificationType({ 분야: "", 분류: "", "정량화 분": "" })).toBe("");
  });
});
