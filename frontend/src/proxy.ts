import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEMO_COOKIE = "demo_auth";

function isDemoGated(): boolean {
  const pin = process.env.DEMO_PIN;
  return Boolean(pin && pin.trim() !== "");
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/demo-login" || pathname.startsWith("/demo-login/")) {
    return true;
  }
  if (pathname.startsWith("/_next/")) {
    return true;
  }
  if (pathname === "/favicon.ico") {
    return true;
  }
  if (/\.(svg|ico|png|jpe?g|gif|webp|txt|xml|webmanifest)$/i.test(pathname)) {
    return true;
  }
  if (
    pathname === "/api/demo-auth/login" ||
    pathname === "/api/demo-auth/logout"
  ) {
    return true;
  }
  return false;
}

function hasDemoCookie(request: NextRequest): boolean {
  return request.cookies.get(DEMO_COOKIE)?.value === "ok";
}

export function proxy(request: NextRequest) {
  if (!isDemoGated()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (hasDemoCookie(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/ops") || pathname === "/api/ops") {
    return NextResponse.json(
      { error: "데모 접근 코드가 필요합니다." },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/demo-login";
  url.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
