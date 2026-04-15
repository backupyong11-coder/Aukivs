export default function AnnouncementDatePage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">발표일</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          발표·공개 일정을 모아 보는 화면입니다. 플랫폼정리 시트 B열(발표일) 등과 연동해 확장할 수 있습니다.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
        상세 뷰는 <span className="font-medium text-zinc-700 dark:text-zinc-300">플랫폼정리</span> 탭에서 B열·P열을 테이블로 확인할 수 있습니다.
      </div>
    </div>
  );
}
