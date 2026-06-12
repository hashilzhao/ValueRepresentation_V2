import { NextResponse } from "next/server";
import { signToken, setSessionCookie, validateAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const valid = await validateAdmin(email, password);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const token = await signToken(email);
  await setSessionCookie(token);

  return NextResponse.json({ success: true });
}
