"use client";

import { useEffect, useState } from "react";
import { fetchPlatformMaster } from "@/lib/platformMaster";
import { fetchWorksMaster } from "@/lib/worksMaster";
import { buildPlatformWorkMatrix, type MatrixCellKind } from "@/lib/platformWorkMatrix";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; emptyHint: string };

function MatrixIcon({ kind }: { kind: MatrixCellKind }) {
  if (kind === "active") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm"
        title="런칭·연재 중"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (kind === "progress") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm"
        title="업로드·세팅 진행"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.06-.68-1.66-.87l-.36-2.54c-.04-.24-.25-.41-.5-.41h-3.84c-.24 0-.45.17-.49.41l-.36 2.54c-.6.19-1.16.49-1.66.87l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.06.68 1.66.87l.36 2.54c.05.24.25.41.5.41h3.84c.24 0 .45-.17.49-.41l.36-2.54c.6-.19 1.16-.49 1.66-.87l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
      </span>
    );
  }
  if (kind === "early") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-300 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200"
        title="대기·계약 단계"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return <span className="inline-block h-7 w-7" aria-hidden />;
}

export function PlatformWorkMatrixClient() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  const [model, setModel] = useState<ReturnType<typeof buildPlatformWorkMatrix> | null>(null);

  useEffect(() => {
    void (async () => {
      setLoad({ kind: "loading" });
      try {
        const [wm, pm] = await Promise.all([fetchWorksMaster(), fetchPlatformMaster()]);
        if (!wm.ok && !pm.ok) {
          setLoad({ kind: "error", message: "작품정리·플랫폼정리를 불러오지 못했습니다." });
          setModel(null);
          return;
        }
        const m = buildPlatformWorkMatrix(
          wm.ok ? wm.items : [],
          pm.ok ? pm.items : [],
        );
        let emptyHint = "";
        if (m.columns.length === 0) {
          emptyHint = "플랫폼 열이 없습니다. 플랫폼정리에 플랫폼명(또는 회사명)이 있는지 확인하세요.";
        } else if (m.rows.length === 0) {
          emptyHint = "작품 행이 없습니다. 작품정리에 작품명이 있는지 확인하세요.";
        }
        setModel(m);
        setLoad({ kind: "ready", emptyHint });
      } catch (e) {
        setModel(null);
        setLoad({
          kind: "error",
          message: e instanceof Error ? e.message : "불러오기 실패",
        });
      }
    })();
  }, [refreshKey]);

  const colCount = model?.columns.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          작품정리의「런칭·연재·업로드·대기·계약」열과 플랫폼명을 매칭합니다. 표기 방식이 다르면 셀이 비어 보일 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={load.kind === "loading"}
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {load.kind === "loading" ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <MatrixIcon kind="active" />
          런칭·연재
        </span>
        <span className="inline-flex items-center gap-2">
          <MatrixIcon kind="progress" />
          업로드·세팅
        </span>
        <span className="inline-flex items-center gap-2">
          <MatrixIcon kind="early" />
          대기·계약
        </span>
      </div>

      {load.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {load.message}
        </div>
      )}

      {load.kind === "loading" && (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          매트릭스 구성 중…
        </div>
      )}

      {load.kind === "ready" && model && colCount > 0 && model.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="sticky left-0 z-20 min-w-[10rem] border-r border-zinc-200 bg-zinc-100 px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  작품명
                </th>
                {model.columns.map((c) => (
                  <th
                    key={c.label}
                    className="min-w-[5.5rem] border-l border-zinc-200 px-2 py-3 text-center text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row, ri) => (
                <tr
                  key={`${ri}-${row.title}`}
                  className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2.5 text-left font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  >
                    {row.title}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={`${row.title}-${model.columns[i]?.label ?? i}`}
                      className="border-l border-zinc-100 px-2 py-2 text-center align-middle dark:border-zinc-800"
                    >
                      <div className="flex justify-center">
                        <MatrixIcon kind={cell} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 bg-zinc-50/90 dark:border-zinc-600 dark:bg-zinc-900/80">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  플랫폼 메모
                </th>
                {model.columns.map((c) => (
                  <td
                    key={`foot-${c.label}`}
                    className="max-w-[14rem] border-l border-zinc-200 px-2 py-3 align-top text-left text-[11px] leading-snug text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    {c.footerNote ? c.footerNote : "—"}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {load.kind === "ready" && load.emptyHint && (
        <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {load.emptyHint}
        </p>
      )}
    </div>
  );
}
