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
  "w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-zinc-400/40 dark:focus:border-zinc-600 dark:focus:bg-zinc-900";

const textareaCls =
  "w-full min-w-0 rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30 dark:border-zinc-700 dark:bg-zinc-900";

function syncBanner(status: SyncStatus, message: string | null) {
  if (status === "loading") return "불러오는 중…";
  if (status === "saving") return "서버에 저장 중…";
  if (status === "synced") return "서버에 저장됨";
  if (status === "local") return message ?? "로컬만 저장됨";
  return message ?? "서버 저장 실패";
}

function ProgressBar(props: {
  stats: ProgressStats;
  label?: string;
  size?: "sm" | "md" | "lg";
  accent?: "teal" | "indigo";
}) {
  const { stats, label, size = "md", accent = "teal" } = props;
  const h = size === "sm" ? "h-2" : size === "lg" ? "h-4" : "h-3";
  const fill =
    accent === "teal"
      ? "bg-gradient-to-r from-teal-400 to-emerald-500"
      : "bg-gradient-to-r from-indigo-400 to-violet-500";
  return (
    <div className="min-w-0 flex-1">
      {label ? (
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
          <span className="tabular-nums text-zinc-500">
            {stats.percent}% ({stats.done}/{stats.total})
          </span>
        </div>
      ) : null}
      <div className={`overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 ${h}`}>
        <div
          className={`${h} rounded-full transition-all duration-500 ${fill}`}
          style={{ width: `${Math.max(stats.total === 0 ? 0 : 4, stats.percent)}%` }}
        />
      </div>
    </div>
  );
}

function ProgressRing({ stats, size = 88 }: { stats: ProgressStats; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (stats.percent / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-zinc-100 dark:text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#distGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient id="distGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{stats.percent}%</span>
        <span className="text-[10px] text-zinc-500">
          {stats.done}/{stats.total}
        </span>
      </div>
    </div>
  );
}

function CheckList(props: {
  title: string;
  accent: "amber" | "teal";
  items: DistributionCheckItem[];
  onChange: (items: DistributionCheckItem[]) => void;
}) {
  const { title, accent, items } = props;
  const head =
    accent === "amber"
      ? "text-amber-800 dark:text-amber-300"
      : "text-teal-800 dark:text-teal-300";
  const box =
    accent === "amber"
      ? "border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
      : "border-teal-100 bg-teal-50/60 dark:border-teal-900/40 dark:bg-teal-950/20";

  function patchItem(id: string, partial: Partial<DistributionCheckItem>) {
    props.onChange(items.map((i) => (i.id === id ? { ...i, ...partial } : i)));
  }

  function addItem() {
    props.onChange([...items, { id: distributionNewId("dchk"), label: "새 항목", done: false }]);
  }

  function removeItem(id: string) {
    props.onChange(items.filter((i) => i.id !== id));
  }

  return (
    <div className={`rounded-lg border p-3 ${box}`}>
      <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${head}`}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={item.done === true}
              onChange={(e) => patchItem(item.id, { done: e.target.checked })}
              className="mt-1 h-4 w-4 shrink-0 rounded"
            />
            <input
              className={`min-w-0 flex-1 ${inputCls} ${item.done ? "line-through opacity-60" : ""}`}
              value={item.label}
              onChange={(e) => patchItem(item.id, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="shrink-0 text-[10px] text-red-500 hover:underline"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addItem}
        className="mt-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        + 항목 추가
      </button>
    </div>
  );
}

function StepCard(props: {
  step: DistributionStep;
  index: number;
  isCurrent: boolean;
  onChange: (next: DistributionStep) => void;
  onRemove: () => void;
}) {
  const { step, index, isCurrent } = props;
  const stats = stepProgress(step);

  function patch(partial: Partial<DistributionStep>) {
    const next = { ...step, ...partial };
    props.onChange(syncStepDone(next));
  }

  return (
    <article
      className={`rounded-xl border shadow-sm transition-all ${
        step.done
          ? "border-emerald-300/80 bg-gradient-to-b from-emerald-50/80 to-white dark:border-emerald-900/50 dark:from-emerald-950/25 dark:to-zinc-950"
          : isCurrent
            ? "border-teal-400 bg-gradient-to-b from-teal-50/80 to-white ring-2 ring-teal-400/30 dark:border-teal-700 dark:from-teal-950/30 dark:to-zinc-950"
            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
            step.done
              ? "bg-emerald-500 text-white"
              : isCurrent
                ? "bg-teal-500 text-white"
                : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
          }`}
        >
          {index + 1}
        </span>
        <input
          className="min-w-[8rem] flex-1 bg-transparent text-sm font-bold text-zinc-900 outline-none dark:text-zinc-50"
          value={step.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <span className="text-xs tabular-nums text-zinc-500">
          {stats.done}/{stats.total}
        </span>
        <button
          type="button"
          onClick={props.onRemove}
          className="text-xs text-red-500 hover:underline"
        >
          삭제
        </button>
      </div>
      <div className="space-y-3 px-4 py-3">
        <textarea
          className={textareaCls}
          rows={2}
          value={step.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          placeholder="단계 설명"
        />
        <ProgressBar stats={stats} size="sm" />
        <div className="grid gap-3 md:grid-cols-2">
          <CheckList
            title="제반 (준비)"
            accent="amber"
            items={step.prerequisiteItems}
            onChange={(prerequisiteItems) => patch({ prerequisiteItems })}
          />
          <CheckList
            title="수행 (실행)"
            accent="teal"
            items={step.actionItems}
            onChange={(actionItems) => patch({ actionItems })}
          />
        </div>
      </div>
    </article>
  );
}

function PlatformPanel(props: {
  platform: DistributionPlatform;
  onChange: (next: DistributionPlatform) => void;
  onRemove: () => void;
}) {
  const { platform } = props;
  const stats = platformProgress(platform);
  const sortedSteps = useMemo(
    () => [...platform.steps].sort((a, b) => a.order - b.order),
    [platform.steps],
  );
  const currentStepId = sortedSteps.find((s) => !s.done)?.id ?? null;

  function patch(partial: Partial<DistributionPlatform>) {
    props.onChange({ ...platform, ...partial });
  }

  function patchStep(stepId: string, next: DistributionStep) {
    patch({
      steps: platform.steps.map((s) => (s.id === stepId ? syncStepDone(next) : s)),
    });
  }

  function addStep() {
    patch({
      steps: [
        ...platform.steps,
        syncStepDone({
          id: distributionNewId("dstep"),
          order: platform.steps.length + 1,
          title: "새 단계",
          summary: "",
          prerequisiteItems: [],
          actionItems: [{ id: distributionNewId("dchk"), label: "수행 항목", done: false }],
          done: false,
        }),
      ],
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-950">
        <div className="flex flex-wrap items-start gap-4">
          <ProgressRing stats={stats} />
          <div className="min-w-0 flex-1 space-y-3">
            <ProgressBar stats={stats} label={`${platform.platform} 진행률`} size="lg" />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-0.5 block text-zinc-500">플랫폼</span>
                <input className={textareaCls} value={platform.platform} onChange={(e) => patch({ platform: e.target.value })} />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block text-zinc-500">소통 방식</span>
                <input
                  className={textareaCls}
                  value={platform.communication}
                  onChange={(e) => patch({ communication: e.target.value })}
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block text-zinc-500">유통 개요</span>
                <textarea
                  className={textareaCls}
                  rows={3}
                  value={platform.overview}
                  onChange={(e) => patch({ overview: e.target.value })}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block text-zinc-500">사이트</span>
                <input className={textareaCls} value={platform.site} onChange={(e) => patch({ site: e.target.value })} />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block text-zinc-500">아이디</span>
                <input className={textareaCls} value={platform.loginId} onChange={(e) => patch({ loginId: e.target.value })} />
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block text-zinc-500">비밀번호</span>
                <input
                  className={textareaCls}
                  value={platform.loginPassword}
                  onChange={(e) => patch({ loginPassword: e.target.value })}
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block text-zinc-500">참고</span>
                <input className={textareaCls} value={platform.notes} onChange={(e) => patch({ notes: e.target.value })} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-center gap-1 px-1">
          {sortedSteps.map((s, i) => {
            const sp = stepProgress(s);
            const filled = s.done === true;
            const current = s.id === currentStepId;
            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex w-28 flex-col items-center rounded-lg border px-2 py-2 text-center ${
                    filled
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : current
                        ? "border-teal-400 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/30"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                  }`}
                >
                  <span className="text-[10px] font-bold text-zinc-400">STEP {i + 1}</span>
                  <span className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                    {s.title}
                  </span>
                  <span className="mt-1 text-[10px] tabular-nums text-zinc-500">{sp.percent}%</span>
                </div>
                {i < sortedSteps.length - 1 ? (
                  <div className="mx-0.5 flex w-6 items-center" aria-hidden>
                    <div
                      className={`h-1 flex-1 rounded-full ${filled ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`}
                    />
                    <span className={`text-[10px] ${filled ? "text-emerald-500" : "text-zinc-300"}`}>▶</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {sortedSteps.map((s, i) => (
          <StepCard
            key={s.id}
            step={s}
            index={i}
            isCurrent={s.id === currentStepId}
            onChange={(next) => patchStep(s.id, next)}
            onRemove={() =>
              patch({
                steps: platform.steps
                  .filter((x) => x.id !== s.id)
                  .map((x, j) => ({ ...x, order: j + 1 })),
              })
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addStep}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          + 단계 추가
        </button>
        <button
          type="button"
          onClick={props.onRemove}
          className="text-xs text-red-600 hover:underline dark:text-red-400"
        >
          플랫폼 삭제
        </button>
      </div>
    </div>
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <input
            className="bg-transparent text-2xl font-bold tracking-tight text-zinc-900 outline-none dark:text-zinc-50"
            value={profile.title}
            onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
          />
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            플랫폼별 추가 작품 유통 — 단계별 제반·수행 체크와 진행률
          </p>
        </div>
        <p
          className={`rounded-full px-3 py-1 text-xs font-medium ${
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

      <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-white p-5 shadow-sm dark:border-teal-900/40 dark:from-teal-950/25 dark:to-zinc-950">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing stats={totalStats} size={100} />
          <div className="min-w-0 flex-1 space-y-3">
            <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">전체 유통 진행률</h2>
            <ProgressBar stats={totalStats} size="lg" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sortedPlatforms.map((pl) => (
                <ProgressBar
                  key={pl.id}
                  stats={platformProgress(pl)}
                  label={pl.platform}
                  size="sm"
                  accent="indigo"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {sortedPlatforms.map((pl) => {
          const ps = platformProgress(pl);
          const active = pl.id === activePlatform?.id;
          return (
            <button
              key={pl.id}
              type="button"
              onClick={() => setActivePlatformId(pl.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {pl.platform}
              <span className="ml-1.5 text-xs opacity-80">{ps.percent}%</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={addPlatform}
          className="rounded-full border border-dashed border-zinc-400 px-3 py-1.5 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          + 플랫폼
        </button>
      </div>

      {activePlatform ? (
        <PlatformPanel
          key={activePlatform.id}
          platform={activePlatform}
          onChange={(next) => updatePlatform(activePlatform.id, next)}
          onRemove={() => removePlatform(activePlatform.id)}
        />
      ) : null}
    </div>
  );
}
