import { MemoMenuClient } from "@/components/MemoMenuClient";

export default function MemoPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">메모</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          메모장 시트와 동기화됩니다. 목록은 최신 날짜순으로 정렬해 보여 줍니다.
        </p>
      </div>
      <MemoMenuClient />
    </div>
  );
}
