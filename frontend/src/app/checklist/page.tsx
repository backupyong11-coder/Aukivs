import { ChecklistClient } from "@/components/ChecklistClient";

export default function ChecklistPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col px-4 py-8 sm:px-6 md:mx-auto md:max-w-4xl md:py-10">
      <header className="mb-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          작업 화면
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          체크리스트
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Google 시트와 연동된 활성 목록을 여기서 수정·완료·삭제합니다. 관제
          홈의 오늘 브리핑은 조회용이며, 상단 AI 제안은 참고 초안만 제공하고
          시트에 자동 반영하지 않습니다.
        </p>
      </header>
      <ChecklistClient />
    </div>
  );
}
