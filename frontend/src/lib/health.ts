import { getApiBaseUrl } from "@/lib/apiBase";

export type BackendHealthPayload = {
  status: string;
};

export { getApiBaseUrl };

export type FetchBackendHealthResult =
  | { ok: true; payload: BackendHealthPayload; rawText: string }
  | { ok: false; message: string };

/**
 * FastAPI `GET /health` 호출. 클라이언트 컴포넌트에서 사용하세요.
 */
export async function fetchBackendHealth(
  init?: RequestInit,
): Promise<FetchBackendHealthResult> {
  const base = getApiBaseUrl();

  try {
    const res = await fetch(`${base}/health`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
    const rawText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}: ${rawText}`,
      };
    }
    try {
      const payload = JSON.parse(rawText) as BackendHealthPayload;
      return { ok: true, payload, rawText };
    } catch {
      return {
        ok: false,
        message: "응답이 올바른 JSON이 아닙니다.",
      };
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e;
    }
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "백엔드에 연결할 수 없습니다. FastAPI가 실행 중인지 확인하세요.",
    };
  }
}
