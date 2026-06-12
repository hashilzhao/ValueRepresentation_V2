import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { nextStage } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import { saveChoiceResponse } from "@/lib/study1/formal-response";

export async function POST(request: Request) {
  const body = await request.json();

  saveChoiceResponse({
    sessionId: body.session_id,
    participantId: body.participant_id,
    formalTrialId: body.formal_trial_id,
    trialIndex: body.trial_index,
    trialType: body.trial_type,
    leftStimId: body.left_stim_id,
    rightStimId: body.right_stim_id,
    leftLikingRank: body.left_liking_rank,
    rightLikingRank: body.right_liking_rank,
    leftExternalValue: body.left_external_value,
    rightExternalValue: body.right_external_value,
    deltaLiking: body.delta_liking,
    deltaValue: body.delta_value,
    responseSide: body.response_side ?? null,
    chosenStimId: body.chosen_stim_id ?? null,
    responseMethod: body.response_method ?? null,
    rtMs: body.rt_ms ?? null,
    timeout: body.timeout ?? false,
  });

  const db = getDb();

  // Check completion.
  const total = db
    .prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id = ?")
    .get(body.session_id) as { cnt: number };
  const done = db
    .prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id = ?")
    .get(body.session_id) as { cnt: number };

  if (done.cnt >= total.cnt && total.cnt > 0) {
    const session = db
      .prepare("SELECT id, participant_id, current_stage FROM experiment_sessions WHERE id = ?")
      .get(body.session_id) as { id: string; participant_id: string; current_stage: string };

    logEvent(body.session_id, session.participant_id, "study1_formal_choice_completed", {
      total: done.cnt,
    });

    const next = nextStage(session.current_stage as Stage);
    if (next) {
      db.prepare("UPDATE experiment_sessions SET current_stage = ? WHERE id = ?")
        .run(next, body.session_id);
      logEvent(body.session_id, session.participant_id, "stage.advanced", {
        from: session.current_stage,
        to: next,
      });
    }

    return NextResponse.json({
      success: true,
      completed: true,
      total: done.cnt,
      advance_to: next,
    });
  }

  return NextResponse.json({
    success: true,
    completed: false,
    total: total.cnt,
    done: done.cnt,
  });
}
