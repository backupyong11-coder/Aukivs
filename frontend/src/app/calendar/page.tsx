import { FullCalendarClient } from "@/components/FullCalendarClient";

export default function CalendarPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">캘린더</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          업무 마감·업로드·런칭·메모·작품 첫 공급 일정을 한 화면에서 월·주·일 단위로 봅니다.
        </p>
      </div>
      <FullCalendarClient />
    </div>
  );
}
