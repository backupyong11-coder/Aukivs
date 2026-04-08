"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SidebarMemoPad } from "@/components/SidebarMemoPad";

const links = [
  { href: "/", label: "관제실", title: "PC 관제판(첫 화면)" },
  { href: "/checklist", label: "체크 편집", title: "체크리스트 시트 작업" },
  { href: "/uploads", label: "업로드 편집", title: "업로드 시트 작업" },
  { href: "/settings", label: "설정", title: "연결·환경" },
] as const;

type AppNavProps = {
  showDemoLogout?: boolean;
};

export function AppNav({ showDemoLogout = false }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutBusy, setLogoutBusy] = useState(false);

  if (pathname === "/demo-login" || pathname.startsWith("/demo-login/")) {
    return null;
  }

  async function handleDemoLogout() {
    setLogoutBusy(true);
    try {
      await fetch("/api/demo-auth/logout", { method: "POST" });
      router.replace("/demo-login");
      router.refresh();
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <nav
      className="flex min-h-0 w-full shrink-0 flex-col border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:h-auto md:min-h-screen md:w-52 md:border-b-0 md:border-r"
      aria-label="작업 화면 이동"
    >
      <div className="hidden px-4 py-3 md:block">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          편집·설정
        </p>
        <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          조회는 왼쪽 관제실 첫 화면에서 먼저 하세요.
        </p>
      </div>
      <ul className="flex flex-row gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-visible md:px-2 md:pb-4">
        {links.map(({ href, label, title }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="min-w-0 shrink-0 md:shrink">
              <Link
                href={href}
                title={title}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors md:text-sm ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
              {href === "/" ? (
                <div className="mt-2 hidden md:block">
                  <SidebarMemoPad />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {showDemoLogout ? (
        <div className="mt-auto border-t border-zinc-200 p-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleDemoLogout}
            disabled={logoutBusy}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-left text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {logoutBusy ? "나가는 중…" : "데모 로그아웃"}
          </button>
        </div>
      ) : null}
    </nav>
  );
}
