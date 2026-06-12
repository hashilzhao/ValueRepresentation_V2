import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { generateFormalChoiceTrials } from "@/lib/study1/formal-trial-generator";

export async function POST(request: Request) {
  const { session_id } = await request.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id required." }, { status: 400 });
  }

  const db = getDb();
  const session = db
    .prepare("SELECT id, participant_id FROM experiment_sessions WHERE id = ?")
    .get(session_id) as { id: string; participant_id: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id = ?")
    .get(session_id) as { cnt: number };

  if (existing.cnt === 0) {
    const { summary } = generateFormalChoiceTrials(session_id, session.participant_id);
    logEvent(session_id, session.participant_id, "formal_trials_generated", { ...summary });
    return NextResponse.json({ initialized: true, ...summary });
  }

  return NextResponse.json({
    initialized: false,
    total: existing.cnt,
  });
}
