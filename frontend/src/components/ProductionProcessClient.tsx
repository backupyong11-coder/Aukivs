"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TableRowDragHandle } from "@/components/TableRowDragHandle";
import {
  fetchProductionProcessFromServer,
  saveProductionProcessToServer,
} from "@/lib/productionProcessApi";
import {
  createDefaultProductionProcessProfile,
  getActivePipeline,
  loadProductionProcessProfile,
  pipelineProgress,
  productionProcessNewId,
  reorderSteps,
  saveProductionProcessProfile,
  type ProductionPipeline,
  type ProductionProcessProfile,
  type ProductionStep,
} from "@/lib/productionProcessStorage";

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";

const inputCls =
  "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-400/40 dark:focus:border-zinc-600 dark:focus:bg-zinc-900";

function syncBanner(status: SyncStatus, message: string | null) {
  if (status === "loading") return "불러오는 중…";
  if (status === "saving") return "서버에 저장 중…";
  if (status === "synced") return "서버에 저장됨";
  if (status === "local") return message ?? "로컬만 저장됨";
  return message ?? "서버 저장 실패";
}

function StepConnector({ filled }: { filled: boolean }) {
  return (
    <div className="flex w-10 shrink-0 items-center self-center px-0.5" aria-hidden>
      <div
        className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
          filled
            ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
            : "bg-zinc-200 dark:bg-zinc-700"
        }`}
      />
      <span
        className={`mx-0.5 text-xs ${filled ? "text-emerald-500" : "text-zinc-300 dark:text-zinc-600"}`}
      >
        ▶
      </span>
    </div>
  );
}

function StepCard(props: {
  step: ProductionStep;
  index: number;
  isCurrent: boolean;
  dragActive: boolean;
  onChange: (next: ProductionStep) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dropHighlight: boolean;
}) {
  const { step, index, isCurrent } = props;

  function patch(partial: Partial<ProductionStep>) {
    props.onChange({ ...step, ...partial });
  }

  return (
    <article
      className={`relative flex w-[15.5rem] shrink-0 flex-col rounded-xl border shadow-sm transition-all duration-300 ${
        step.done
          ? "border-emerald-300/80 bg-gradient-to-b from-emerald-50/90 to-white dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-zinc-950"
          : isCurrent
            ? "border-indigo-400 bg-gradient-to-b from-indigo-50/90 to-white ring-2 ring-indigo-400/40 dark:border-indigo-700 dark:from-indigo-950/40 dark:to-zinc-950"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
      } ${props.dropHighlight ? "outline outline-2 outline-indigo-400" : ""} ${props.dragActive ? "opacity-60" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        props.onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop();
      }}
    >
      <div className="flex items-center justify-between gap-1 border-b border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
        <div className="flex items-center gap-1">
          <TableRowDragHandle
            sourceProps={{
              draggable: true,
              onDragStart: (e) => {
                e.stopPropagation();
                props.onDragStart();
              },
              onDragEnd: props.onDragEnd,
            }}
            active={props.dragActive}
          />
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
              step.done
                ? "bg-emerald-500 text-white"
                : isCurrent
                  ? "bg-indigo-500 text-white"
                  : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
            }`}
          >
            {index + 1}
          </span>
          <input
            type="text"
            value={step.phase}
            onChange={(e) => patch({ phase: e.target.value })}
            className="max-w-[5.5rem] truncate text-[10px] font-semibold text-violet-700 outline-none dark:text-violet-300"
            title="단계"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={step.done}
            onChange={(e) => patch({ done: e.target.checked })}
            className="h-4 w-4 accent-emerald-600"
          />
          완료
        </label>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <input
          type="text"
          value={step.task}
          onChange={(e) => patch({ task: e.target.value })}
          className={`${inputCls} font-semibold text-zinc-900 dark:text-zinc-50`}
          placeholder="작업명"
        />
        <textarea
          value={step.detail}
          onChange={(e) => patch({ detail: e.target.value })}
          rows={3}
          className={`${inputCls} resize-y text-xs leading-snug text-zinc-600 dark:text-zinc-300`}
          placeholder="상세 내용"
        />
        <div className="space-y-1 text-[11px]">
          <label className="block text-zinc-400">담당</label>
          <input
            type="text"
            value={step.assignee}
            onChange={(e) => patch({ assignee: e.target.value })}
            className={inputCls}
          />
          <label className="block text-zinc-400">산출물</label>
          <input
            type="text"
            value={step.deliverable}
            onChange={(e) => patch({ deliverable: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div className="border-t border-zinc-100 px-2 py-1 text-right dark:border-zinc-800">
        <button
          type="button"
          onClick={props.onRemove}
          className="text-[10px] text-red-600 underline dark:text-red-400"
        >
          삭제
        </button>
      </div>
    </article>
  );
}

export function ProductionProcessClient() {
  const [profile, setProfile] = useState<ProductionProcessProfile>(() =>
    createDefaultProductionProcessProfile(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [dragStepId, setDragStepId] = useState<string | null>(null);
  const [overStepId, setOverStepId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const server = await fetchProductionProcessFromServer();
      if (cancelled) return;
      if (server.ok && server.profile) {
        setProfile(server.profile);
        saveProductionProcessProfile(server.profile);
        setSyncStatus("synced");
        setHydrated(true);
        return;
      }
      const local = loadProductionProcessProfile();
      setProfile(local);
      saveProductionProcessProfile(local);
      if (server.ok && server.profile == null) {
        const saved = await saveProductionProcessToServer(local);
        if (cancelled) return;
        setSyncStatus(saved.ok ? "synced" : "local");
        setSyncMessage(saved.ok ? "초기 데이터를 서버에 올렸습니다." : saved.message);
      } else {
        setSyncStatus(server.ok ? "local" : "error");
        setSyncMessage(server.ok ? "서버에 문서가 없어 로컬을 열었습니다." : server.message);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveProductionProcessProfile(profile);
    const t = window.setTimeout(() => {
      void (async () => {
        setSyncStatus((prev) => (prev === "error" ? "error" : "saving"));
        const result = await saveProductionProcessToServer(profile);
        if (result.ok) {
          setSyncStatus("synced");
          setSyncMessage(null);
        } else {
          setSyncStatus("error");
          setSyncMessage(result.message);
        }
      })();
    }, 700);
    return () => window.clearTimeout(t);
  }, [profile, hydrated]);

  const activePipeline = useMemo(() => getActivePipeline(profile), [profile]);
  const sortedSteps = useMemo(
    () => [...activePipeline.steps].sort((a, b) => a.order - b.order),
    [activePipeline.steps],
  );
  const progress = useMemo(() => pipelineProgress(sortedSteps), [sortedSteps]);
  const currentStepId = sortedSteps.find((s) => !s.done)?.id ?? null;

  const updatePipeline = useCallback(
    (pipelineId: string, patchFn: (pipe: ProductionPipeline) => ProductionPipeline) => {
      setProfile((p) => ({
        ...p,
        pipelines: p.pipelines.map((pl) => (pl.id === pipelineId ? patchFn(pl) : pl)),
      }));
    },
    [],
  );

  const handleStepDrop = useCallback(
    (targetId: string) => {
      if (!dragStepId || dragStepId === targetId) {
        setDragStepId(null);
        setOverStepId(null);
        return;
      }
      updatePipeline(activePipeline.id, (pl) => ({
        ...pl,
        steps: reorderSteps(pl.steps, dragStepId, targetId),
      }));
      setDragStepId(null);
      setOverStepId(null);
    },
    [activePipeline.id, dragStepId, updatePipeline],
  );

  const addStep = useCallback(() => {
    updatePipeline(activePipeline.id, (pl) => ({
      ...pl,
      steps: [
        ...pl.steps,
        {
          id: productionProcessNewId("step"),
          order: pl.steps.length + 1,
          phase: "새 단계",
          task: "새 작업",
          detail: "",
          assignee: "",
          deliverable: "",
          done: false,
        },
      ],
    }));
  }, [activePipeline.id, updatePipeline]);

  const addPipeline = useCallback(() => {
    const id = productionProcessNewId("pipe");
    setProfile((p) => ({
      ...p,
      activePipelineId: id,
      pipelines: [
        ...p.pipelines,
        {
          id,
          name: "새 제작 공정",
          steps: [
            {
              id: productionProcessNewId("step"),
              order: 1,
              phase: "1단계",
              task: "새 작업",
              detail: "",
              assignee: "",
              deliverable: "",
              done: false,
            },
          ],
        },
      ],
    }));
  }, []);

  const resetDefaults = useCallback(() => {
    if (!window.confirm("엑셀 기준 초기 데이터(AI 성인웹툰 제작)로 되돌릴까요?")) return;
    setProfile(createDefaultProductionProcessProfile());
  }, []);

  const bannerCls =
    syncStatus === "error"
      ? "text-red-600 dark:text-red-400"
      : syncStatus === "synced"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-zinc-500 dark:text-zinc-400";

  if (!hydrated) {
    return <p className="py-12 text-center text-sm text-zinc-500">제작공정을 불러오는 중…</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">서버 동기화</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {profile.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            공정을 가로로 진행하며 단계별 완료 체크 · ⋮⋮ 드래그로 순서 변경 · 내용 즉시 편집
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-xs ${bannerCls}`}>{syncBanner(syncStatus, syncMessage)}</span>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={resetDefaults}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={addPipeline}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
            >
              + 제작 종류
            </button>
            <button
              type="button"
              onClick={addStep}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              + 공정 단계
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900">
        {profile.pipelines.map((pl) => {
          const p = pipelineProgress(pl.steps);
          return (
            <button
              key={pl.id}
              type="button"
              onClick={() => setProfile((prev) => ({ ...prev, activePipelineId: pl.id }))}
              className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                pl.id === profile.activePipelineId
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
              }`}
            >
              <span className="font-medium">{pl.name}</span>
              <span className="ml-2 text-[11px] tabular-nums text-zinc-500">
                {p.percent}%
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <input
              type="text"
              value={activePipeline.name}
              onChange={(e) =>
                updatePipeline(activePipeline.id, (pl) => ({ ...pl, name: e.target.value }))
              }
              className="border-0 bg-transparent text-lg font-bold text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-400/40 dark:text-zinc-50"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {progress.done}/{progress.total} 단계 완료 ·{" "}
              {currentStepId ? "다음 단계가 강조됩니다" : "모든 공정 완료 🎉"}
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {progress.percent}%
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progress.percent, progress.total > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        {sortedSteps.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">공정 단계가 없습니다.</p>
        ) : (
          <div className="flex min-w-max items-stretch">
            {sortedSteps.map((step, idx) => (
              <div key={step.id} className="flex items-stretch">
                <StepCard
                  step={step}
                  index={idx}
                  isCurrent={step.id === currentStepId}
                  dragActive={dragStepId === step.id}
                  dropHighlight={overStepId === step.id && dragStepId !== step.id}
                  onChange={(next) =>
                    updatePipeline(activePipeline.id, (pl) => ({
                      ...pl,
                      steps: pl.steps.map((s) => (s.id === step.id ? next : s)),
                    }))
                  }
                  onRemove={() => {
                    if (!window.confirm(`「${step.task}」 단계를 삭제할까요?`)) return;
                    updatePipeline(activePipeline.id, (pl) => ({
                      ...pl,
                      steps: pl.steps
                        .filter((s) => s.id !== step.id)
                        .map((s, i) => ({ ...s, order: i + 1 })),
                    }));
                  }}
                  onDragStart={() => setDragStepId(step.id)}
                  onDragEnd={() => {
                    setDragStepId(null);
                    setOverStepId(null);
                  }}
                  onDragOver={() => {
                    if (dragStepId) setOverStepId(step.id);
                  }}
                  onDrop={() => handleStepDrop(step.id)}
                />
                {idx < sortedSteps.length - 1 ? (
                  <StepConnector filled={step.done} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
