import { getApiBaseUrl } from "@/lib/apiBase";
import { fetchPlatformMaster, type PlatformMasterItem } from "@/lib/platformMaster";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";

function shouldFallbackFromHub(status: number): boolean {
  return status === 404 || status === 405;
}

function hubErrorMessage(status: number, raw: string): string {
  if (status === 401) {
    try {
      const j = JSON.parse(raw) as { error?: string };
      if (j.error) return j.error;
    } catch {
      /* ignore */
    }
    return "데모 접근 코드가 필요합니다. /demo-login 에서 로그인해 주세요.";
  }
  return raw || `HTTP ${status}`;
}

async function fetchPlatformMatrixBootstrapFallback(
  init?: RequestInit,
): Promise<{ ok: true; data: PlatformMatrixBootstrap } | { ok: false; message: string }> {
  const [wm, pm] = await Promise.all([fetchWorksMaster(), fetchPlatformMaster()]);
  if (init?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const data: PlatformMatrixBootstrap = {
    worksMaster: wm.ok ? wm.items : [],
    platformMaster: pm.ok ? pm.items : [],
  };
  writeCache(data);
  return { ok: true, data };
}

export type PlatformMatrixBootstrap = {
  worksMaster: WorksMasterItem[];
  platformMaster: PlatformMasterItem[];
};

const CACHE_KEY = "platform_matrix_bootstrap_v1";
const CACHE_TTL_MS = 120_000;

function readCache(): PlatformMatrixBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: PlatformMatrixBootstrap };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: PlatformMatrixBootstrap) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}

export async function fetchPlatformMatrixBootstrap(
  init?: RequestInit,
): Promise<{ ok: true; data: PlatformMatrixBootstrap } | { ok: false; message: string }> {
  const cached = readCache();
  if (cached) return { ok: true, data: cached };

  try {
    const res = await fetch(`${getApiBaseUrl()}/hub/platform-matrix-bootstrap`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
    const raw = await res.text();
    if (!res.ok) {
      if (shouldFallbackFromHub(res.status)) {
        return fetchPlatformMatrixBootstrapFallback(init);
      }
      return { ok: false, message: hubErrorMessage(res.status, raw) };
    }
    const j = JSON.parse(raw) as PlatformMatrixBootstrap;
    const data: PlatformMatrixBootstrap = {
      worksMaster: Array.isArray(j.worksMaster) ? j.worksMaster : [],
      platformMaster: Array.isArray(j.platformMaster) ? j.platformMaster : [],
    };
    writeCache(data);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return {
      ok: false,
      message: e instanceof Error ? e.message : "플랫폼 매트릭스를 불러오지 못했습니다.",
    };
  }
}
