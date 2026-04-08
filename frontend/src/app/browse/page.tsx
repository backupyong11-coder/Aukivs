import { BrowseHistorySection } from "@/components/BrowseHistorySection";

export default function BrowsePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col px-4 py-8 sm:px-6 md:mx-auto md:max-w-2xl md:py-10">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        조회
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        전체정보·기록
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        홈의 질문·결과가 기본 경로입니다. 이 탭은 플랫폼별·작품별 전체정보,
        담당자·메일·업로드 규칙 같은{" "}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          길게 붙잡고 보는 조회
        </span>
        를 모을 자리입니다. 다음 턴에서 시트 열과 연결합니다.
      </p>

      <section className="mt-8 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          예정
        </h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>플랫폼 선택 → 전체정보 카드</li>
          <li>작품 선택 → 회차·업로드 규칙 요약</li>
          <li>담당자·메일·업로드 방식 조회</li>
        </ul>
      </section>

      <BrowseHistorySection />
    </div>
  );
}
