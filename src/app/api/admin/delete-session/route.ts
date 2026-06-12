import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  // Auth check.
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { session_id } = await request.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id is required." }, { status: 400 });
  }

  const db = getDb();

  const session = db
    .prepare("SELECT id FROM experiment_sessions WHERE id = ?")
    .get(session_id) as { id: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Event logs cascade-delete via FK. Participant is NOT deleted — only the session.
  db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(session.id);

  return NextResponse.json({ success: true });
}
