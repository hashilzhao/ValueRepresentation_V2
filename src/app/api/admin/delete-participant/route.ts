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

  const { participant_code } = await request.json();
  if (!participant_code) {
    return NextResponse.json({ error: "participant_code is required." }, { status: 400 });
  }

  const db = getDb();

  const participant = db
    .prepare("SELECT id FROM participants WHERE participant_code = ?")
    .get(participant_code) as { id: string } | undefined;

  if (!participant) {
    return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  }

  // Cascade deletes through foreign keys: sessions and event_logs are deleted automatically.
  db.prepare("DELETE FROM participants WHERE id = ?").run(participant.id);

  return NextResponse.json({ success: true });
}
