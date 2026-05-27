import Link from "next/link";
import { PersonnelHubClient } from "@/components/PersonnelHubClient";

export default function PersonnelPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">직원 · 업무</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">인물별</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            업무정리 DB의 업무담당과 연동된 직원별 할 일 대시보드와, 제작·유통 메모용 인물 보드를
            함께 씁니다.
          </p>
        </div>
        <Link
          href="/milestones"
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        >
          마일스톤·간트 보기 →
        </Link>
      </div>
      <PersonnelHubClient />
    </div>
  );
}
