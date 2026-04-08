import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "demo_auth";

export async function POST(request: NextRequest) {
  const expected = process.env.DEMO_PIN?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "데모 PIN이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const pin =
    body &&
    typeof body === "object" &&
    "pin" in body &&
    typeof (body as { pin: unknown }).pin === "string"
      ? (body as { pin: string }).pin.trim()
      : "";

  if (pin !== expected) {
    return NextResponse.json(
      { ok: false, error: "접근 코드가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "ok",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
