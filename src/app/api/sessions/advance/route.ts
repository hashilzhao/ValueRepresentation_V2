import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { nextStage } from "@/lib/stages";
import type { Stage } from "@/lib/stages";

export async function POST(request: Request) {
  const { session_id, event_type, event_data } = await request.json();

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id is required." },
      { status: 400 },
    );
  }

  const db = getDb();

  const session = db
    .prepare(
      `SELECT id, participant_id, current_stage, status, group_label
       FROM experiment_sessions WHERE id = ?`,
    )
    .get(session_id) as
    | {
        id: string;
        participant_id: string;
        current_stage: string;
        status: string;
        group_label: string;
      }
    | undefined;

  if (!session) {
    return NextResponse.json(
      { error: "Session not found." },
      { status: 404 },
    );
  }

  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: "Session is not in progress." },
      { status: 400 },
    );
  }

  const current = session.current_stage as Stage;
  const next = nextStage(current);

  if (!next) {
    return NextResponse.json(
      { error: "No further stages.", current_stage: current },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const isComplete = next === "complete";
  const newStatus = isComplete ? "completed" : "in_progress";

  db.prepare(
    `UPDATE experiment_sessions
     SET current_stage = ?, status = ?, completed_at = ?
     WHERE id = ?`,
  ).run(next, newStatus, isComplete ? now : null, session_id);

  // Log the generic stage transition.
  logEvent(session_id, session.participant_id, "stage.advanced", {
    from: current,
    to: next,
  });

  // If the caller provided a stage-specific event (e.g. "relative_resource_feedback_completed"),
  // log it alongside the transition.
  if (event_type) {
    logEvent(session_id, session.participant_id, event_type, {
      from_stage: current,
      group: session.group_label,
      ...(event_data ?? {}),
    });
  }

  return NextResponse.json({
    session_id,
    current_stage: next,
    status: newStatus,
    completed: isComplete,
  });
}
