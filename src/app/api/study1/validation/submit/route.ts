import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { nextStage } from "@/lib/stages";
import { incrementCalibrationAttempt } from "@/lib/study1/calibration-scoring";
import type { Stage } from "@/lib/stages";
import crypto from "crypto";

const VALIDATION_CONSISTENCY_THRESHOLD = 0.85;

export async function POST(request: Request) {
  const body = await request.json();
  const db = getDb();

  const session = db.prepare(
    "SELECT id, participant_id FROM experiment_sessions WHERE id = ?"
  ).get(body.session_id) as { id: string; participant_id: string } | undefined;
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // Save response.
  const consistent = body.validation_type === "different_rank"
    ? (body.expected_choice === body.response_side ? 1 : 0)
    : null;

  db.prepare(`
    INSERT OR IGNORE INTO liking_validation_responses
      (id, session_id, participant_id, trial_id, trial_index, validation_type,
       response_side, chosen_stim_id, rt_ms, timeout, response_method,
       consistent_with_ranking, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    crypto.randomUUID(), session.id, session.participant_id,
    body.trial_id, body.trial_index, body.validation_type,
    body.response_side, body.chosen_stim_id, body.rt_ms,
    body.timeout ? 1 : 0, body.response_method ?? "keyboard",
    consistent, new Date().toISOString(),
  );

  // Check completion.
  const total = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM liking_validation_trials WHERE session_id = ?"
  ).get(session.id) as { cnt: number }).cnt;
  const done = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id = ?"
  ).get(session.id) as { cnt: number }).cnt;

  if (done >= total && total > 0) {
    // Compute quality.
    const diffResp = db.prepare(
      `SELECT consistent_with_ranking FROM liking_validation_responses lvr
       JOIN liking_validation_trials lvt ON lvt.id = lvr.trial_id
       WHERE lvr.session_id = ? AND lvt.validation_type = 'different_rank'`
    ).all(session.id) as { consistent_with_ranking: number | null }[];

    const nonNull = diffResp.filter((r) => r.consistent_with_ranking != null);
    const rate = nonNull.length > 0
      ? nonNull.filter((r) => r.consistent_with_ranking === 1).length / nonNull.length
      : null;

    const needsRerank = rate != null && rate < VALIDATION_CONSISTENCY_THRESHOLD;
    const toRate = total > 0
      ? (db.prepare(
          "SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id = ? AND timeout = 1"
        ).get(session.id) as { cnt: number }).cnt / total
      : null;

    db.prepare(`
      INSERT OR REPLACE INTO liking_validation_quality
        (id, session_id, participant_id, different_rank_consistency_rate,
         same_rank_bias_flag, timeout_rate, mean_rt_ms,
         validation_passed, needs_rerank, created_at, updated_at)
      VALUES (?,?,?,?,0,?,NULL,?,?,?,?)
    `).run(
      crypto.randomUUID(), session.id, session.participant_id,
      rate, toRate,
      rate != null && rate >= VALIDATION_CONSISTENCY_THRESHOLD ? 1 : 0,
      needsRerank ? 1 : 0,
      new Date().toISOString(), new Date().toISOString(),
    );

    logEvent(session.id, session.participant_id, "study1_liking_validation_completed", {
      consistency: rate, needs_rerank: needsRerank,
    });

    const passed = rate != null && rate >= VALIDATION_CONSISTENCY_THRESHOLD;

    if (!passed) {
      // ─── Validation failed — retry calibration (preserving original 25 stimuli) ──
      //
      // PRESERVED (must NOT be cleared — these define the participant's stimulus set):
      //   - subject_selected_stimuli  (the 25 originally sampled images)
      //   - subject_set_assignment    (the 5 hidden sets with 5 images each)
      //
      // CLEARED (rebuilt during retry from the preserved set assignment):
      //   - calibration_trials        (phases 4A / 4B / 4C will be regenerated)
      //   - calibration_responses     (all pairwise judgments)
      //   - within_set_stable         (V2 first stable table)
      //   - cross_set_orthogonalized  (V2 second orthogonalized table)
      //   - liking_map                (synced from orthogonalized at end of retry)
      //   - liking_validation_trials  (validation pairs depend on new ranks)
      //   - liking_validation_responses
      //   - liking_validation_quality
      //   - calibration_quality       (recomputed after retry)
      //
      // ATTEMPT TRACKING:
      //   calibration_attempt_index is incremented so each retry is isolated
      //   in within_set_stable / cross_set_orthogonalized.
      const newAttempt = incrementCalibrationAttempt(session.id);

      // Delete calibration and validation data for a clean restart.
      // Phase 4A will auto-generate from subject_set_assignment on next page load.
      db.prepare("DELETE FROM calibration_trials WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM calibration_responses WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM within_set_stable WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM cross_set_orthogonalized WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM liking_map WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM liking_validation_trials WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM liking_validation_responses WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM liking_validation_quality WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM calibration_quality WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM stimulus_elo WHERE session_id = ?").run(session.id);
      db.prepare("DELETE FROM calibration_stability WHERE session_id = ?").run(session.id);

      // Reset to the calibration stage (Phase 4A).
      db.prepare(
        "UPDATE experiment_sessions SET current_stage = ? WHERE id = ?"
      ).run("study1_liking_ranking", session.id);

      logEvent(session.id, session.participant_id, "calibration_retry_triggered", {
        attempt: newAttempt,
        previous_attempt: newAttempt - 1,
        previous_consistency: rate,
        reason: "validation_consistency_below_threshold",
        preserved_stimuli: "original 25 from subject_selected_stimuli + subject_set_assignment",
        cleared_tables: [
          "calibration_trials", "calibration_responses",
          "within_set_stable", "cross_set_orthogonalized", "liking_map",
          "liking_validation_trials", "liking_validation_responses",
          "liking_validation_quality", "calibration_quality",
        ],
      });

      return NextResponse.json({
        success: true, completed: true, validation_passed: false,
        needs_rerank: true, consistency: rate,
        retry_attempt: newAttempt,
        message: "为了让后续任务更准确地匹配你的个人偏好，请你再完成一轮简短的图形偏好确认。",
      });
    }

    // Passed — advance stage.
    const current = db.prepare(
      "SELECT current_stage FROM experiment_sessions WHERE id = ?"
    ).get(session.id) as { current_stage: string };
    const next = nextStage(current.current_stage as Stage);
    if (next) {
      db.prepare("UPDATE experiment_sessions SET current_stage = ? WHERE id = ?")
        .run(next, session.id);
      logEvent(session.id, session.participant_id, "stage.advanced", {
        from: current.current_stage, to: next,
      });
    }
    return NextResponse.json({
      success: true, completed: true, validation_passed: true, advance_to: next,
    });
  }

  return NextResponse.json({ success: true, completed: false, total, done });
}
