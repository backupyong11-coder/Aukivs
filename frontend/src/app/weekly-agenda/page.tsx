import { WeeklyAgendaClient } from "@/components/WeeklyAgendaClient";

export default function WeeklyAgendaPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">서버 동기화</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">주간 아젠다</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          대분류·소분류·세부 내용 표와, 인물별(행)×월~금(열) 표를 함께 씁니다. 기간별 시트는 화면 하단 고정 탭에서 전환하며 두 표가 같이 연동됩니다. 내용은 Supabase에 저장되어 같은 운영 URL로 접속하는 PC·브라우저에서 공유됩니다.
        </p>
      </div>
      <WeeklyAgendaClient />
    </div>
  );
}
