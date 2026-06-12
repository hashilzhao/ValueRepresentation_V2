import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import crypto from "crypto";

export async function POST(request: Request) {
  const body = await request.json();
  const { session_id, block_index, resource_insufficient, resource_confident, stressed, engaged } = body;

  if (!session_id || block_index == null) {
    return NextResponse.json({ error: "session_id and block_index required." }, { status: 400 });
  }

  const db = getDb();
  const session = db
    .prepare("SELECT id, participant_id FROM experiment_sessions WHERE id = ?")
    .get(session_id) as { id: string; participant_id: string } | undefined;
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  db.prepare(`
    INSERT INTO block_manipulation_checks
      (id, session_id, participant_id, block_index,
       resource_insufficient, resource_confident, stressed, engaged, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(), session_id, session.participant_id, block_index,
    resource_insufficient, resource_confident, stressed, engaged,
    new Date().toISOString(),
  );

  logEvent(session_id, session.participant_id, "block_manipulation_check_completed", {
    block_index,
  });

  return NextResponse.json({ success: true });
}
