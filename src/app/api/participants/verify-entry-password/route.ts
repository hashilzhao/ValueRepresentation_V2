import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { cookies } from "next/headers";

const ENTRY_PASSWORD =
  process.env.PARTICIPANT_ENTRY_PASSWORD || "zxzx123456";
const ACCESS_SECRET = new TextEncoder().encode(
  process.env.PARTICIPANT_ACCESS_SECRET || "study1-participant-access-secret",
);

const COOKIE_NAME = "participant_access";
const MAX_AGE = 12 * 60 * 60; // 12 hours

export async function POST(request: Request) {
  const { password } = await request.json();

  if (!password || password !== ENTRY_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: "密码不正确，请联系主试。" },
      { status: 401 },
    );
  }

  const token = await new SignJWT({ access: "participant" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(ACCESS_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}
