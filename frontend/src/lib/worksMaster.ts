import { getApiBaseUrl } from "@/lib/apiBase";

/**
 * GET /works-master — 작품정리 탭(기본 탭명 「작품정리」) 행.
 * 키는 시트 1행 헤더와 동일해야 합니다. 예시(A~X):
 * 제작완료, 작품명, 글작가, 그림작가, 분류(일반/성인), 형식(웹툰/웹소설 등), 현재상태,
 * 업로드해야 하는 사이트, 런칭된 사이트, 대기중 사이트, 계약된 사이트, 총화수/시즌정보, 줄거리,
 * 캐릭터, 카피라이트, UCI (구 ISBN), 태그, 보유에셋/비고, 스태프, 연령등급,
 * 첫 공급 일정, 연재요일, 연재중인 곳 갯수, 연재중인 사이트
 */
export type WorksMasterItem = Record<string, string>;

type FetchResult =
  | { ok: true; items: WorksMasterItem[] }
  | { ok: false; items: WorksMasterItem[] };

export async function fetchWorksMaster(): Promise<FetchResult> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/works-master`);
    if (!res.ok) return { ok: false, items: [] };
    const data = await res.json();
    const items: WorksMasterItem[] = Array.isArray(data?.items) ? data.items : [];
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}
