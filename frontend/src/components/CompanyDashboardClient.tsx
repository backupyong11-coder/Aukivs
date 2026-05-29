"use client";

import { useEffect, useMemo, useState } from "react";
import { EditableCompanyTable } from "@/components/EditableCompanyTable";
import {
  fetchCompanyProfileFromServer,
  saveCompanyProfileToServer,
} from "@/lib/companyApi";
import {
  computeCompanyKpis,
  createDefaultCompanyProfile,
  loadCompanyProfile,
  revenueChartSlices,
  saveCompanyProfile,
  type CompanyProfile,
  type CompanyTableSection,
} from "@/lib/companyStorage";

const BAR_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

type SyncStatus = "loading" | "synced" | "saving" | "local" | "error";

function KpiCard(props: {
  label: string;
  value: string;
  sub?: string;
  accent: "blue" | "green" | "purple" | "amber";
}) {
  const styles = {
    blue: "border-blue-200 bg-gradient-to-br from-blue-50 to-white dark:border-blue-900/40 dark:from-blue-950/30 dark:to-zinc-950",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-zinc-950",
    purple: "border-violet-200 bg-gradient-to-br from-violet-50 to-white dark:border-violet-900/40 dark:from-violet-950/30 dark:to-zinc-950",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/30 dark:to-zinc-950",
  } as const;
  const valueStyles = {
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-emerald-700 dark:text-emerald-300",
    purple: "text-violet-700 dark:text-violet-300",
    amber: "text-amber-700 dark:text-amber-300",
  } as const;

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${styles[props.accent]}`}>
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{props.label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${valueStyles[props.accent]}`}>{props.value}</p>
      {props.sub ? <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{props.sub}</p> : null}
    </div>
  );
}

function RevenueChart({ slices }: { slices: { label: string; value: number }[] }) {
  const max = Math.max(...slices.map((s) => s.value), 1);
  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">매출 데이터가 없습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {slices.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">{s.label}년</span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
              ₩ {s.value.toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (s.value / max) * 100)}%`,
                backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function syncBanner(status: SyncStatus, message: string | null) {
  if (status === "loading") return "불러오는 중…";
  if (status === "saving") return "서버에 저장 중…";
  if (status === "synced") return "서버에 저장됨";
  if (status === "local") return message ?? "로컬만 저장됨";
  return message ?? "서버 저장 실패";
}

export function CompanyDashboardClient() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const server = await fetchCompanyProfileFromServer();
      if (cancelled) return;

      if (server.ok && server.profile) {
        setProfile(server.profile);
        saveCompanyProfile(server.profile);
        setSyncStatus("synced");
        setSyncMessage(null);
        setHydrated(true);
        return;
      }

      if (server.ok && !server.profile) {
        const local = loadCompanyProfile();
        const seed =
          local.sections.length > 0 && local.companyName
            ? local
            : createDefaultCompanyProfile();
        setProfile(seed);
        setHydrated(true);
        const pushed = await saveCompanyProfileToServer(seed);
        if (cancelled) return;
        if (pushed.ok) {
          saveCompanyProfile(seed);
          setSyncStatus("synced");
          setSyncMessage("초기 데이터를 서버에 올렸습니다.");
        } else {
          setSyncStatus("local");
          setSyncMessage(pushed.message);
        }
        return;
      }

      const local = loadCompanyProfile();
      setProfile(local);
      setSyncStatus("local");
      setSyncMessage(server.ok ? "서버에 문서가 없어 로컬을 열었습니다." : server.message);
      setHydrated(true);
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !profile) return;
    saveCompanyProfile(profile);

    const timer = window.setTimeout(() => {
      void (async () => {
        setSyncStatus((prev) => (prev === "error" ? "error" : "saving"));
        const result = await saveCompanyProfileToServer(profile);
        if (result.ok) {
          setSyncStatus("synced");
          setSyncMessage(null);
        } else {
          setSyncStatus("error");
          setSyncMessage(result.message);
        }
      })();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [profile, hydrated]);

  const kpis = useMemo(() => (profile ? computeCompanyKpis(profile) : null), [profile]);
  const chartSlices = useMemo(() => (profile ? revenueChartSlices(profile) : []), [profile]);

  function patchSection(sectionId: string, next: CompanyTableSection) {
    setProfile((p) => {
      if (!p) return p;
      return {
        ...p,
        sections: p.sections.map((s) => (s.id === sectionId ? next : s)),
      };
    });
  }

  function resetDefault() {
    if (!window.confirm("CSV 기준 초기 데이터로 되돌릴까요? 서버·브라우저 모두 갱신됩니다.")) return;
    const fresh = createDefaultCompanyProfile();
    setProfile(fresh);
    saveCompanyProfile(fresh);
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500">불러오는 중…</p>;
  }

  const bannerCls =
    syncStatus === "error"
      ? "text-red-600 dark:text-red-400"
      : syncStatus === "synced"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-zinc-500 dark:text-zinc-400";

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            type="text"
            value={profile.companyName}
            onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
            className="w-full max-w-xl border-0 bg-transparent text-2xl font-bold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400/50 dark:text-zinc-50"
          />
          <input
            type="text"
            value={profile.subtitle}
            onChange={(e) => setProfile({ ...profile, subtitle: e.target.value })}
            className="w-full max-w-xl border-0 bg-transparent text-sm text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-400/50 dark:text-zinc-400"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${bannerCls}`}>{syncBanner(syncStatus, syncMessage)}</span>
          <button
            type="button"
            onClick={resetDefault}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
          >
            초기화
          </button>
        </div>
      </div>

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="누적 매출 (합계)" value={kpis.totalRevenueLabel} accent="blue" />
          <KpiCard
            label={kpis.latestYear ? `${kpis.latestYear} 매출` : "최근 연도 매출"}
            value={kpis.latestAmount || "—"}
            accent="green"
          />
          <KpiCard label="총 종사자" value={kpis.employeeCount} accent="purple" />
          <KpiCard label="설립일" value={kpis.founded} accent="amber" />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">연도별 매출 추이</h2>
          <RevenueChart slices={chartSlices} />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">빠른 링크</h2>
          <ul className="space-y-2 text-sm">
            {(profile.sections[0]?.rows ?? []).slice(0, 6).map((row) => {
              const cols = profile.sections[0]?.columns ?? [];
              const label = row.cells[cols[0]?.id ?? ""] ?? "";
              const url = row.cells[cols[1]?.id ?? ""] ?? "";
              if (!label.trim()) return null;
              return (
                <li key={row.id} className="flex flex-col gap-0.5 border-b border-zinc-100 pb-2 dark:border-zinc-800">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
                  {url.startsWith("http") ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-blue-600 underline dark:text-blue-400"
                    >
                      {url}
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-500">{url || "—"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="space-y-8">
        {profile.sections.map((sec) => (
          <EditableCompanyTable
            key={sec.id}
            section={sec}
            onChange={(next) => patchSection(sec.id, next)}
          />
        ))}
      </div>
    </div>
  );
}
