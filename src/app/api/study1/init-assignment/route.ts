import { NextResponse } from "next/server";
import { initializeStudy1StimulusAssignment } from "@/lib/study1/sampling";
import { logEvent } from "@/lib/db/event-log";

export async function POST(request: Request) {
  const { session_id } = await request.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id required." }, { status: 400 });
  }

  const result = initializeStudy1StimulusAssignment(session_id);

  // Log only on first initialization (detected by no previous log).
  const { getDb } = await import("@/lib/db");
  const db = getDb();
  const alreadyLogged = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM event_logs WHERE session_id = ? AND event_type = 'study1_assignment_initialized'",
    )
    .get(session_id) as { cnt: number };

  if (alreadyLogged.cnt === 0) {
    const session = db
      .prepare("SELECT participant_id FROM experiment_sessions WHERE id = ?")
      .get(session_id) as { participant_id: string };
    await logEvent(session_id, session.participant_id, "study1_assignment_initialized", {
      total_selected: result.selected.length,
      total_sets: 5,
      seed: result.seed,
    });
  }

  // Don't expose internal metadata to participant.
  return NextResponse.json({
    initialized: true,
    total_selected: result.selected.length,
    total_sets: 5,
  });
}
