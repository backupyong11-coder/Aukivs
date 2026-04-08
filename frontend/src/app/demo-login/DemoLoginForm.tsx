"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function DemoLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/demo-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "접근 코드가 올바르지 않습니다.",
        );
        return;
      }
      const next = searchParams.get("next");
      const dest =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : "/";
      router.replace(dest);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-center text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          데모용 접근 코드 입력
        </h1>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label
              htmlFor="demo-pin"
              className="sr-only"
            >
              접근 코드
            </label>
            <input
              id="demo-pin"
              name="pin"
              type="password"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="접근 코드"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-zinc-400 placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
              disabled={pending}
            />
          </div>
          {error ? (
            <p
              className="text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !pin.trim()}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? "확인 중…" : "입장"}
          </button>
        </form>
      </div>
    </div>
  );
}
