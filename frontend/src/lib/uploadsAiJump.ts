/** AI 추천 → 업로드 카드 스크롤/하이라이트용 (DOM id·목록 포함 여부). */

export const UPLOAD_CARD_HIGHLIGHT_MS = 2500;

/** 중복 id 시「목록 구역만」스크롤할 때 붙이는 루트 요소 id */
export const UPLOAD_LIST_SCROLL_ROOT_ID = "uploads-list-scroll-root";

const PREFIX = "upload-item-";

/**
 * 업로드 카드 루트 요소의 HTML id (스크롤·하이라이트 대상).
 * 동일 A열 id가 여러 행이어도 충돌하지 않도록 GET /uploads 의 uid(행·시각 포함)를 씁니다.
 */
export function uploadListAnchorUid(itemUid: string): string {
  return `${PREFIX}${itemUid}`;
}

export function uploadIdIsListed(uploadId: string, listedIds: ReadonlySet<string>): boolean {
  return listedIds.has(uploadId);
}

export function uploadUidIsListed(itemUid: string, listedUids: ReadonlySet<string>): boolean {
  return listedUids.has(itemUid);
}

/**
 * AI 등에서 id만 알 때, 정확히 한 카드로 점프할 uid.
 * - duplicateIds 에 있으면 null (잘못된 카드로 점프 방지 → 목록 구역 스크롤 fallback)
 * - 동일 id가 2건 이상이면 null
 */
export function resolveUidForExactUploadJump(
  items: readonly { id: string; uid: string }[],
  uploadId: string,
  duplicateIds: ReadonlySet<string>,
): string | null {
  if (duplicateIds.has(uploadId)) return null;
  const matches = items.filter((i) => i.id === uploadId);
  if (matches.length !== 1) return null;
  return matches[0].uid;
}

export function scrollUploadListSectionIntoView(): void {
  document.getElementById(UPLOAD_LIST_SCROLL_ROOT_ID)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/** AI 추천 id → 현재 목록의 동일 id 항목 (없으면 undefined). */
export function findUploadItemById<T extends { id: string }>(
  items: readonly T[],
  uploadId: string,
): T | undefined {
  return items.find((i) => i.id === uploadId);
}

/** AI 추천 행의「다음 회차」— 카드와 동일하게 busy 아닐 때·목록에 id 있을 때만 활성. */
export function canUseAiNextEpisodeButton(
  busy: boolean,
  idListed: boolean,
): boolean {
  return !busy && idListed;
}

/** AI 추천 행의「삭제」— 카드 삭제와 동일한 활성 조건. */
export function canUseAiDeleteButton(
  busy: boolean,
  idListed: boolean,
): boolean {
  return !busy && idListed;
}
