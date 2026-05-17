import { PlatformWorkMatrixClient } from "@/components/PlatformWorkMatrixClient";

export default function PlatformMatrixPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">플랫폼 연동 매트릭스</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          작품(행) × 플랫폼(열) 히트맵입니다. 하단 행에는 플랫폼정리 시트의 최근 메모 성격 요약이 붙습니다.
        </p>
      </div>
      <PlatformWorkMatrixClient />
    </div>
  );
}
