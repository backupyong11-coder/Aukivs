export default function ContractsPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">계약정리</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          계약 단계·상태를 정리하는 화면입니다. (연동·상세 기능은 추후 확장 예정입니다.)
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
        플랫폼정리 시트의 계약·미팅 정보와 연계하거나 전용 뷰로 확장할 수 있도록 준비 중입니다.
      </div>
    </div>
  );
}
