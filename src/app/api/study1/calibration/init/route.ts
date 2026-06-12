import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { initializeStudy1StimulusAssignment } from "@/lib/study1/sampling";
import { CalibrationOrchestrator } from "@/lib/study1/calibration-orchestrator";

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

  // Ensure stimulus assignment exists.
  initializeStudy1StimulusAssignment(session_id);

  // Use orchestrator to ensure all phases are generated.
  const orchestrator = new CalibrationOrchestrator(session_id, session.participant_id);
  const state = orchestrator.ensurePhases();

  return NextResponse.json(state);
}
