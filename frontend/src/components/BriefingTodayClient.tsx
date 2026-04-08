"use client";

import { useEffect, useState } from "react";
import {
  fetchBriefingToday,
  type BriefingTodayPayload,
} from "@/lib/briefing";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: BriefingTodayPayload };

const statLabels: {
  key: keyof BriefingTodayPayload["summary"];
  label: string;
}[] = [
  { key: "today_checklist_count", label: "오늘 체크리스트" },
  { key: "overdue_checklist_count", label: "지연·주의 체크" },
  { key: "today_upload_count", label: "오늘 업로드" },
  { key: "overdue_upload_count", label: "이전 업로드(후속)" },
];

export function BriefingTodayClient() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setState({ kind: "loading" });
      try {
        const result = await fetchBriefingToday({ signal: ac.signal });
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: "error", message: result.message });
          return;
        }
        setState({ kind: "ready", data: result.payload });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            e instanceof Error
              ? e.message
              : "브리핑을 불러오는 중 오류가 발생했습니다.",
        });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div
        className="mb-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 py-12 dark:border-zinc-700 dark:bg-zinc-900/40"
        role="status"
        aria-live="polite"
      >
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200"
          aria-hidden
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          오늘 브리핑 불러오는 중…
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40"
        role="alert"
      >
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          브리핑을 불러오지 못했습니다
        </p>
        <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
          {state.message}
        </p>
      </div>
    );
  }

  const { data } = state;

  return (
    <div id="today-briefing" className="mb-6 scroll-mt-4 space-y-4">
      {data.warnings.length > 0 ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/35"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            일부 항목이 집계에서 제외되었습니다
          </p>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/85">
            시트를 정리하면 아래 항목이 다시 포함됩니다.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-900/95 dark:text-amber-100/90">
            {data.warnings.map((w, i) => (
              <li key={`briefing-warn-${i}`}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section
        aria-labelledby="briefing-text-heading"
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="briefing-text-heading"
          className="text-sm font-medium text-zinc-500 dark:text-zinc-400"
        >
          오늘 브리핑
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {data.briefing_text}
        </p>
      </section>

      <section aria-labelledby="briefing-stats-heading">
        <h2
          id="briefing-stats-heading"
          className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400"
        >
          요약 숫자
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statLabels.map(({ key, label }) => (
            <li key={key}>
              <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {label}
                </span>
                <span className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {data.summary[key]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="briefing-urgent-heading"
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="briefing-urgent-heading"
          className="text-sm font-medium text-zinc-500 dark:text-zinc-400"
        >
          긴급 후보
        </h2>
        {data.urgent_items.length === 0 ? (
          <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {data.warnings.length > 0 ? (
              <>
                <p className="font-medium text-zinc-700 dark:text-zinc-300">
                  표시 가능한 긴급 후보는 없지만, 일부 시트 행은 집계에서 제외되었습니다.
                </p>
                <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
                  위 노란 상자의 경고를 확인하세요. 데이터가 비어 있는 것이 아니라 필수 열 누락 등으로
                  빠진 경우입니다. 시트를 고치면 요약 숫자와 후보 목록에 다시 반영됩니다.
                </p>
              </>
            ) : (
              <p>지금은 표시할 긴급 항목이 없습니다.</p>
            )}
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.urgent_items.map((item, i) => (
              <li
                key={item.uid}
                className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      item.source === "checklist"
                        ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                        : "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200"
                    }`}
                  >
                    {item.source === "checklist" ? "체크" : "업로드"}
                  </span>
                  <p className="mt-1 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-50">
                    {item.title}
                  </p>
                  {item.note ? (
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{item.note}</p>
                  ) : null}
                  {item.uploaded_at ? (
                    <p className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-500">
                      {item.uploaded_at}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
