import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import {
  assignExternalValues,
  buildStimulusValueMap,
} from "@/lib/study1/value-assignment";

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

  // Check if already initialized.
  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM value_assignment WHERE session_id = ?")
    .get(session_id) as { cnt: number };

  if (existing.cnt === 0) {
    const { patternIndex, assignments } = assignExternalValues(session_id);

    const insert = db.prepare(`
      INSERT INTO value_assignment
        (id, session_id, participant_id, set_id, external_value, assignment_pattern_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();

    db.transaction(() => {
      for (const a of assignments) {
        insert.run(
          crypto.randomUUID(),
          session_id,
          session.participant_id,
          a.set_id,
          a.external_value,
          patternIndex,
          now,
          now,
        );
      }
    })();

    buildStimulusValueMap(session_id, session.participant_id);

    logEvent(session_id, session.participant_id, "study1_value_assignment_initialized", {
      pattern_index: patternIndex,
    });
  }

  const assignment = db
    .prepare("SELECT set_id, external_value FROM value_assignment WHERE session_id = ? ORDER BY set_id")
    .all(session_id) as { set_id: string; external_value: number }[];

  const map = db
    .prepare("SELECT set_id, stim_id, final_liking_rank, external_value FROM stimulus_value_map WHERE session_id = ? ORDER BY set_id, final_liking_rank")
    .all(session_id);

  const comp = db
    .prepare("SELECT attempt, correct FROM value_comprehension_checks WHERE session_id = ? ORDER BY attempt")
    .all(session_id) as { attempt: number; correct: number }[];

  return NextResponse.json({
    initialized: true,
    value_assignment: assignment,
    stimulus_value_map: map,
    comprehension_attempts: comp.length,
    comprehension_passed: comp.some((c) => c.correct === 1),
  });
}
