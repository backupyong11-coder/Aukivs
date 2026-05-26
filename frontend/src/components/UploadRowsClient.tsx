"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { FilterTagsFlow } from "@/components/FilterTagsFlow";
import { getApiBaseUrl } from "@/lib/apiBase";

export type UploadRow = {
  id: string;
  sheet_row: string;
  완료: string;
  업로드일: string;
  플랫폼명: string;
  작품명: string;
  업로드화수: string;
  남은업로드화수: string;
  업로드완료여부: string;
  업로드주기: string;
  업로드요일: string;
  업로드방식: string;
  런칭일: string;
  마지막업로드일: string;
  다음업로드일: string;
  원고준비: string;
  업로드링크: string;
  마지막업로드회수: string;
  비고: string;
};

type SortKey =
  | "업로드일"
  | "플랫폼명"
  | "작품명"
  | "업로드완료여부"
  | "남은업로드화수"
  | "업로드방식"
  | "다음업로드일"
  | "비고";
type SortDir = "asc" | "desc";
type TabType = "미완료" | "완료" | "전체";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: UploadRow[] };

/** 표에 노출하는 열 (id·sheet_row·완료 플래그는 별도 UI) */
const TABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "업로드일", label: "업로드일" },
  { key: "플랫폼명", label: "플랫폼" },
  { key: "작품명", label: "작품명" },
  { key: "업로드완료여부", label: "완료여부" },
  { key: "남은업로드화수", label: "남은화수" },
  { key: "업로드방식", label: "업로드방식" },
  { key: "다음업로드일", label: "다음업로드일" },
  { key: "비고", label: "비고" },
];

/** 수정 모달 전용(표에는 숨김) */
const FORM_EXTRA_FIELDS: { key: keyof UploadRow; label: string }[] = [
  { key: "업로드화수", label: "업로드화수" },
  { key: "업로드주기", label: "업로드주기" },
  { key: "업로드요일", label: "업로드요일" },
  { key: "런칭일", label: "런칭일" },
  { key: "마지막업로드일", label: "마지막업로드일" },
  { key: "원고준비", label: "원고준비" },
  { key: "업로드링크", label: "업로드링크/제출처" },
  { key: "마지막업로드회수", label: "마지막업로드회수" },
];

export const EDIT_FIELDS: { key: keyof UploadRow; label: string; required?: boolean }[] = [
  { key: "작품명", label: "작품명", required: true },
  { key: "업로드일", label: "업로드일" },
  { key: "플랫폼명", label: "플랫폼명" },
  { key: "업로드완료여부", label: "업로드완료여부" },
  { key: "남은업로드화수", label: "남은업로드화수" },
  { key: "업로드방식", label: "업로드방식" },
  { key: "다음업로드일", label: "다음업로드일" },
  { key: "비고", label: "비고" },
  ...FORM_EXTRA_FIELDS,
];

const EMPTY_ROW: Omit<UploadRow, "id" | "sheet_row"> = {
  완료: "",
  업로드일: "",
  플랫폼명: "",
  작품명: "",
  업로드화수: "",
  남은업로드화수: "",
  업로드완료여부: "",
  업로드주기: "",
  업로드요일: "",
  업로드방식: "",
  런칭일: "",
  마지막업로드일: "",
  다음업로드일: "",
  원고준비: "",
  업로드링크: "",
  마지막업로드회수: "",
  비고: "",
};

export type FormType = Partial<Record<keyof UploadRow, string>>;

function isDone(item: UploadRow) {
  return (
    item.완료 === "TRUE" || item.완료 === "true" || item.완료 === "1" ||
    item.업로드완료여부 === "업로드 완료"
  );
}

async function apiFetch(path: string, body?: object) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    try { const j = JSON.parse(text) as { detail?: string }; throw new Error(j.detail ?? text); }
    catch { throw new Error(text); }
  }
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

/** 컴포넌트 본문 안에 모달을 정의하면 매 렌더마다 타입이 바뀌어 입력 포커스가 끊깁니다. */
export function UploadRowFormModal(props: {
  title: string;
  fields: FormType;
  setFields: Dispatch<SetStateAction<FormType>>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  actionError: string | null;
}) {
  const { title, fields, setFields, onSave, onClose, saving, actionError } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {EDIT_FIELDS.map(({ key, label, required }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {label}{required ? " *" : ""}
              </span>
              <input
                type="text"
                value={fields[key] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          ))}
        </div>
        {actionError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300">
            취소
          </button>
          <button type="button" onClick={onSave} disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UploadRowsClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [editItem, setEditItem] = useState<UploadRow | null>(null);
  const [form, setForm] = useState<FormType>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState<FormType>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [tab, setTab] = useState<TabType>("미완료");
  const [sortKey, setSortKey] = useState<SortKey>("업로드일");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("upload.hiddenPlatforms");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });
  const [hiddenWorks, setHiddenWorks] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const saved = window.localStorage.getItem("upload.hiddenWorks");
      if (saved) return new Set<string>(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const raw = await apiFetch("/upload-rows");
      const arr = Array.isArray(raw) ? raw : [];
      const items: UploadRow[] = arr.map((row) => {
        const r = row as UploadRow;
        return {
          ...EMPTY_ROW,
          ...r,
          id: String(r.id ?? ""),
          sheet_row: String(r.sheet_row ?? ""),
        };
      });
      setState({ kind: "ready", items });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "불러오기 실패" });
    }
  }, []);

  useEffect(() => { void load(); }, [refreshKey, load]);

  const counts = useMemo(() => {
    if (state.kind !== "ready") return { 미완료: 0, 완료: 0, 전체: 0 };
    const done = state.items.filter(isDone).length;
    return { 미완료: state.items.length - done, 완료: done, 전체: state.items.length };
  }, [state]);

  const allPlatforms = useMemo(() => {
    if (state.kind !== "ready") return [];
    const keys = [...new Set(state.items.map(it => (it.플랫폼명 ?? "").trim()))];
    keys.sort((a, b) => {
      const ae = a === "", be = b === "";
      if (ae && !be) return 1;
      if (!ae && be) return -1;
      return a.localeCompare(b, "ko");
    });
    return keys;
  }, [state]);

  const allWorks = useMemo(() => {
    if (state.kind !== "ready") return [];
    const keys = [...new Set(state.items.map(it => (it.작품명 ?? "").trim()))];
    keys.sort((a, b) => {
      const ae = a === "", be = b === "";
      if (ae && !be) return 1;
      if (!ae && be) return -1;
      return a.localeCompare(b, "ko");
    });
    return keys;
  }, [state]);

  const listLabel = (key: string) => (key === "" ? "(비어 있음)" : key);

  const togglePlatform = (key: string) => {
    setHiddenPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("upload.hiddenPlatforms", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const toggleWork = (key: string) => {
    setHiddenWorks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { window.localStorage.setItem("upload.hiddenWorks", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const setHiddenPlatformsSave = (next: Set<string>) => {
    try { window.localStorage.setItem("upload.hiddenPlatforms", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenPlatforms(next);
  };
  const setHiddenWorksSave = (next: Set<string>) => {
    try { window.localStorage.setItem("upload.hiddenWorks", JSON.stringify([...next])); } catch { /* ignore */ }
    setHiddenWorks(next);
  };

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    let items = state.items;
    if (tab === "미완료") items = items.filter(it => !isDone(it));
    else if (tab === "완료") items = items.filter(isDone);
    if (filterText) {
      const q = filterText;
      items = items.filter(it =>
        (it.작품명 ?? "").includes(q) ||
        (it.플랫폼명 ?? "").includes(q) ||
        (it.비고 ?? "").includes(q) ||
        (it.업로드방식 ?? "").includes(q) ||
        (it.업로드완료여부 ?? "").includes(q)
      );
    }
    if (hiddenPlatforms.size > 0) {
      items = items.filter(it => !hiddenPlatforms.has((it.플랫폼명 ?? "").trim()));
    }
    if (hiddenWorks.size > 0) {
      items = items.filter(it => !hiddenWorks.has((it.작품명 ?? "").trim()));
    }
    return [...items].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (sortKey === "남은업로드화수") {
        const na = Number.parseFloat(va) || 0;
        const nb = Number.parseFloat(vb) || 0;
        return sortDir === "asc" ? na - nb : nb - na;
      }
      return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
    });
  }, [state, tab, filterText, hiddenPlatforms, hiddenWorks, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const openEdit = (item: UploadRow) => {
    setActionError(null);
    setEditItem(item);
    const f: FormType = {};
    EDIT_FIELDS.forEach(({ key }) => { f[key] = item[key] ?? ""; });
    setForm(f);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/upload-rows/update", { id: editItem.id, ...form });
      setEditItem(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "수정 실패");
    } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setSaving(true); setActionError(null);
    try {
      await apiFetch("/upload-rows/create", newForm);
      setCreateOpen(false);
      setNewForm({});
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "추가 실패");
    } finally { setSaving(false); }
  };

  const handleDelete = async (item: UploadRow) => {
    if (!window.confirm(`"${item.작품명}" (${item.플랫폼명}) 행을 삭제할까요?`)) return;
    try {
      await apiFetch("/upload-rows/delete", { id: item.id });
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-0.5 text-zinc-300">↕</span>;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thCls = "whitespace-nowrap px-3 py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400";
  const thSort = thCls + " cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100";

  const tableColSpan = 3 + TABLE_COLUMNS.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setActionError(null); setNewForm({}); setCreateOpen(true); }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          새 업로드 추가
        </button>
        <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
          placeholder="작품명·플랫폼명·비고 검색"
          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:min-w-[16rem]" />
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
          새로고침
        </button>
      </div>

      {state.kind === "ready" && (
        <FilterTagsFlow
          listLabel={listLabel}
          groups={[
            {
              title: "플랫폼",
              keys: allPlatforms,
              hidden: hiddenPlatforms,
              onToggle: togglePlatform,
              onShowAll: () => setHiddenPlatformsSave(new Set()),
              onHideAll: () => setHiddenPlatformsSave(new Set(allPlatforms)),
            },
            {
              title: "작품명",
              keys: allWorks,
              hidden: hiddenWorks,
              onToggle: toggleWork,
              onShowAll: () => setHiddenWorksSave(new Set()),
              onHideAll: () => setHiddenWorksSave(new Set(allWorks)),
            },
          ]}
        />
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(["미완료", "완료", "전체"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}>
            {t}
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {actionError && !editItem && !createOpen &&
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {state.kind === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          불러오는 중…
        </div>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {state.message}
        </div>
      )}

      {state.kind === "ready" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[1200px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                <th className={thCls}>수정</th>
                <th className={thCls}>완료</th>
                {TABLE_COLUMNS.map(({ key, label }) => (
                  <th key={key} className={thSort} onClick={() => handleSort(key)}>
                    {label}<SortIcon col={key}/>
                  </th>
                ))}
                <th className={thCls}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={tableColSpan} className="px-3 py-8 text-center text-zinc-500">
                  {filterText || hiddenPlatforms.size > 0 || hiddenWorks.size > 0 ? "조건에 맞는 항목이 없습니다" : `${tab} 업로드가 없습니다`}
                </td></tr>
              ) : visible.map(item => (
                <tr key={item.id}
                  className={`border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50 ${isDone(item) ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => openEdit(item)}
                      className="whitespace-nowrap rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
                      수정
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-center text-emerald-600 dark:text-emerald-400">
                    {isDone(item) ? "✓" : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">{item.업로드일}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium">{item.플랫폼명}</td>
                  <td className="px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-50">
                    <span className="block max-w-[280px] truncate">{item.작품명}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                      item.업로드완료여부 === "업로드 완료"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                    }`}>{item.업로드완료여부 || "업로드 예정"}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-center font-semibold text-zinc-800 dark:text-zinc-200">
                    {item.남은업로드화수 || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">{item.업로드방식}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-500">{item.다음업로드일}</td>
                  <td className="px-3 py-1.5">
                    <span className="block max-w-[14rem] truncate text-zinc-400">{item.비고}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => void handleDelete(item)}
                      className="whitespace-nowrap rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-800 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <UploadRowFormModal
          title={`수정: ${editItem.작품명}`}
          fields={form}
          setFields={setForm}
          onSave={() => void handleSaveEdit()}
          onClose={() => setEditItem(null)}
          saving={saving}
          actionError={actionError}
        />
      )}
      {createOpen && (
        <UploadRowFormModal
          title="새 업로드 추가"
          fields={newForm}
          setFields={setNewForm}
          onSave={() => void handleCreate()}
          onClose={() => setCreateOpen(false)}
          saving={saving}
          actionError={actionError}
        />
      )}
    </div>
  );
}
