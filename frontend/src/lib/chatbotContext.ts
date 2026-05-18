import { getApiBaseUrl } from "@/lib/apiBase";
import { fetchChecklist } from "@/lib/checklist";
import type { ChecklistItem } from "@/lib/checklist";
import { fetchMemos, type MemoItem } from "@/lib/memos";
import { fetchPlatformMaster, type PlatformMasterItem } from "@/lib/platformMaster";
import { fetchTasks } from "@/lib/tasks";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";

export type ChatbotContextPayload = {
  platformMaster: PlatformMasterItem[];
  worksMaster: WorksMasterItem[];
  memos: MemoItem[];
  tasks: Record<string, string>[];
  checklist: ChecklistItem[];
};

export type ChatbotContextResult =
  | { ok: true; data: ChatbotContextPayload }
  | { ok: false; message: string };

const CACHE_KEY = "chatbot_context_v1";
const CACHE_TTL_MS = 90_000;

function readCache(): ChatbotContextPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: ChatbotContextPayload };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: ChatbotContextPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}

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

async function fetchChatbotContextFallback(
  init?: RequestInit,
): Promise<ChatbotContextResult> {
  const [pm, wm, memos, tasks, checklist] = await Promise.all([
    fetchPlatformMaster(),
    fetchWorksMaster(),
    fetchMemos(init, 40),
    fetchTasks(),
    fetchChecklist(),
  ]);
  if (init?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const data: ChatbotContextPayload = {
    platformMaster: pm.ok ? pm.items.slice(0, 60) : [],
    worksMaster: wm.ok ? wm.items.slice(0, 60) : [],
    memos: memos.ok ? memos.items.slice(0, 40) : [],
    tasks: tasks.ok ? tasks.items.slice(0, 100) : [],
    checklist: checklist.ok ? checklist.items.slice(0, 100) : [],
  };
  writeCache(data);
  return { ok: true, data };
}

function mapChecklist(rows: unknown[]): ChecklistItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: "chatbot",
      title: String(o.title ?? ""),
      note: o.note != null ? String(o.note) : null,
      due_date: o.due_date != null ? String(o.due_date) : null,
      platform: o.platform != null ? String(o.platform) : null,
      category: o.category != null ? String(o.category) : null,
      priority: o.priority != null ? String(o.priority) : null,
      quantification: null,
      difficulty: null,
      fatigue: null,
      work_status: o.work_status != null ? String(o.work_status) : null,
      memo: o.memo != null ? String(o.memo) : null,
    };
  });
}

export async function fetchChatbotContext(init?: RequestInit): Promise<ChatbotContextResult> {
  const cached = readCache();
  if (cached) return { ok: true, data: cached };

  try {
    const res = await fetch(`${getApiBaseUrl()}/hub/chatbot-context`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
    const raw = await res.text();
    if (!res.ok) {
      if (shouldFallbackFromHub(res.status)) {
        return fetchChatbotContextFallback(init);
      }
      return { ok: false, message: hubErrorMessage(res.status, raw) };
    }
    const j = JSON.parse(raw) as Record<string, unknown>;
    const data: ChatbotContextPayload = {
      platformMaster: Array.isArray(j.platformMaster) ? (j.platformMaster as PlatformMasterItem[]) : [],
      worksMaster: Array.isArray(j.worksMaster) ? (j.worksMaster as WorksMasterItem[]) : [],
      memos: Array.isArray(j.memos) ? (j.memos as MemoItem[]) : [],
      tasks: Array.isArray(j.tasks) ? (j.tasks as Record<string, string>[]) : [],
      checklist: mapChecklist(j.checklist as unknown[]),
    };
    writeCache(data);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    return {
      ok: false,
      message: e instanceof Error ? e.message : "챗봇 데이터를 불러오지 못했습니다.",
    };
  }
}
