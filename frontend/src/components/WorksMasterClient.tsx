"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWorksMaster, type WorksMasterItem } from "@/lib/worksMaster";
import {
  createWorksMasterRow,
  updateWorksMasterRow,
  WORK_MATRIX_FIELDS,
} from "@/lib/worksMasterMutate";
import {
  fetchWorksMasterPreferences,
  saveWorksMasterPreferences,
} from "@/lib/worksMasterPreferencesApi";
import {
  getWorkGenre,
  mergeWorkGenreOptions,
  WORK_GENRE_FIELD,
} from "@/lib/worksGenre";

const inputCls =
  "mt-0.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

const TABLE_COLUMNS: { key: string; label: string; wide?: boolean }[] = [
  { key: WORK_GENRE_FIELD, label: "분류" },
  { key: "작품명", label: "작품명", wide: true },
  { key: "글작가", label: "글작가" },
  { key: "그림작가", label: "그림작가" },
  { key: "형식(웹툰/웹소설 등)", label: "형식" },
  { key: "현재상태", label: "현재상태" },
  { key: "연재중인 사이트", label: "연재중", wide: true },
  { key: "런칭된 사이트", label: "런칭", wide: true },
  { key: "업로드해야 하는 사이트", label: "업로드", wide: true },
  { key: "대기중 사이트", label: "대기", wide: true },
  { key: "계약된 사이트", label: "계약", wide: true },
];

function emptyForm(): Record<string, string> {
  const f: Record<string, string> = {};
  for (const { key } of WORK_MATRIX_FIELDS) f[key] = "";
  for (const { key } of TABLE_COLUMNS) {
    if (!(key in f)) f[key] = "";
  }
  return f;
}

function workToForm(w: WorksMasterItem): Record<string, string> {
  const f = emptyForm();
  for (const key of Object.keys(f)) {
    f[key] = String(w[key] ?? "").trim();
  }
  if (!f[WORK_GENRE_FIELD]) f[WORK_GENRE_FIELD] = getWorkGenre(w);
  return f;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

export function WorksMasterClient() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [items, setItems] = useState<WorksMasterItem[]>([]);
  const [workGenres, setWorkGenres] = useState<string[]>([]);
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [genrePanelOpen, setGenrePanelOpen] = useState(false);
  const [genreDraft, setGenreDraft] = useState<string[]>([]);
  const [newGenre, setNewGenre] = useState("");
  const [genreSaving, setGenreSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoad({ kind: "loading" });
    const [worksRes, prefRes] = await Promise.all([
      fetchWorksMaster(),
      fetchWorksMasterPreferences(),
    ]);
    if (!worksRes.ok) {
      setLoad({ kind: "error", message: "작품 DB를 불러오지 못했습니다." });
      setItems([]);
      return;
    }
    setItems(worksRes.items);
    setWorkGenres(prefRes.workGenres);
    setLoad({ kind: "ready" });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const genreOptions = useMemo(
    () => mergeWorkGenreOptions(workGenres, items),
    [workGenres, items],
  );

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const genre = getWorkGenre(it);
      if (genreFilter && genre !== genreFilter) return false;
      if (!q) return true;
      const hay = [
        genre,
        it["작품명"],
        it["글작가"],
        it["그림작가"],
        it["형식(웹툰/웹소설 등)"],
        it["현재상태"],
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [items, genreFilter, search]);

  const openCreate = () => {
    setEditTitle(null);
    setForm(emptyForm());
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (item: WorksMasterItem) => {
    const title = String(item["작품명"] ?? "").trim();
    setEditTitle(title);
    setForm(workToForm(item));
    setActionError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setActionError(null);
    const title = form["작품명"]?.trim() ?? "";
    if (!title) {
      setActionError("작품명을 입력하세요.");
      setSaving(false);
      return;
    }
    const payload = { ...form, [WORK_GENRE_FIELD]: form[WORK_GENRE_FIELD]?.trim() ?? "" };
    const r = editTitle
      ? await updateWorksMasterRow(editTitle, payload)
      : await createWorksMasterRow(payload);
    setSaving(false);
    if (!r.ok) {
      setActionError(r.message);
      return;
    }
    setModalOpen(false);
    setEditTitle(null);
    await reload();
  };

  const openGenrePanel = () => {
    setGenreDraft([...genreOptions]);
    setNewGenre("");
    setGenrePanelOpen(true);
  };

  const handleGenreSave = async () => {
    setGenreSaving(true);
    const r = await saveWorksMasterPreferences(genreDraft);
    setGenreSaving(false);
    if (!r.ok) {
      setActionError(r.message);
      return;
    }
    setWorkGenres(genreDraft);
    setGenrePanelOpen(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        작품정리 DB입니다. 여기서 추가·수정한 작품은 플랫폼 매트릭스·캘린더·관제실과 연동됩니다. 발표일 DB(플랫폼정리)와는 별도입니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="작품명·작가 검색"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={() => setGenreFilter("")}
          className={`rounded-full border px-3 py-1 text-xs ${
            genreFilter === ""
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
          }`}
        >
          전체 ({items.length})
        </button>
        {genreOptions.map((g) => {
          const count = items.filter((it) => getWorkGenre(it) === g).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGenreFilter(g)}
              className={`rounded-full border px-3 py-1 text-xs ${
                genreFilter === g
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
              }`}
            >
              {g} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          작품 추가
        </button>
        <button
          type="button"
          onClick={openGenrePanel}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900"
        >
          분류 관리
        </button>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={load.kind === "loading"}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900"
        >
          새로고침
        </button>
      </div>

      {actionError && !modalOpen && !genrePanelOpen ? (
        <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
      ) : null}

      {load.kind === "error" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {load.message}
        </p>
      ) : null}

      {load.kind === "loading" ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                {TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  편집
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const title = String(item["작품명"] ?? "").trim();
                return (
                  <tr
                    key={title}
                    className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                  >
                    {TABLE_COLUMNS.map((col) => (
                      <td
                        key={`${title}-${col.key}`}
                        className={`px-3 py-2 text-zinc-800 dark:text-zinc-200 ${col.wide ? "max-w-[14rem]" : ""}`}
                      >
                        <span className="block truncate" title={String(item[col.key] ?? "")}>
                          {col.key === WORK_GENRE_FIELD
                            ? getWorkGenre(item) || "—"
                            : String(item[col.key] ?? "").trim() || "—"}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-600"
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">표시할 작품이 없습니다.</p>
          ) : null}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {editTitle ? `작품 수정 · ${editTitle}` : "작품 추가"}
            </h3>
            <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {WORK_MATRIX_FIELDS.map(({ key, label }) => (
                <label key={key} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {label}
                  {key === WORK_GENRE_FIELD ? (
                    <>
                      <select
                        value={form[key] ?? ""}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">선택…</option>
                        {genreOptions.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={form[key] ?? ""}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder="직접 입력"
                        className={`${inputCls} mt-1`}
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      value={form[key] ?? ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className={inputCls}
                    />
                  )}
                </label>
              ))}
            </div>
            {actionError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setModalOpen(false);
                  setEditTitle(null);
                  setActionError(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                취소
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {genrePanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">분류 관리</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              분류 목록은 웹에 저장되어 플랫폼 매트릭스와 공유됩니다.
            </p>
            <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto">
              {genreDraft.map((g) => (
                <li key={g} className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700">
                  <span>{g}</span>
                  <button
                    type="button"
                    onClick={() => setGenreDraft((prev) => prev.filter((x) => x !== g))}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
                placeholder="새 분류"
                className="flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => {
                  const v = newGenre.trim();
                  if (!v || genreDraft.includes(v)) return;
                  setGenreDraft((prev) => [...prev, v]);
                  setNewGenre("");
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                추가
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={genreSaving}
                onClick={() => setGenrePanelOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              >
                취소
              </button>
              <button
                type="button"
                disabled={genreSaving}
                onClick={() => void handleGenreSave()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {genreSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
