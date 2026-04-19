import { PlatformRowsClient } from "@/components/PlatformRowsClient";

export default function PlatformsPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">플랫폼정리</h1>
      </div>
      <PlatformRowsClient />
    </div>
  );
}
