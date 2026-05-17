import type { WorksMasterItem } from "@/lib/worksMaster";
import { normalizeSheetDateYmd } from "@/lib/sheetDates";

export function worksFirstSupplyYmd(w: WorksMasterItem): string {
  const raw = w["첫 공급 일정"] ?? w["첫공급일정"] ?? "";
  return normalizeSheetDateYmd(raw) ?? "";
}

/** 작품정리 시트 열 순(시트 1행 헤더와 동일한 키) */
export function worksRowSubLines(w: WorksMasterItem): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, key: string) => {
    const v = (w[key] ?? "").trim();
    if (v) rows.push({ label, value: v });
  };
  push("제작완료", "제작완료");
  push("글작가", "글작가");
  push("그림작가", "그림작가");
  push("분류", "분류(일반/성인)");
  push("형식", "형식(웹툰/웹소설 등)");
  push("현재상태", "현재상태");
  push("업로드해야 하는 사이트", "업로드해야 하는 사이트");
  push("런칭된 사이트", "런칭된 사이트");
  push("대기중 사이트", "대기중 사이트");
  push("계약된 사이트", "계약된 사이트");
  push("총화수/시즌", "총화수/시즌정보");
  push("줄거리", "줄거리");
  push("캐릭터", "캐릭터");
  push("카피라이트", "카피라이트");
  push("UCI", "UCI (구 ISBN)");
  push("태그", "태그");
  push("보유에셋/비고", "보유에셋/비고");
  push("스태프", "스태프");
  push("연령등급", "연령등급");
  push("첫 공급 일정", "첫 공급 일정");
  push("연재요일", "연재요일");
  push("연재중인 곳 갯수", "연재중인 곳 갯수");
  push("연재중인 사이트", "연재중인 사이트");
  return rows;
}
