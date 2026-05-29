import { getApiBaseUrl } from "@/lib/apiBase";
import { normalizeCompanyProfile, type CompanyProfile } from "@/lib/companyStorage";

export type FetchCompanyProfileResult =
  | { ok: true; profile: CompanyProfile | null; updatedAt: string | null }
  | { ok: false; message: string; status?: number };

export type SaveCompanyProfileResult =
  | { ok: true; updatedAt: string | null }
  | { ok: false; message: string; status?: number };

function userFacingError(status: number, raw: string, op: "fetch" | "save"): string {
  if (status === 401) {
    return "데모 접근 코드가 필요합니다. /demo-login 에서 로그인해 주세요.";
  }
  if (status === 503) {
    return op === "fetch"
      ? "회사 대시보드 서버(Supabase) 설정을 확인할 수 없습니다."
      : "회사 대시보드를 서버에 저장할 수 없습니다. Supabase 설정을 확인하세요.";
  }
  if (status >= 500) {
    return "회사 대시보드 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  try {
    const j = JSON.parse(raw) as { detail?: string };
    if (typeof j.detail === "string") return `HTTP ${status}: ${j.detail}`;
  } catch {
    /* ignore */
  }
  return `HTTP ${status}: ${raw.slice(0, 200)}`;
}

export async function fetchCompanyProfileFromServer(): Promise<FetchCompanyProfileResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/company-profile`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, message: userFacingError(res.status, raw, "fetch") };
    }
    const j = JSON.parse(raw) as { profile?: unknown; updated_at?: string | null };
    if (j.profile == null) {
      return { ok: true, profile: null, updatedAt: j.updated_at ?? null };
    }
    const profile = normalizeCompanyProfile(j.profile);
    if (!profile) {
      return { ok: false, message: "서버에 저장된 회사 정보 형식이 올바르지 않습니다." };
    }
    return { ok: true, profile, updatedAt: j.updated_at ?? null };
  } catch {
    return { ok: false, message: "회사 대시보드 서버에 연결할 수 없습니다." };
  }
}

export async function saveCompanyProfileToServer(
  profile: CompanyProfile,
): Promise<SaveCompanyProfileResult> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/company-profile`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, message: userFacingError(res.status, raw, "save") };
    }
    let updatedAt: string | null = null;
    try {
      const j = JSON.parse(raw) as { updated_at?: string | null };
      updatedAt = j.updated_at ?? null;
    } catch {
      /* ok */
    }
    return { ok: true, updatedAt };
  } catch {
    return { ok: false, message: "회사 대시보드 서버에 연결할 수 없습니다." };
  }
}
