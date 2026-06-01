"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchThumbnailSpecsFromServer,
  saveThumbnailSpecsToServer,
} from "@/lib/thumbnailSpecsApi";
import {
  fetchPlatformRowsList,
  findPlatformRowByLabel,
  platformRowLabel,
  type PlatformRowRecord,
} from "@/lib/platformRowsMutate";
import {
  computeSpecGroups,
  computeThumbnailKpis,
  createDefaultThumbnailSpecsProfile,
  loadThumbnailSpecsProfile,
  parseDimensions,
  saveThumbnailSpecsProfile,
  thumbnailNewId,
  type ThumbnailPlatformBlock,
  type ThumbnailSpecGroup,
  type ThumbnailSpecItem,
  type ThumbnailSpecsProfile,
} from "@/lib/thumbnailSpecsStorage";

const PLATFORM_ACCENTS = [
  "from-indigo-500/15 to-violet-500/5 border-indigo-200 dark:border-indigo-900/50",
  "from-emerald-500/15 to-teal-500/5 border-emerald-200 dark:border-emerald-900/50",
  "from-amber-500/15 to-orange-500/5 border-amber-200 dark:border-amber-900/50",
  "from-rose-500/15 to-pink-500/5 border-rose-200 dark:border-rose-900/50",
  "from-sky-500/15 to-cyan-500/5 border-sky-200 dark:border-sky-900/50",
  "from-fuchsia-500/15 to-purple-500/5 border-fuchsia-200 dark:border-fuchsia-900/50",
];

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";
type TabId = "groups" | "platforms";

function syncBanner(status: SyncStatus, message: string | null) {
  if (status === "loading") return "불러오는 중…";
  if (status === "saving") return "서버에 저장 중…";
  if (status === "synced") return "서버에 저장됨";
  if (status === "local") return message ?? "로컬만 저장됨";
  return message ?? "서버 저장 실패";
}

function autoLinkPlatforms(
  profile: ThumbnailSpecsProfile,
  rows: PlatformRowRecord[],
): ThumbnailSpecsProfile {
  if (rows.length === 0) return profile;
  let changed = false;
  const platforms = profile.platforms.map((p) => {
    if (p.platformRowId) return p;
    const exact = findPlatformRowByLabel(rows, p.name);
    if (exact) {
      changed = true;
      return { ...p, platformRowId: exact.id };
    }
    const n = p.name.trim().toLowerCase();
    const partial = rows.find((r) => {
      const lbl = platformRowLabel(r).toLowerCase();
      return lbl.includes(n) || n.includes(lbl);
    });
    if (partial) {
      changed = true;
      return { ...p, platformRowId: partial.id };
    }
    return p;
  });
  return changed ? { ...profile, platforms } : profile;
}

function SizePreview({ size }: { size: string }) {
  const dim = parseDimensions(size);
  if (!dim) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[10px] text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900">
        —
      </div>
    );
  }
  const max = 56;
  const ratio = dim.w / dim.h;
  const width = ratio >= 1 ? max : max * ratio;
  const height = ratio >= 1 ? max / ratio : max;
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <div
        className="rounded-sm bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm"
        style={{ width: Math.max(8, width), height: Math.max(8, height) }}
        title={`${dim.w}×${dim.h}`}
      />
    </div>
  );
}

function KpiCard(props: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-4 shadow-sm ${props.accent}`}
    >
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{props.label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {props.value}
      </p>
      {props.sub ? (
        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{props.sub}</p>
      ) : null}
    </div>
  );
}

function GroupCard({ group }: { group: ThumbnailSpecGroup }) {
  const dim = parseDimensions(group.displaySize);
  const ratioLabel = dim ? (dim.w > dim.h ? "가로형" : dim.w < dim.h ? "세로형" : "정사각") : "";
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex gap-3">
        <SizePreview size={group.displaySize} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {group.displaySize}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {group.members.length}곳에서 사용 · {ratioLabel}
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {group.members.map((m) => (
          <li
            key={`${m.platformId}-${m.specId}`}
            className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-xs dark:bg-zinc-900"
          >
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{m.platformName}</span>
            <span className="text-zinc-600 dark:text-zinc-300">{m.category}</span>
            {m.note ? (
              <span className="text-zinc-400 dark:text-zinc-500">({m.note})</span>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

function PlatformLinkSelect(props: {
  value: string;
  rows: PlatformRowRecord[];
  onChange: (platformRowId: string) => void;
}) {
  const sorted = useMemo(
    () =>
      [...props.rows].sort((a, b) => platformRowLabel(a).localeCompare(platformRowLabel(b), "ko")),
    [props.rows],
  );
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
      aria-label="플랫폼정리 DB 연결"
    >
      <option value="">플랫폼정리 연결…</option>
      {sorted.map((r) => (
        <option key={r.id} value={r.id}>
          {platformRowLabel(r) || r.id}
        </option>
      ))}
    </select>
  );
}

function PlatformCard(props: {
  block: ThumbnailPlatformBlock;
  accent: string;
  platformRows: PlatformRowRecord[];
  onChange: (next: ThumbnailPlatformBlock) => void;
  onRemove: () => void;
}) {
  const linked = props.platformRows.find((r) => r.id === props.block.platformRowId);
  const linkedLabel = linked ? platformRowLabel(linked) : null;

  function patchSpec(specId: string, patch: Partial<ThumbnailSpecItem>) {
    props.onChange({
      ...props.block,
      specs: props.block.specs.map((s) => (s.id === specId ? { ...s, ...patch } : s)),
    });
  }

  function removeSpec(specId: string) {
    props.onChange({
      ...props.block,
      specs: props.block.specs.filter((s) => s.id !== specId),
    });
  }

  function addSpec() {
    props.onChange({
      ...props.block,
      specs: [
        ...props.block.specs,
        { id: thumbnailNewId("spec"), category: "새 규격", size: "0 x 0" },
      ],
    });
  }

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-gradient-to-br shadow-sm ${props.accent}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200/80 bg-white/60 px-4 py-3 dark:border-zinc-700/80 dark:bg-zinc-950/40">
        <div className="min-w-0 space-y-1">
          <input
            type="text"
            value={props.block.name}
            onChange={(e) => props.onChange({ ...props.block, name: e.target.value })}
            className="w-full min-w-[8rem] border-0 bg-transparent text-base font-bold text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-400/40 dark:text-zinc-50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <PlatformLinkSelect
              value={props.block.platformRowId}
              rows={props.platformRows}
              onChange={(platformRowId) => props.onChange({ ...props.block, platformRowId })}
            />
            {linkedLabel ? (
              <Link
                href="/platforms"
                className="text-[11px] text-indigo-600 underline dark:text-indigo-400"
                title="플랫폼정리 DB에서 확인"
              >
                {linkedLabel} · 플랫폼정리 ↗
              </Link>
            ) : (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">미연결</span>
            )}
            {linked?.["현재단계"] ? (
              <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] dark:bg-zinc-800">
                {linked["현재단계"]}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addSpec}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          >
            + 규격
          </button>
          <button
            type="button"
            onClick={props.onRemove}
            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 dark:border-red-900 dark:text-red-400"
          >
            플랫폼 삭제
          </button>
        </div>
      </header>
      <div className="overflow-x-auto bg-white/80 dark:bg-zinc-950/60">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-100/80 text-left text-xs dark:bg-zinc-900/80">
              <th className="w-12 border-b border-zinc-200 px-2 py-2 dark:border-zinc-700">미리보기</th>
              <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-700">구분</th>
              <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-700">사이즈</th>
              <th className="border-b border-zinc-200 px-2 py-2 dark:border-zinc-700">비고</th>
              <th className="w-14 border-b border-zinc-200 px-2 py-2 dark:border-zinc-700" />
            </tr>
          </thead>
          <tbody>
            {props.block.specs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-zinc-500">
                  규격이 없습니다. 「+ 규격」으로 추가하세요.
                </td>
              </tr>
            ) : (
              props.block.specs.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-2 text-center">
                    <div className="inline-flex justify-center">
                      <SizePreview size={s.size} />
                    </div>
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={s.category}
                      onChange={(e) => patchSpec(s.id, { category: e.target.value })}
                      className="w-full min-w-[5rem] rounded border-0 bg-transparent px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400/40"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={s.size}
                      onChange={(e) => patchSpec(s.id, { size: e.target.value })}
                      className="w-full min-w-[6rem] rounded border-0 bg-transparent px-2 py-1 font-mono text-sm tabular-nums outline-none focus:ring-2 focus:ring-indigo-400/40"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={s.note ?? ""}
                      onChange={(e) => patchSpec(s.id, { note: e.target.value })}
                      placeholder="용량·여백 등"
                      className="w-full min-w-[5rem] rounded border-0 bg-transparent px-2 py-1 text-sm text-zinc-600 outline-none focus:ring-2 focus:ring-indigo-400/40 dark:text-zinc-300"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeSpec(s.id)}
                      className="text-xs text-red-600 underline dark:text-red-400"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function ThumbnailSpecsClient() {
  const [profile, setProfile] = useState<ThumbnailSpecsProfile>(() =>
    createDefaultThumbnailSpecsProfile(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [platformRows, setPlatformRows] = useState<PlatformRowRecord[]>([]);
  const [tab, setTab] = useState<TabId>("groups");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [server, rows] = await Promise.all([
        fetchThumbnailSpecsFromServer(),
        fetchPlatformRowsList().catch(() => [] as PlatformRowRecord[]),
      ]);
      if (cancelled) return;
      setPlatformRows(rows);

      if (server.ok && server.profile) {
        const linked = autoLinkPlatforms(server.profile, rows);
        setProfile(linked);
        saveThumbnailSpecsProfile(linked);
        setSyncStatus("synced");
        setHydrated(true);
        return;
      }

      const local = loadThumbnailSpecsProfile();
      const linkedLocal = autoLinkPlatforms(local, rows);
      setProfile(linkedLocal);
      saveThumbnailSpecsProfile(linkedLocal);

      if (server.ok && server.profile == null) {
        const saved = await saveThumbnailSpecsToServer(linkedLocal);
        if (cancelled) return;
        if (saved.ok) {
          setSyncStatus("synced");
          setSyncMessage("초기 데이터를 서버에 올렸습니다.");
        } else {
          setSyncStatus("local");
          setSyncMessage(saved.message);
        }
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
    saveThumbnailSpecsProfile(profile);
    const t = window.setTimeout(() => {
      void (async () => {
        setSyncStatus((prev) => (prev === "error" ? "error" : "saving"));
        const result = await saveThumbnailSpecsToServer(profile);
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

  const kpis = useMemo(() => computeThumbnailKpis(profile), [profile]);
  const groups = useMemo(() => computeSpecGroups(profile), [profile]);

  const patchPlatform = useCallback((platformId: string, next: ThumbnailPlatformBlock) => {
    setProfile((p) => ({
      ...p,
      platforms: p.platforms.map((b) => (b.id === platformId ? next : b)),
    }));
  }, []);

  const removePlatform = useCallback((platformId: string) => {
    if (!window.confirm("이 플랫폼 블록을 삭제할까요?")) return;
    setProfile((p) => ({
      ...p,
      platforms: p.platforms.filter((b) => b.id !== platformId),
    }));
  }, []);

  const addPlatform = useCallback(() => {
    setProfile((p) => ({
      ...p,
      platforms: [
        ...p.platforms,
        {
          id: thumbnailNewId("plat"),
          name: "새 플랫폼",
          platformRowId: "",
          specs: [{ id: thumbnailNewId("spec"), category: "대표 썸네일", size: "0 x 0" }],
        },
      ],
    }));
    setTab("platforms");
  }, []);

  const resetDefaults = useCallback(() => {
    if (!window.confirm("엑셀 기준 초기 데이터로 되돌릴까요? 서버·브라우저 모두 갱신됩니다.")) return;
    const fresh = autoLinkPlatforms(createDefaultThumbnailSpecsProfile(), platformRows);
    setProfile(fresh);
  }, [platformRows]);

  const relinkAll = useCallback(() => {
    setProfile((p) => autoLinkPlatforms(p, platformRows));
  }, [platformRows]);

  const bannerCls =
    syncStatus === "error"
      ? "text-red-600 dark:text-red-400"
      : syncStatus === "synced"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-zinc-500 dark:text-zinc-400";

  if (!hydrated) {
    return <p className="py-12 text-center text-sm text-zinc-500">썸네일 규격을 불러오는 중…</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">서버 동기화</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            썸네일 규격
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            플랫폼별 썸네일·원고 작업 사이즈를 한눈에 보고, 같은 픽셀 규격은 자동으로 묶습니다.
            플랫폼정리 DB와 연결해 두면 플랫폼 현황과 함께 관리할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-xs ${bannerCls}`}>{syncBanner(syncStatus, syncMessage)}</span>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={relinkAll}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
            >
              플랫폼 자동 연결
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={addPlatform}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              + 플랫폼
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="플랫폼"
          value={String(kpis.platformCount)}
          sub={`${kpis.linkedCount}개 플랫폼정리 연결됨`}
          accent="from-indigo-500/10 to-white border-indigo-200 dark:from-indigo-950/30 dark:to-zinc-950 dark:border-indigo-900/40"
        />
        <KpiCard
          label="등록 규격"
          value={String(kpis.specCount)}
          accent="from-emerald-500/10 to-white border-emerald-200 dark:from-emerald-950/30 dark:to-zinc-950 dark:border-emerald-900/40"
        />
        <KpiCard
          label="공통 규격 그룹"
          value={String(kpis.groupCount)}
          sub="2곳 이상 동일 픽셀"
          accent="from-violet-500/10 to-white border-violet-200 dark:from-violet-950/30 dark:to-zinc-950 dark:border-violet-900/40"
        />
        <KpiCard
          label="대표 예시"
          value="504×245"
          sub="미툰 회차 썸네일 (성인·비성인)"
          accent="from-amber-500/10 to-white border-amber-200 dark:from-amber-950/30 dark:to-zinc-950 dark:border-amber-900/40"
        />
      </div>

      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900">
        {(
          [
            ["groups", "공통 규격"],
            ["platforms", "플랫폼별"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "groups" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            같은 픽셀 규격 ({groups.length})
          </h2>
          {groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-600">
              두 곳 이상에서 쓰는 동일 픽셀 규격이 없습니다. 플랫폼별 탭에서 규격을 편집하세요.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {profile.platforms.map((block, i) => (
            <PlatformCard
              key={block.id}
              block={block}
              accent={PLATFORM_ACCENTS[i % PLATFORM_ACCENTS.length]}
              platformRows={platformRows}
              onChange={(next) => patchPlatform(block.id, next)}
              onRemove={() => removePlatform(block.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
