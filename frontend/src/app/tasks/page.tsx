import { TasksClient } from "@/components/TasksClient";

export default function TasksPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">업무정리 DB</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Google 시트 업무정리 탭과 연동됩니다. 우선순위·마감일·업무명 등 주요 열을 표에서 바로 수정할 수 있습니다.
        </p>
      </div>
      <TasksClient />
    </div>
  );
}
