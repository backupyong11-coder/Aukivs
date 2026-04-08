"use client";

import {
  UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON,
  type UploadSuggestResponse,
} from "@/lib/uploads";
import {
  canUseAiDeleteButton,
  canUseAiNextEpisodeButton,
  uploadIdIsListed,
} from "@/lib/uploadsAiJump";

const AI_SUGGEST_JUMP_FALLBACK_TITLE =
  "동일 id가 여러 행입니다. 특정 카드로 가지 않고 아래 업로드 목록 구역으로만 이동합니다.";

type Props = {
  busy: boolean;
  aiMode: "prioritize" | "review";
  onAiModeChange: (m: "prioritize" | "review") => void;
  aiPrompt: string;
  setAiPrompt: (s: string) => void;
  aiLoading: boolean;
  aiError: string | null;
  aiResult: UploadSuggestResponse | null;
  onSuggest: () => void;
  clearUploadHighlight: () => void;
  uploadIdsOnPage: ReadonlySet<string>;
  duplicateIdSet: ReadonlySet<string>;
  jumpToUploadFromAiSuggestion: (uploadId: string) => void;
  openEditByUploadId: (uploadId: string) => void;
  handleNextEpisodeByUploadId: (uploadId: string) => void;
  handleDeleteByUploadId: (uploadId: string) => void;
  advancingId: string | null;
  deletingId: string | null;
  aiCanMutateUploadId: (uploadId: string) => boolean;
};

export function UploadsAiAssistantPanel(props: Props) {
  const {
    busy,
    aiMode,
    onAiModeChange,
    aiPrompt,
    setAiPrompt,
    aiLoading,
    aiError,
    aiResult,
    onSuggest,
    clearUploadHighlight,
    uploadIdsOnPage,
    duplicateIdSet,
    jumpToUploadFromAiSuggestion,
    openEditByUploadId,
    handleNextEpisodeByUploadId,
    handleDeleteByUploadId,
    advancingId,
    deletingId,
    aiCanMutateUploadId,
  } = props;

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4"
      aria-label="보조 AI 추천"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        보조 · AI 추천
      </h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        홈 질문이 본류입니다. 여기는 시트 목록을 바탕으로 한 참고 제안이며 시트에 자동
        반영하지 않습니다.
      </p>
      <fieldset className="mt-3 space-y-2 border-0 p-0">
        <legend className="sr-only">AI 모드</legend>
        <div className="flex flex-wrap gap-4 text-xs text-zinc-800 dark:text-zinc-200">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="uploads-ai-mode"
              checked={aiMode === "prioritize"}
              onChange={() => {
                clearUploadHighlight();
                onAiModeChange("prioritize");
              }}
              disabled={busy}
              className="accent-zinc-700"
            />
            우선 처리 추천
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="uploads-ai-mode"
              checked={aiMode === "review"}
              onChange={() => {
                clearUploadHighlight();
                onAiModeChange("review");
              }}
              disabled={busy}
              className="accent-zinc-700"
            />
            운영 검토
          </label>
        </div>
      </fieldset>
      <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        추가 요청 (선택)
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={busy}
          placeholder="예: 오늘 안에 끝낼 것만"
          className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
      <div className="mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onSuggest}
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {aiLoading ? "분석 중…" : "추천 받기"}
        </button>
      </div>
      {aiError ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {aiError}
        </p>
      ) : null}
      {aiResult ? (
        <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            요약
          </p>
          <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {aiResult.summary}
          </p>
          {aiResult.items.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              제안 항목이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {aiResult.mode === "prioritize"
                ? aiResult.items.map((it, idx) => (
                    <li
                      key={`${it.id}-p-${idx}`}
                      className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          #{it.priority}
                        </span>{" "}
                        {it.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        id: {it.id}
                      </p>
                      <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                        이유: {it.reason}
                      </p>
                      <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                        제안: {it.suggested_action}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!uploadIdIsListed(it.id, uploadIdsOnPage)}
                          title={
                            uploadIdIsListed(it.id, uploadIdsOnPage) &&
                            duplicateIdSet.has(it.id)
                              ? AI_SUGGEST_JUMP_FALLBACK_TITLE
                              : undefined
                          }
                          onClick={() => jumpToUploadFromAiSuggestion(it.id)}
                          className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          {duplicateIdSet.has(it.id)
                            ? "목록 구역으로 이동"
                            : "해당 항목 보기"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || !aiCanMutateUploadId(it.id)}
                          title={
                            duplicateIdSet.has(it.id)
                              ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON
                              : undefined
                          }
                          onClick={() => openEditByUploadId(it.id)}
                          className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          수정 열기
                        </button>
                        <button
                          type="button"
                          disabled={
                            !canUseAiNextEpisodeButton(
                              busy,
                              aiCanMutateUploadId(it.id),
                            )
                          }
                          title={
                            duplicateIdSet.has(it.id)
                              ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON
                              : undefined
                          }
                          onClick={() => handleNextEpisodeByUploadId(it.id)}
                          className="rounded-md border border-emerald-600/40 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-100"
                        >
                          {advancingId === it.id ? "처리 중…" : "다음 회차"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            !canUseAiDeleteButton(busy, aiCanMutateUploadId(it.id))
                          }
                          title={
                            duplicateIdSet.has(it.id)
                              ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON
                              : undefined
                          }
                          onClick={() => handleDeleteByUploadId(it.id)}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
                        >
                          {deletingId === it.id ? "삭제 중…" : "삭제"}
                        </button>
                        {!uploadIdIsListed(it.id, uploadIdsOnPage) ? (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            현재 화면 목록에 없습니다.
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))
                : aiResult.items.map((it, idx) => (
                    <li
                      key={`${it.id}-review-${idx}`}
                      className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {it.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        id: {it.id}
                      </p>
                      <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                        점검: {it.issue}
                      </p>
                      <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                        제안: {it.suggestion}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!uploadIdIsListed(it.id, uploadIdsOnPage)}
                          title={
                            uploadIdIsListed(it.id, uploadIdsOnPage) &&
                            duplicateIdSet.has(it.id)
                              ? AI_SUGGEST_JUMP_FALLBACK_TITLE
                              : undefined
                          }
                          onClick={() => jumpToUploadFromAiSuggestion(it.id)}
                          className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          {duplicateIdSet.has(it.id)
                            ? "목록 구역으로 이동"
                            : "해당 항목 보기"}
                        </button>
                        <button
                          type="button"
                          disabled={busy || !aiCanMutateUploadId(it.id)}
                          title={
                            duplicateIdSet.has(it.id)
                              ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON
                              : undefined
                          }
                          onClick={() => openEditByUploadId(it.id)}
                          className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          수정 열기
                        </button>
                        <button
                          type="button"
                          disabled={
                            !canUseAiNextEpisodeButton(
                              busy,
                              aiCanMutateUploadId(it.id),
                            )
                          }
                          title={
                            duplicateIdSet.has(it.id)
                              ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON
                              : undefined
                          }
                          onClick={() => handleNextEpisodeByUploadId(it.id)}
                          className="rounded-md border border-emerald-600/40 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-100"
                        >
                          {advancingId === it.id ? "처리 중…" : "다음 회차"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            !canUseAiDeleteButton(busy, aiCanMutateUploadId(it.id))
                          }
                          title={
                            duplicateIdSet.has(it.id)
                              ? UPLOAD_DUPLICATE_ID_ACTION_DISABLED_REASON
                              : undefined
                          }
                          onClick={() => handleDeleteByUploadId(it.id)}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
                        >
                          {deletingId === it.id ? "삭제 중…" : "삭제"}
                        </button>
                      </div>
                    </li>
                  ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
