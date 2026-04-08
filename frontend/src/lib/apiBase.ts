/**
 * FastAPI 호출의 단일 진입점.
 * - `NEXT_PUBLIC_API_BASE_URL` 이 비어 있으면(권장) 같은 출처 `/api/ops` → next.config.ts 의 OPSPROXY_TARGET 으로 rewrite.
 * - Vercel 배포 시에도 비우기: OPSPROXY_TARGET 에 Railway/Render URL만 넣고(서버 전용), 브라우저는 프론트 도메인만 사용.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const base = raw.replace(/\/$/, "");
  if (base) return base;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/ops`;
  }
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}/api/ops`;
}
