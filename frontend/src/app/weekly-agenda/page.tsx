import { WeeklyAgendaHubClient } from "@/components/WeeklyAgendaHubClient";

export default function WeeklyAgendaPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">서버 동기화</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">주간 아젠다</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          주간 아젠다는 업무정리 DB(실행일) 연동 탭과, 수기 보드 탭을 함께 제공합니다.
        </p>
      </div>
      <WeeklyAgendaHubClient />
    </div>
  );
}
