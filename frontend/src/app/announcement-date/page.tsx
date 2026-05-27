import { AnnouncementDateClient } from "@/components/AnnouncementDateClient";

export default function AnnouncementDatePage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">작업 화면</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">발표일 DB</h1>
      </div>
      <AnnouncementDateClient />
    </div>
  );
}
