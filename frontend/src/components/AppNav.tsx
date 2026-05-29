"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useState } from "react";

type NavLink = {
  href: string;
  label: string;
  title: string;
  dividerAfter?: boolean;
};

const links: NavLink[] = [
  { href: "/", label: "관제실", title: "PC 관제판(첫 화면)" },
  { href: "/company", label: "회사", title: "오키브스 회사 정보·매출·연락처 대시보드" },
  { href: "/chatbot", label: "챗봇", title: "데이터 자연어 질의(/api/ops/ask)" },
  { href: "/memo", label: "메모", title: "메모장 시트 목록·추가" },
  { href: "/calendar", label: "캘린더", title: "월·주·일 일정(시트 연동)" },
  { href: "/platform-matrix", label: "플랫폼", title: "작품×플랫폼 연동 매트릭스" },
  { href: "/personnel", label: "인물별", title: "직원별 업무 대시보드·인물 보드" },
  { href: "/milestones", label: "마일스톤", title: "주요 일정 타임라인·간트(로컬 저장)" },
  {
    href: "/weekly-agenda",
    label: "주간아젠다",
    title: "대분류 병합 표(로컬 저장)",
    dividerAfter: true,
  },
  { href: "/announcement-date", label: "발표일 DB", title: "발표 일정" },
  { href: "/works", label: "작품관리 DB", title: "작품관리 마스터(분류·작품명·사이트)" },
  { href: "/progress", label: "지속진행 DB", title: "지속 진행 현황" },
  { href: "/launching", label: "런칭정리 DB", title: "런칭 일정·정리" },
  { href: "/contracts", label: "계약정리 DB", title: "계약 관련 정리" },
  { href: "/tasks", label: "업무정리 DB", title: "업무정리 시트 작업" },
  { href: "/upload-rows", label: "업로드정리 DB", title: "업로드정리 시트 작업" },
  { href: "/platforms", label: "플랫폼정리 DB", title: "플랫폼정리 시트 작업" },
];

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
      <ul className="flex max-md:flex-wrap max-md:overflow-x-auto flex-row gap-1 px-2 py-2 md:flex-col md:flex-nowrap md:overflow-visible md:px-2 md:pb-4">
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Fragment key={link.href}>
              <li className="min-w-0 shrink-0 md:shrink">
                <Link
                  href={link.href}
                  title={link.title}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors md:text-sm ${
                    active
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
              {link.dividerAfter ? (
                <li
                  className="mx-1 w-full shrink-0 basis-full py-1 md:basis-auto"
                  aria-hidden
                >
                  <hr className="border-zinc-200 dark:border-zinc-700" />
                </li>
              ) : null}
            </Fragment>
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
