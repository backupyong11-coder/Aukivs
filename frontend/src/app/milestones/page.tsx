import Link from "next/link";
import { MilestoneClient } from "@/components/MilestoneClient";

export default function MilestonesPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">로컬 전용</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">기획·일정</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          마일스톤 타임라인·간트입니다. 인물별 표는{" "}
          <Link href="/personnel" className="font-medium text-zinc-800 underline dark:text-zinc-200">
            인물별
          </Link>
          에서 보실 수 있습니다.
        </p>
      </div>

      <div id="milestones" className="scroll-mt-4 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">마일스톤</h2>
        <MilestoneClient />
      </div>
    </div>
  );
}
