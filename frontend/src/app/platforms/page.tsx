import { PlatformRowsClient } from "@/components/PlatformRowsClient";

export default function PlatformsPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">플랫폼정리</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Google 시트 플랫폼정리 탭과 연동됩니다. 현재단계·마지막상황·대기사유·다음액션·우선순위·비고를 수정할 수 있으며, 수정 시 마지막업데이트날짜가 자동으로 기록됩니다.
        </p>
      </div>
      <PlatformRowsClient />
    </div>
  );
}
