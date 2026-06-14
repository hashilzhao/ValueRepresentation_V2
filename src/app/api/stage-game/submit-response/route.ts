import { NextResponse } from "next/server";
import { saveStageGameResponse } from "@/lib/stage-game/response";
import { getDb } from "@/lib/db";
import { computeDotComparisonFeedback } from "@/lib/stage-game/trial-generator";
import {
  SM_CORRECT_POINTS,
  SM_INCORRECT_POINTS,
  TOTAL_TRIALS,
  RESOURCE_TASK_CONFIG,
} from "@/lib/stage-game/config";
import type { Group } from "@/lib/stages";

/**
 * POST /api/stage-game/submit-response
 * Save one trial response.
 *
 * For dot_comparison (is_manipulated_feedback=1): computes manipulated feedback
 *   ADAPTIVELY at response time based on the CURRENT balance.  This ensures the
 *   balance stays within the designed range (scarcity 4–12 / abundance 100–130)
 *   regardless of timeouts or other deviations — balance control is the highest
 *   priority.
 *
 * For shape_matching and real dot_comparison (is_manipulated_feedback=0):
 *   uses true accuracy-based feedback.
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

  // Read current balance AND group from server DB — never trust the client.
  const session = db
    .prepare("SELECT resource_balance, group_label FROM experiment_sessions WHERE id = ?")
    .get(body.session_id) as { resource_balance: number; group_label: string } | undefined;

  const balanceBefore = session?.resource_balance ?? 0;
  const group = (session?.group_label ?? "scarcity") as Group;
  const config = RESOURCE_TASK_CONFIG[group];
  const taskType: string = body.task_type;
  const isMissedOrTimeout = body.missed_response || body.timeout;
  const trialIndex: number = body.global_trial_index ?? 0;

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
    // ── Manipulated feedback — computed ADAPTIVELY at response time ─
    // Priority: keep balance within designed range at all times.
    // Uses the CURRENT balance (not pre-computed presets) to compensate
    // for timeouts, refreshes, or any balance drift.
    feedbackMode = "manipulated";

    if (isMissedOrTimeout) {
      feedbackDirection = "loss";
      feedbackPoints = 2;
    } else {
      const adaptive = computeDotComparisonFeedback(
        group,
        balanceBefore,
        config,
        trialIndex,
        TOTAL_TRIALS,
      );
      feedbackDirection = adaptive.direction;
      feedbackPoints = adaptive.points;
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
