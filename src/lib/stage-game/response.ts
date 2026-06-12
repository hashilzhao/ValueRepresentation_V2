import crypto from "crypto";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import type { FeedbackDirection, FeedbackMode, TaskType } from "./types";
import type { StimulusPayload } from "./types";
import {
  SM_CORRECT_POINTS,
  SM_INCORRECT_POINTS,
} from "./config";

export interface SaveResponseInput {
  sessionId: string;
  participantId: string;
  trialId: string;
  globalTrialIndex: number;
  taskType: TaskType;
  stimulusPayload: StimulusPayload;
  correctAnswer: string;
  response: string | null;
  accuracy: number | null;
  rtMs: number | null;
  missedResponse: boolean;
  timeout: boolean;
  feedbackMode: FeedbackMode;
  feedbackDirection: FeedbackDirection;
  feedbackPoints: number;
  balanceBefore: number;
}

/**
 * Save a single trial response in a transaction:
 * 1. Insert into stage_game_responses (with feedback_mode and stimulus details)
 * 2. Update experiment_sessions.resource_balance
 * 3. Log stage_game_trial_completed event
 *
 * For shape_matching: if feedback_mode="true", overrides direction/points from
 * the real accuracy (correct=+2, incorrect/timeout=-2).
 * For dot_comparison: feedback_mode="manipulated", uses the provided adaptive values.
 */
export function saveStageGameResponse(input: SaveResponseInput): {
  balanceAfter: number;
  actualFeedbackDirection: FeedbackDirection;
  actualFeedbackPoints: number;
  actualFeedbackMode: FeedbackMode;
} {
  const db = getDb();

  // If a response for this trial already exists, return its data.
  const existing = db
    .prepare("SELECT balance_after FROM stage_game_responses WHERE session_id = ? AND global_trial_index = ?")
    .get(input.sessionId, input.globalTrialIndex) as { balance_after: number } | undefined;
  if (existing) {
    return {
      balanceAfter: existing.balance_after,
      actualFeedbackDirection: input.feedbackDirection,
      actualFeedbackPoints: input.feedbackPoints,
      actualFeedbackMode: input.feedbackMode,
    };
  }

  // Resolve feedback: for shape_matching with true feedback, override based on accuracy.
  let effectiveDirection = input.feedbackDirection;
  let effectivePoints = input.feedbackPoints;
  let effectiveMode = input.feedbackMode;

  const isMissedOrTimeout = input.missedResponse || input.timeout;

  // Real feedback: shape_matching AND real dot_comparison (accuracy-based).
  if ((input.taskType === "shape_matching" || input.taskType === "dot_comparison") && input.feedbackMode === "true") {
    if (isMissedOrTimeout) {
      effectiveDirection = "loss";
      effectivePoints = input.taskType === "shape_matching" ? SM_INCORRECT_POINTS : 2;
    } else if (input.accuracy === 1) {
      effectiveDirection = "gain";
      effectivePoints = input.taskType === "shape_matching" ? SM_CORRECT_POINTS : 2;
    } else {
      effectiveDirection = "loss";
      effectivePoints = input.taskType === "shape_matching" ? SM_INCORRECT_POINTS : 2;
    }
    effectiveMode = "true";
  }

  // For dot_comparison with manipulated feedback: timeout/missed still forces loss.
  if (input.taskType === "dot_comparison" && input.feedbackMode === "manipulated" && isMissedOrTimeout) {
    effectiveDirection = "loss";
    effectivePoints = 2;
    effectiveMode = "manipulated";
  }

  // Also handle any other task type's timeout/missed.
  if (isMissedOrTimeout && input.taskType !== "dot_comparison" && input.taskType !== "shape_matching") {
    effectiveDirection = "loss";
    effectivePoints = 2;
  }

  const balanceAfter =
    effectiveDirection === "gain"
      ? input.balanceBefore + effectivePoints
      : input.balanceBefore - effectivePoints;

  const responseId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Extract stimulus detail fields for dot_comparison.
  let dotCountLeft: number | null = null;
  let dotCountRight: number | null = null;
  let correctSide: string | null = null;

  if (input.stimulusPayload.type === "dot_comparison") {
    dotCountLeft = input.stimulusPayload.left_dots;
    dotCountRight = input.stimulusPayload.right_dots;
    correctSide = input.stimulusPayload.answer === "F" ? "left" : "right";
  }

  const insert = db.prepare(`
    INSERT INTO stage_game_responses
      (id, session_id, block_index, trial_index, global_trial_index,
       task_type, stimulus_payload, correct_answer, response, accuracy,
       rt_ms, missed_response, timeout,
       feedback_mode,
       preset_feedback_direction, preset_feedback_points,
       balance_before, balance_after,
       dot_count_left, dot_count_right, correct_side,
       created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateBalance = db.prepare(
    `UPDATE experiment_sessions SET resource_balance = ? WHERE id = ?`,
  );

  const transaction = db.transaction(() => {
    insert.run(
      responseId,
      input.sessionId,
      0, // block_index — no longer used (continuous task)
      input.globalTrialIndex, // trial_index = global (continuous)
      input.globalTrialIndex,
      input.taskType,
      JSON.stringify(input.stimulusPayload),
      input.correctAnswer,
      input.response,
      input.accuracy,
      input.rtMs,
      input.missedResponse ? 1 : 0,
      input.timeout ? 1 : 0,
      effectiveMode,
      effectiveDirection,
      effectivePoints,
      input.balanceBefore,
      balanceAfter,
      dotCountLeft,
      dotCountRight,
      correctSide,
      now,
    );
    updateBalance.run(balanceAfter, input.sessionId);
    logEvent(input.sessionId, input.participantId, "stage_game_trial_completed", {
      trial: input.globalTrialIndex,
      global: input.globalTrialIndex,
      task_type: input.taskType,
      accuracy: input.accuracy,
      rt_ms: input.rtMs,
      feedback_mode: effectiveMode,
      feedback: effectiveDirection,
      points: effectivePoints,
      balance_before: input.balanceBefore,
      balance_after: balanceAfter,
    });
  });

  transaction();
  return {
    balanceAfter,
    actualFeedbackDirection: effectiveDirection,
    actualFeedbackPoints: effectivePoints,
    actualFeedbackMode: effectiveMode,
  };
}
