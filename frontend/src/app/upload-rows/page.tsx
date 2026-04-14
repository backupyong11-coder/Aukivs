import { UploadRowsClient } from "@/components/UploadRowsClient";

export default function UploadRowsPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">업로드정리</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Google 시트 업로드정리 탭과 연동됩니다. 완료·업로드일·플랫폼명·작품명·업로드방식·비고 등을 수정할 수 있습니다.
        </p>
      </div>
      <UploadRowsClient />
    </div>
  );
}
