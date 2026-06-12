import { NextResponse } from "next/server";
import { saveStageGameResponse } from "@/lib/stage-game/response";
import { getDb } from "@/lib/db";
import { SM_CORRECT_POINTS, SM_INCORRECT_POINTS } from "@/lib/stage-game/config";

/**
 * POST /api/stage-game/submit-response
 * Save one trial response.
 *
 * For dot_comparison (is_manipulated_feedback=1): uses the pre-computed adaptive feedback from the trial.
 * For shape_matching and real dot_comparison (is_manipulated_feedback=0): uses true accuracy-based feedback.
 */
export async function POST(request: Request) {
  const body = await request.json();

  const db = getDb();

  // Read the trial to determine feedback mode.
  const trial = db
    .prepare(
      `SELECT is_manipulated_feedback, preset_feedback_direction, preset_feedback_points
       FROM stage_game_trials WHERE id = ?`,
    )
    .get(body.trial_id) as {
    is_manipulated_feedback: number;
    preset_feedback_direction: string | null;
    preset_feedback_points: number | null;
  } | undefined;

  if (!trial) {
    return NextResponse.json({ error: "Trial not found." }, { status: 404 });
  }

  // Read current balance from server DB — never trust the client.
  const session = db
    .prepare("SELECT resource_balance FROM experiment_sessions WHERE id = ?")
    .get(body.session_id) as { resource_balance: number } | undefined;

  const balanceBefore = session?.resource_balance ?? 0;
  const taskType: string = body.task_type;
  const isMissedOrTimeout = body.missed_response || body.timeout;

  let feedbackMode: "true" | "manipulated";
  let feedbackDirection: "gain" | "loss";
  let feedbackPoints: number;

  if (trial.is_manipulated_feedback === 0) {
    // ── Real (accuracy-based) feedback ────────────────────────
    feedbackMode = "true";

    if (isMissedOrTimeout) {
      feedbackDirection = "loss";
      feedbackPoints = taskType === "shape_matching" ? SM_INCORRECT_POINTS : 2;
    } else if (body.accuracy === 1) {
      feedbackDirection = "gain";
      feedbackPoints = taskType === "shape_matching" ? SM_CORRECT_POINTS : 2;
    } else {
      feedbackDirection = "loss";
      feedbackPoints = taskType === "shape_matching" ? SM_INCORRECT_POINTS : 2;
    }
  } else {
    // ── Manipulated (preset adaptive) feedback ────────────────
    feedbackMode = "manipulated";

    if (isMissedOrTimeout) {
      // Timeout/miss: override with penalty.
      feedbackDirection = "loss";
      feedbackPoints = 2;
    } else {
      // Use the pre-computed preset feedback stored on the trial.
      feedbackDirection = (trial.preset_feedback_direction ?? "gain") as "gain" | "loss";
      feedbackPoints = trial.preset_feedback_points ?? 1;
    }
  }

  const result = saveStageGameResponse({
    sessionId: body.session_id,
    participantId: body.participant_id,
    trialId: body.trial_id,
    globalTrialIndex: body.global_trial_index,
    taskType: taskType as "dot_comparison" | "shape_matching" | "dot_estimation",
    stimulusPayload: body.stimulus_payload,
    correctAnswer: body.correct_answer,
    response: body.response ?? null,
    accuracy: body.accuracy ?? null,
    rtMs: body.rt_ms ?? null,
    missedResponse: body.missed_response ?? false,
    timeout: body.timeout ?? false,
    feedbackMode,
    feedbackDirection,
    feedbackPoints,
    balanceBefore,
  });

  return NextResponse.json({
    success: true,
    balance_after: result.balanceAfter,
    feedback_direction: result.actualFeedbackDirection,
    feedback_points: result.actualFeedbackPoints,
    feedback_mode: result.actualFeedbackMode,
  });
}
