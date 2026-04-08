"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadFavoriteQueries,
  loadRecentQueries,
} from "@/lib/controlRoomQueryHistory";

export function BrowseHistorySection() {
  const [recent, setRecent] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setRecent(loadRecentQueries());
    setFavorites(loadFavoriteQueries());
  }, []);

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        홈과 공유하는 기록
      </h2>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        아래는 이 브라우저에만 저장된 최근·즐겨찾기 질문입니다(서버 미동기화).
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            최근 질문
          </p>
          {recent.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">없음</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
              {recent.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            즐겨찾기
          </p>
          {favorites.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">없음</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
              {favorites.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Link
        href="/"
        className="mt-4 inline-block text-sm font-medium text-zinc-900 underline dark:text-zinc-100"
      >
        관제 홈에서 질문하기 →
      </Link>
    </section>
  );
}
