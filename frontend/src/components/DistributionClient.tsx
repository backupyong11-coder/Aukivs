"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDistributionFromServer, saveDistributionToServer } from "@/lib/distributionApi";
import {
  createDefaultDistributionProfile,
  distributionNewId,
  loadDistributionProfile,
  overallProgress,
  platformProgress,
  saveDistributionProfile,
  stepProgress,
  syncStepDone,
  type DistributionCheckItem,
  type DistributionPlatform,
  type DistributionProfile,
  type DistributionStep,
  type ProgressStats,
} from "@/lib/distributionStorage";

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";

const inputCls =
  "w-full min-w-0 rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 dark:border-zinc-700 dark:bg-zinc-900";

function syncBanner(status: SyncStatus, message: string | null) {
  if (status === "loading") return "불러오는 중…";
  if (status === "saving") return "서버에 저장 중…";
  if (status === "synced") return "서버에 저장됨";
  if (status === "local") return message ?? "로컬만 저장됨";
  return message ?? "서버 저장 실패";
}

function ThinBar({ stats, className = "" }: { stats: ProgressStats; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <div className="h-1.5 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500"
          style={{ width: `${Math.max(stats.total === 0 ? 0 : 4, stats.percent)}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
        {stats.percent}%
      </span>
    </div>
  );
}

function Modal(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="dist-modal-title"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950 ${
          props.wide ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <h2 id="dist-modal-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
            {props.title}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            닫기
          </button>
        </div>
        <div className="p-4">{props.children}</div>
      </div>
    </div>
  );
}

function CheckListEditor(props: {
  title: string;
  accent: "amber" | "teal";
  items: DistributionCheckItem[];
  onChange: (items: DistributionCheckItem[]) => void;
}) {
  const head = props.accent === "amber" ? "text-amber-700" : "text-teal-700";

  function patch(id: string, partial: Partial<DistributionCheckItem>) {
    props.onChange(props.items.map((i) => (i.id === id ? { ...i, ...partial } : i)));
  }

  return (
    <div>
      <p className={`mb-2 text-xs font-bold ${head}`}>{props.title}</p>
      <ul className="space-y-1.5">
        {props.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done === true}
              onChange={(e) => patch(item.id, { done: e.target.checked })}
              className="h-4 w-4 shrink-0 rounded"
            />
            <input
              className={`min-w-0 flex-1 ${inputCls} ${item.done ? "line-through opacity-60" : ""}`}
              value={item.label}
              onChange={(e) => patch(item.id, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => props.onChange(props.items.filter((i) => i.id !== item.id))}
              className="text-xs text-red-500"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          props.onChange([
            ...props.items,
            { id: distributionNewId("dchk"), label: "새 항목", done: false },
          ])
        }
        className="mt-2 text-[11px] text-zinc-500 hover:underline"
      >
        + 항목 추가
      </button>
    </div>
  );
}

function PlatformInfoModal(props: {
  platform: DistributionPlatform;
  onChange: (next: DistributionPlatform) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { platform } = props;
  function patch(partial: Partial<DistributionPlatform>) {
    props.onChange({ ...platform, ...partial });
  }
  return (
    <Modal title={`${platform.platform} — 플랫폼 정보`} onClose={props.onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-zinc-500">플랫폼</span>
          <input className={inputCls} value={platform.platform} onChange={(e) => patch({ platform: e.target.value })} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-zinc-500">소통 방식</span>
          <input className={inputCls} value={platform.communication} onChange={(e) => patch({ communication: e.target.value })} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-zinc-500">사이트</span>
          <input className={inputCls} value={platform.site} onChange={(e) => patch({ site: e.target.value })} />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-zinc-500">유통 개요</span>
          <textarea className={inputCls} rows={4} value={platform.overview} onChange={(e) => patch({ overview: e.target.value })} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-zinc-500">아이디</span>
          <input className={inputCls} value={platform.loginId} onChange={(e) => patch({ loginId: e.target.value })} />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-zinc-500">비밀번호</span>
          <input className={inputCls} value={platform.loginPassword} onChange={(e) => patch({ loginPassword: e.target.value })} />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-zinc-500">참고</span>
          <input className={inputCls} value={platform.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </label>
      </div>
      <button type="button" onClick={props.onRemove} className="mt-4 text-xs text-red-600 hover:underline">
        플랫폼 삭제
      </button>
    </Modal>
  );
}

function StepDetailModal(props: {
  step: DistributionStep;
  index: number;
  onChange: (next: DistributionStep) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { step, index } = props;
  function patch(partial: Partial<DistributionStep>) {
    props.onChange(syncStepDone({ ...step, ...partial }));
  }
  return (
    <Modal title={`STEP ${index + 1} — ${step.title}`} onClose={props.onClose} wide>
      <label className="mb-3 block text-xs">
        <span className="mb-1 block text-zinc-500">단계 제목</span>
        <input className={inputCls} value={step.title} onChange={(e) => patch({ title: e.target.value })} />
      </label>
      <label className="mb-4 block text-xs">
        <span className="mb-1 block text-zinc-500">설명</span>
        <textarea className={inputCls} rows={2} value={step.summary} onChange={(e) => patch({ summary: e.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <CheckListEditor
          title="제반 (준비)"
          accent="amber"
          items={step.prerequisiteItems}
          onChange={(prerequisiteItems) => patch({ prerequisiteItems })}
        />
        <CheckListEditor
          title="수행 (실행)"
          accent="teal"
          items={step.actionItems}
          onChange={(actionItems) => patch({ actionItems })}
        />
      </div>
      <button type="button" onClick={props.onRemove} className="mt-4 text-xs text-red-600 hover:underline">
        단계 삭제
      </button>
    </Modal>
  );
}

function StepConnector({ filled }: { filled: boolean }) {
  return (
    <div className="flex w-8 shrink-0 items-center self-center px-0.5" aria-hidden>
      <div className={`h-1 flex-1 rounded-full ${filled ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />
      <span className={`mx-0.5 text-[10px] ${filled ? "text-emerald-500" : "text-zinc-300"}`}>▶</span>
    </div>
  );
}

function allStepItems(step: DistributionStep): { item: DistributionCheckItem; kind: "prep" | "action" }[] {
  return [
    ...step.prerequisiteItems.map((item) => ({ item, kind: "prep" as const })),
    ...step.actionItems.map((item) => ({ item, kind: "action" as const })),
  ];
}

function StepFlowCard(props: {
  step: DistributionStep;
  index: number;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
}) {
  const { step, index, selected, isCurrent } = props;
  const stats = stepProgress(step);
  const preview = allStepItems(step)
    .filter(({ item }) => !item.done)
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`flex w-[11.5rem] shrink-0 flex-col rounded-xl border text-left shadow-sm transition-all ${
        step.done
          ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30"
          : selected
            ? "border-teal-500 bg-teal-50 ring-2 ring-teal-400/40 dark:border-teal-600 dark:bg-teal-950/40"
            : isCurrent
              ? "border-teal-300 bg-white dark:border-teal-800 dark:bg-zinc-950"
              : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
      }`}
    >
      <div className="flex items-center gap-1.5 border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            step.done ? "bg-emerald-500 text-white" : isCurrent ? "bg-teal-500 text-white" : "bg-zinc-200 dark:bg-zinc-700"
          }`}
        >
          {index + 1}
        </span>
        <span className="line-clamp-2 flex-1 text-xs font-bold leading-tight text-zinc-900 dark:text-zinc-50">
          {step.title}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-400">{stats.percent}%</span>
      </div>
      <div className="space-y-1 px-2.5 py-2">
        {preview.length === 0 ? (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">완료</p>
        ) : (
          preview.map(({ item, kind }) => (
            <p key={item.id} className="flex items-start gap-1 text-[10px] leading-snug text-zinc-600 dark:text-zinc-300">
              <span className={`mt-0.5 shrink-0 ${kind === "prep" ? "text-amber-500" : "text-teal-500"}`}>●</span>
              <span className="line-clamp-2">{item.label}</span>
            </p>
          ))
        )}
        {allStepItems(step).filter(({ item }) => !item.done).length > 3 ? (
          <p className="text-[10px] text-zinc-400">+ 더 있음</p>
        ) : null}
      </div>
      <div className="mt-auto border-t border-zinc-100 px-2.5 py-1.5 dark:border-zinc-800">
        <span
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            props.onOpenDetail();
          }}
          className="text-[10px] font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          상세·편집
        </span>
      </div>
    </button>
  );
}

function StepQuickPanel(props: {
  step: DistributionStep;
  onChange: (next: DistributionStep) => void;
  onOpenDetail: () => void;
}) {
  const { step } = props;
  const items = allStepItems(step);

  function toggle(id: string, kind: "prep" | "action", done: boolean) {
    if (kind === "prep") {
      props.onChange(
        syncStepDone({
          ...step,
          prerequisiteItems: step.prerequisiteItems.map((i) => (i.id === id ? { ...i, done } : i)),
        }),
      );
    } else {
      props.onChange(
        syncStepDone({
          ...step,
          actionItems: step.actionItems.map((i) => (i.id === id ? { ...i, done } : i)),
        }),
      );
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{step.title}</p>
        <button
          type="button"
          onClick={props.onOpenDetail}
          className="text-[11px] font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          전체 항목·편집
        </button>
      </div>
      {step.summary ? (
        <p className="mb-2 line-clamp-2 text-xs text-zinc-500">{step.summary}</p>
      ) : null}
      <ul className="space-y-1">
        {items.map(({ item, kind }) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.done === true}
              onChange={(e) => toggle(item.id, kind, e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 rounded"
            />
            <span
              className={`shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase ${
                kind === "prep"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
              }`}
            >
              {kind === "prep" ? "준비" : "실행"}
            </span>
            <span className={`min-w-0 flex-1 text-xs ${item.done ? "line-through opacity-50" : "text-zinc-700 dark:text-zinc-200"}`}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlatformFlow(props: {
  platform: DistributionPlatform;
  onChange: (next: DistributionPlatform) => void;
  onRemove: () => void;
}) {
  const { platform } = props;
  const sortedSteps = useMemo(
    () => [...platform.steps].sort((a, b) => a.order - b.order),
    [platform.steps],
  );
  const currentStepId = sortedSteps.find((s) => !s.done)?.id ?? sortedSteps[sortedSteps.length - 1]?.id ?? null;
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [detailStepId, setDetailStepId] = useState<string | null>(null);

  const activeStepId = selectedStepId ?? currentStepId;
  const activeStep = sortedSteps.find((s) => s.id === activeStepId);
  const stats = platformProgress(platform);

  useEffect(() => {
    setSelectedStepId(null);
  }, [platform.id]);

  function patch(partial: Partial<DistributionPlatform>) {
    props.onChange({ ...platform, ...partial });
  }

  function patchStep(stepId: string, next: DistributionStep) {
    patch({
      steps: platform.steps.map((s) => (s.id === stepId ? syncStepDone(next) : s)),
    });
  }

  function addStep() {
    const id = distributionNewId("dstep");
    patch({
      steps: [
        ...platform.steps,
        syncStepDone({
          id,
          order: platform.steps.length + 1,
          title: "새 단계",
          summary: "",
          prerequisiteItems: [],
          actionItems: [{ id: distributionNewId("dchk"), label: "수행 항목", done: false }],
          done: false,
        }),
      ],
    });
    setSelectedStepId(id);
  }

  const detailStep = detailStepId ? sortedSteps.find((s) => s.id === detailStepId) : null;
  const detailIndex = detailStep ? sortedSteps.findIndex((s) => s.id === detailStep.id) : -1;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{platform.platform}</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {platform.communication || "소통 방식 미입력"}
            </span>
          </div>
          <ThinBar stats={stats} className="mt-1 max-w-xs" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            플랫폼 정보
          </button>
          <button
            type="button"
            onClick={addStep}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            + 단계
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-0 px-0.5 py-1">
          {sortedSteps.map((s, i) => (
            <div key={s.id} className="flex items-stretch">
              <StepFlowCard
                step={s}
                index={i}
                selected={s.id === activeStepId}
                isCurrent={s.id === currentStepId}
                onSelect={() => setSelectedStepId(s.id)}
                onOpenDetail={() => setDetailStepId(s.id)}
              />
              {i < sortedSteps.length - 1 ? (
                <StepConnector filled={s.done === true} />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {activeStep ? (
        <div className="mt-3">
          <StepQuickPanel
            step={activeStep}
            onChange={(next) => patchStep(activeStep.id, next)}
            onOpenDetail={() => setDetailStepId(activeStep.id)}
          />
        </div>
      ) : null}

      {infoOpen ? (
        <PlatformInfoModal
          platform={platform}
          onChange={props.onChange}
          onClose={() => setInfoOpen(false)}
          onRemove={() => {
            setInfoOpen(false);
            props.onRemove();
          }}
        />
      ) : null}

      {detailStep && detailIndex >= 0 ? (
        <StepDetailModal
          step={detailStep}
          index={detailIndex}
          onChange={(next) => patchStep(detailStep.id, next)}
          onClose={() => setDetailStepId(null)}
          onRemove={() => {
            patch({
              steps: platform.steps
                .filter((x) => x.id !== detailStep.id)
                .map((x, j) => ({ ...x, order: j + 1 })),
            });
            setDetailStepId(null);
            setSelectedStepId(null);
          }}
        />
      ) : null}
    </>
  );
}

export function DistributionClient() {
  const [profile, setProfile] = useState<DistributionProfile>(() => createDefaultDistributionProfile());
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activePlatformId, setActivePlatformId] = useState<string | null>(null);

  const sortedPlatforms = useMemo(
    () => [...profile.platforms].sort((a, b) => a.order - b.order),
    [profile.platforms],
  );
  const totalStats = useMemo(() => overallProgress(profile.platforms), [profile.platforms]);

  useEffect(() => {
    if (activePlatformId == null && sortedPlatforms.length > 0) {
      setActivePlatformId(sortedPlatforms[0].id);
    }
  }, [activePlatformId, sortedPlatforms]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const server = await fetchDistributionFromServer();
      if (cancelled) return;
      if (server.ok && server.profile) {
        setProfile(server.profile);
        saveDistributionProfile(server.profile);
        setSyncStatus("synced");
        setHydrated(true);
        return;
      }
      const local = loadDistributionProfile();
      setProfile(local);
      saveDistributionProfile(local);
      if (server.ok && server.profile == null) {
        const saved = await saveDistributionToServer(local);
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
    saveDistributionProfile(profile);
    const t = window.setTimeout(() => {
      void (async () => {
        setSyncStatus((prev) => (prev === "error" ? "error" : "saving"));
        const result = await saveDistributionToServer(profile);
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

  const activePlatform = sortedPlatforms.find((p) => p.id === activePlatformId) ?? sortedPlatforms[0];

  const updatePlatform = useCallback((platformId: string, next: DistributionPlatform) => {
    setProfile((p) => ({
      ...p,
      platforms: p.platforms.map((pl) => (pl.id === platformId ? next : pl)),
    }));
  }, []);

  const addPlatform = useCallback(() => {
    const id = distributionNewId("dplat");
    setProfile((p) => ({
      ...p,
      platforms: [
        ...p.platforms,
        {
          id,
          order: p.platforms.length + 1,
          platform: "새 플랫폼",
          communication: "",
          overview: "",
          site: "",
          loginId: "",
          loginPassword: "",
          notes: "",
          steps: [
            syncStepDone({
              id: distributionNewId("dstep"),
              order: 1,
              title: "1단계",
              summary: "",
              prerequisiteItems: [{ id: distributionNewId("dchk"), label: "준비 항목", done: false }],
              actionItems: [{ id: distributionNewId("dchk"), label: "수행 항목", done: false }],
              done: false,
            }),
          ],
        },
      ],
    }));
    setActivePlatformId(id);
  }, []);

  const removePlatform = useCallback((platformId: string) => {
    setProfile((p) => ({
      ...p,
      platforms: p.platforms.filter((pl) => pl.id !== platformId).map((pl, i) => ({ ...pl, order: i + 1 })),
    }));
    setActivePlatformId((id) => (id === platformId ? null : id));
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            className="w-full bg-transparent text-xl font-bold tracking-tight text-zinc-900 outline-none dark:text-zinc-50"
            value={profile.title}
            onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
          />
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <ThinBar stats={totalStats} className="max-w-[12rem]" />
            <span className="text-[11px] text-zinc-500">
              전체 {totalStats.done}/{totalStats.total}
            </span>
          </div>
        </div>
        <p
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            syncStatus === "error"
              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              : syncStatus === "synced"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {syncBanner(syncStatus, syncMessage)}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {sortedPlatforms.map((pl) => {
          const ps = platformProgress(pl);
          const active = pl.id === activePlatform?.id;
          return (
            <button
              key={pl.id}
              type="button"
              onClick={() => setActivePlatformId(pl.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
              }`}
            >
              {pl.platform}
              <span className="ml-1 opacity-75">{ps.percent}%</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={addPlatform}
          className="rounded-full border border-dashed border-zinc-400 px-2.5 py-1 text-xs text-zinc-500 hover:border-zinc-600"
        >
          + 플랫폼
        </button>
      </div>

      {activePlatform ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
          <PlatformFlow
            key={activePlatform.id}
            platform={activePlatform}
            onChange={(next) => updatePlatform(activePlatform.id, next)}
            onRemove={() => removePlatform(activePlatform.id)}
          />
        </section>
      ) : null}
    </div>
  );
}
