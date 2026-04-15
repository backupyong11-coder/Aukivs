export default function ProgressPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">현재진행</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          진행 중인 프로젝트·업무를 한곳에서 볼 수 있는 화면입니다. (연동·상세 기능은 추후 확장 예정입니다.)
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
        관제실의 <span className="font-medium text-zinc-700 dark:text-zinc-300">현재 진행 프로젝트</span> 조회와 연계하거나, 별도 시트와 연동할 수 있도록 준비 중입니다.
      </div>
    </div>
  );
}
