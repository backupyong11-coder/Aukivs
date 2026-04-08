export default function SettingsPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col px-4 py-8 sm:px-6 md:mx-auto md:max-w-2xl md:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">설정</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        API 주소·PWA 등은 이후 단계에서 최소 설정만 둘 예정입니다. 일상 조작은 관제
        홈과 체크·업로드 작업 화면에서 진행하세요.
      </p>
    </div>
  );
}
