import { ChatbotClient } from "@/components/ChatbotClient";

export default function ChatbotPage() {
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">관제 데이터 질의</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">챗봇</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          관제실과 동일하게 <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">POST /api/ops/ask</code> 로 질의합니다. 플랫폼·작품·업무·체크리스트·메모 스냅샷이 함께 전달됩니다.
        </p>
      </div>
      <ChatbotClient />
    </div>
  );
}
