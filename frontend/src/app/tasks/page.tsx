import { TasksClient } from "@/components/TasksClient";

export default function TasksPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">업무정리</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Google 시트 업무정리 탭과 연동됩니다. 날짜그룹부터 메모(U열)까지 열을 읽고 수정할 수 있습니다. O열(시트에서 두 번째 세부수치·단위)은 API와 화면에서 세부단위 필드로 다룹니다.
        </p>
      </div>
      <TasksClient />
    </div>
  );
}
