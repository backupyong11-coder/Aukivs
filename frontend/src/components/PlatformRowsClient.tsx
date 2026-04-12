"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiBase";

type PlatformRow = Record<string, string> & { id: string; sheet_row: number };

// 수정 가능 필드
const EDIT_FIELDS: { key: string; label: string }[] = [
  { key: "현재단계", label: "현재단계" },
  { key: "마지막상황", label: "마지막상황" },
  { key: "대기사유", label: "대기사유" },
  { key: "다음액션", label: "다음액션" },
  { key: "우선순위", label: "우선순위" },
  { key: "비고", label: "비고" },
];

// 목록에서 보여줄 조회 필드
const VIEW_FIELDS = ["현재단계", "마지막업데이트날짜", "마지막상황", "대기사유", "다음액션", "우선순위"];

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try { const j = JSON.parse(text); throw new Error(j.detail ?? text); }
    catch { throw new Error(text); }
  }
  return JSON.parse(text);
}

export function PlatformRowsClient() {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PlatformRow[] }>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<PlatformRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = await apiFetch("/platform-rows");
      setState({ kind: "ready", items });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

  const visible = state.kind === "ready"
    ? state.items.filter(it =>
        !filterText ||
        (it["회사명"] ?? "").includes(filterText) ||
        (it["현재단계"] ?? "").includes(filterText) ||
        (it["플랫폼명"] ?? "").includes(filterText)
      )
    : [];

  const openEdit = (item: PlatformRow) => {
    setActionError(null);
    setEditItem(item);
    const f: Record<string, string> = {};
    EDIT_FIELDS.forEach(({ key }) => { f[key] = item[key] ?? ""; });
    setForm(f);
  };

  const handleSave = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/platform-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="회사명·플랫폼명·단계 검색"
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100" />
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
        </button>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">수정 시 마지막업데이트날짜 자동 기록</span>
      </div>

      {actionError && !editItem &&
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />불러오는 중…
        </div>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {state.message}
        </div>
      )}

      {state.kind === "ready" && (
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">항목이 없습니다</p>
          )}
          {visible.map(item => {
            const company = item["회사명"] ?? `행 ${item.sheet_row}`;
            const platform = item["플랫폼명"] ?? "";
            const stage = item["현재단계"] ?? "";
            const priority = item["우선순위"] ?? "";
            const updated = item["마지막업데이트날짜"] ?? "";
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                {/* 헤더 행 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">{company}</span>
                      {platform && platform !== company && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{platform}</span>
                      )}
                      {priority && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">우선: {priority}</span>
                      )}
                      {stage && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">{stage}</span>
                      )}
                      {updated && (
                        <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">갱신 {updated}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                      {item["다음액션"] ? `→ ${item["다음액션"]}` : ""}
                    </p>
                  </button>
                  <button onClick={() => openEdit(item)}
                    className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    수정
                  </button>
                </div>

                {/* 펼치면 전체 조회 */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                      {Object.entries(item)
                        .filter(([k]) => !["id","sheet_row"].includes(k) && item[k])
                        .map(([k, v]) => (
                          <div key={k}>
                            <span className="font-medium text-zinc-500 dark:text-zinc-400">{k}: </span>
                            <span className="text-zinc-800 dark:text-zinc-200">{v}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {editItem["회사명"] ?? ""} 수정
            </h3>
            <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
              마지막업데이트날짜는 저장 시 자동으로 현재 시각으로 기록됩니다.
            </p>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {EDIT_FIELDS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
                  <input type="text" value={form[key] ?? ""}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              ))}
            </div>
            {actionError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditItem(null)} disabled={saving}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
                취소
              </button>
              <button onClick={() => void handleSave()} disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
