import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { nextStage } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import {
  saveValueComprehensionAttempt,
  getComprehensionFlag,
} from "@/lib/study1/value-assignment";

const CORRECT_ANSWER = "B";

export async function POST(request: Request) {
  const { session_id, selected_answer } = await request.json();

  if (!session_id || !selected_answer) {
    return NextResponse.json({ error: "session_id and selected_answer required." }, { status: 400 });
  }

  const db = getDb();
  const session = db
    .prepare("SELECT id, participant_id, current_stage FROM experiment_sessions WHERE id = ?")
    .get(session_id) as { id: string; participant_id: string; current_stage: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { attempts } = getComprehensionFlag(session_id);
  const attemptNum = attempts + 1;
  const correct = selected_answer.toUpperCase() === CORRECT_ANSWER;

  saveValueComprehensionAttempt(session_id, session.participant_id, selected_answer, correct, attemptNum);

  if (correct) {
    logEvent(session_id, session.participant_id, "value_comprehension_completed", {
      attempt: attemptNum,
      correct: true,
    });

    logEvent(session_id, session.participant_id, "study1_value_assignment_completed", {});

    // Advance stage.
    const next = nextStage(session.current_stage as Stage);
    if (next) {
      db.prepare("UPDATE experiment_sessions SET current_stage = ? WHERE id = ?")
        .run(next, session_id);
      logEvent(session_id, session.participant_id, "stage.advanced", {
        from: session.current_stage,
        to: next,
      });
    }

    return NextResponse.json({
      correct: true,
      attempts: attemptNum,
      advance_to: next,
      done: true,
    });
  }

  // Wrong answer.
  const maxAttempts = 2;
  if (attemptNum >= maxAttempts) {
    logEvent(session_id, session.participant_id, "value_comprehension_flagged", {
      attempts: attemptNum,
    });

    logEvent(session_id, session.participant_id, "study1_value_assignment_completed", {});

    // Still advance — flag but don't block.
    const next = nextStage(session.current_stage as Stage);
    if (next) {
      db.prepare("UPDATE experiment_sessions SET current_stage = ? WHERE id = ?")
        .run(next, session_id);
      logEvent(session_id, session.participant_id, "stage.advanced", {
        from: session.current_stage,
        to: next,
      });
    }

    return NextResponse.json({
      correct: false,
      attempts: attemptNum,
      advance_to: next,
      done: true,
      flagged: true,
    });
  }

  return NextResponse.json({
    correct: false,
    attempts: attemptNum,
    remaining_attempts: maxAttempts - attemptNum,
    hint: "图形旁边的价值点数是该图形在任务中的外部兑换价值，不是你需要支付的价格。",
    done: false,
  });
}
