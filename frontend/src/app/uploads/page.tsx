import { UploadsClient } from "@/components/UploadsClient";

export default function UploadsPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col px-4 py-8 sm:px-6 md:mx-auto md:max-w-4xl md:py-10">
      <header className="mb-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          작업 화면
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          업로드
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Google 시트 업로드 탭과 연동된 기록을 여기서 다룹니다. 카드에서
          상태·메모·업로드 시각을 수정할 수 있으며, 추가·삭제는 이후 단계에서
          붙입니다.
        </p>
      </header>
      <UploadsClient />
    </div>
  );
}
