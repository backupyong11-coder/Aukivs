import { PlatformRowsClient } from "@/components/PlatformRowsClient";

export default function PlatformsPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">플랫폼정리</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Google 시트 플랫폼정리 탭과 연동됩니다. 아래 표는 C열(발표일)·Q열(플랫폼명)을 중심으로 보여 주며, 셀을 클릭해 바로 수정할 수 있습니다. 「수정」에서 분류·현재단계·상황·비고(AO) 등 나머지 필드를 편집할 수 있고, 저장 시 M열(마지막업데이트날짜)이 자동 기록됩니다.
        </p>
      </div>
      <PlatformRowsClient />
    </div>
  );
}
