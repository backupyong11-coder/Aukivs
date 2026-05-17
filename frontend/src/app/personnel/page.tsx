import Link from "next/link";
import { PersonnelBoardClient } from "@/components/PersonnelBoardClient";

export default function PersonnelPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">로컬 전용</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">인물별</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            제작·유통·기타업무 등 열을 바꿔 가며 인물(행)별로 정리합니다. 마일스톤과 같은 브라우저에만 저장됩니다.
          </p>
        </div>
        <Link
          href="/milestones"
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        >
          마일스톤·간트 보기 →
        </Link>
      </div>
      <PersonnelBoardClient />
    </div>
  );
}
