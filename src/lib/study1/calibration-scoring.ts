import crypto from "crypto";
import { getDb } from "@/lib/db";
import type { CalibrationResponse, CalibrationQuality, WithinSetStableEntry, CrossSetOrthogonalizedEntry } from "./calibration-types";
import { inferWithinSetRanks, buildWithinSetStableTable, buildCrossSetOrthogonalizedTable } from "./calibration-generator";

/** Save a single calibration response. */
export function saveCalibrationResponse(
  input: CalibrationResponse,
): { phaseCompleted: string | null; totalInPhase: number; doneInPhase: number } {
  const db = getDb();

  const insert = db.prepare(`
    INSERT INTO calibration_responses
      (id, session_id, participant_id, trial_id, phase,
       left_stim_id, right_stim_id, response_side, chosen_stim_id,
       response_method, rt_ms, timeout, consistent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  insert.run(
    crypto.randomUUID(),
    input.session_id, input.participant_id, input.trial_id, input.phase,
    input.left_stim_id, input.right_stim_id, input.response_side,
    input.chosen_stim_id, input.response_method, input.rt_ms,
    input.timeout ? 1 : 0, input.consistent, now,
  );

  // Check which phase just completed.
  const phaseTotal = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = ?"
  ).get(input.session_id, input.phase) as { cnt: number }).cnt;

  const phaseDone = (db.prepare(
    `SELECT COUNT(*) AS cnt FROM calibration_responses cr
     JOIN calibration_trials ct ON ct.id = cr.trial_id
     WHERE cr.session_id = ? AND ct.phase = ?`
  ).get(input.session_id, input.phase) as { cnt: number }).cnt;

  const completed = phaseDone >= phaseTotal && phaseTotal > 0 ? input.phase : null;

  return { phaseCompleted: completed, totalInPhase: phaseTotal, doneInPhase: phaseDone };
}

/** Get current calibration attempt index. */
export function getCalibrationAttemptIndex(sessionId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT calibration_attempt_index FROM experiment_sessions WHERE id = ?"
  ).get(sessionId) as { calibration_attempt_index: number | null } | undefined;
  return row?.calibration_attempt_index ?? 0;
}

/** Increment calibration attempt index. */
export function incrementCalibrationAttempt(sessionId: string): number {
  const db = getDb();
  const current = getCalibrationAttemptIndex(sessionId);
  const next = current + 1;
  db.prepare("UPDATE experiment_sessions SET calibration_attempt_index = ? WHERE id = ?")
    .run(next, sessionId);
  return next;
}

// ─── Save within-set stable table ────────────────────────────

export function saveWithinSetStableTable(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): void {
  const db = getDb();
  const { entries } = buildWithinSetStableTable(sessionId, participantId, attemptIndex);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO within_set_stable
      (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id,
       image_url, original_within_rank, stable_within_rank, win_count,
       adjacent_retest_result, adjacent_consistency, tie_flag, ambiguity_flag,
       final_stable_rank, calibration_attempt_index, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const existingId = (sid: string) => {
    const row = db.prepare(
      "SELECT id FROM within_set_stable WHERE session_id = ? AND stim_id = ? AND calibration_attempt_index = ?"
    ).get(sessionId, sid, attemptIndex) as { id: string } | undefined;
    return row?.id ?? crypto.randomUUID();
  };

  db.transaction(() => {
    for (const e of entries) {
      upsert.run(
        existingId(e.stim_id), e.session_id, e.participant_id, e.set_id,
        e.stim_id, e.stimulus_pool_id, e.image_url,
        e.original_within_rank, e.stable_within_rank, e.win_count,
        e.adjacent_retest_result, e.adjacent_consistency,
        e.tie_flag, e.ambiguity_flag, e.final_stable_rank,
        e.calibration_attempt_index, e.created_at,
      );
    }
  })();
}

// ─── Save cross-set orthogonalized table ──────────────────────

export function saveCrossSetOrthogonalizedTable(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): void {
  const db = getDb();
  const { entries } = buildCrossSetOrthogonalizedTable(sessionId, participantId, attemptIndex);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO cross_set_orthogonalized
      (id, session_id, participant_id, stim_id, set_id,
       original_liking_rank, calibrated_liking_rank,
       shift_direction, shift_rate, shift_threshold_met,
       shift_confidence, evidence_summary,
       source_comparisons_count, wins_against_adjacent_level,
       losses_to_adjacent_level, calibration_attempt_index, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const existingId = (sid: string) => {
    const row = db.prepare(
      "SELECT id FROM cross_set_orthogonalized WHERE session_id = ? AND stim_id = ? AND calibration_attempt_index = ?"
    ).get(sessionId, sid, attemptIndex) as { id: string } | undefined;
    return row?.id ?? crypto.randomUUID();
  };

  db.transaction(() => {
    for (const e of entries) {
      upsert.run(
        existingId(e.stim_id), e.session_id, e.participant_id,
        e.stim_id, e.set_id,
        e.original_liking_rank, e.calibrated_liking_rank,
        e.shift_direction, e.shift_rate, e.shift_threshold_met,
        e.shift_confidence, e.evidence_summary,
        e.source_comparisons_count, e.wins_against_adjacent_level,
        e.losses_to_adjacent_level, e.calibration_attempt_index, e.created_at,
      );
    }
  })();
}

// ─── Populate liking_map from second table for downstream compat ──

export function syncLikingMapFromOrthogonalized(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): void {
  const db = getDb();
  const rows = db.prepare(
    `SELECT stim_id, set_id, calibrated_liking_rank, original_liking_rank
     FROM cross_set_orthogonalized
     WHERE session_id = ? AND calibration_attempt_index = ?`
  ).all(sessionId, attemptIndex) as {
    stim_id: string; set_id: string; calibrated_liking_rank: number; original_liking_rank: number;
  }[];

  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO liking_map
      (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id,
       preliminary_liking_rank, final_liking_rank, win_count_within_set,
       total_pairwise_wins, total_pairwise_losses, preference_score,
       tie_flag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, ?, ?)
  `);

  db.transaction(() => {
    for (const r of rows) {
      const poolId = db.prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?").get(r.stim_id) as { id: string };
      const existing = db.prepare(
        "SELECT id FROM liking_map WHERE session_id = ? AND stim_id = ?"
      ).get(sessionId, r.stim_id) as { id: string } | undefined;
      upsert.run(
        existing?.id ?? crypto.randomUUID(),
        sessionId, participantId, r.set_id, r.stim_id, poolId.id,
        r.original_liking_rank, r.calibrated_liking_rank,
        now, now,
      );
    }
  })();
}

/**
 * V3: Populate liking_map from stimulus_elo + within_set_stable.
 * Replaces syncLikingMapFromOrthogonalized in the new Elo-based flow.
 */
export function syncLikingMapFromElo(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): void {
  const db = getDb();

  // Read Elo scores, cross-set calibrated ranks (final), and within-set original ranks.
  const rows = db.prepare(
    `SELECT se.stim_id, se.set_id, se.elo_score,
            cso.calibrated_liking_rank, cso.original_liking_rank
     FROM stimulus_elo se
     LEFT JOIN cross_set_orthogonalized cso
       ON cso.session_id = se.session_id
       AND cso.stim_id = se.stim_id
       AND cso.calibration_attempt_index = se.calibration_attempt_index
     WHERE se.session_id = ? AND se.calibration_attempt_index = ?`
  ).all(sessionId, attemptIndex) as {
    stim_id: string; set_id: string; elo_score: number;
    calibrated_liking_rank: number | null; original_liking_rank: number | null;
  }[];

  if (rows.length === 0) return;

  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO liking_map
      (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id,
       preliminary_liking_rank, final_liking_rank, elo_score,
       win_count_within_set, total_pairwise_wins, total_pairwise_losses,
       preference_score, tie_flag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, ?, ?)
  `);

  db.transaction(() => {
    for (const r of rows) {
      const poolId = db.prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?").get(r.stim_id) as { id: string } | undefined;
      if (!poolId) continue;
      const existing = db.prepare(
        "SELECT id FROM liking_map WHERE session_id = ? AND stim_id = ?"
      ).get(sessionId, r.stim_id) as { id: string } | undefined;

      upsert.run(
        existing?.id ?? crypto.randomUUID(),
        sessionId, participantId, r.set_id, r.stim_id, poolId.id,
        r.original_liking_rank ?? 0,          // preliminary_liking_rank (within-set)
        r.calibrated_liking_rank ?? 0,        // final_liking_rank (cross-set calibrated)
        r.elo_score,
        now, now,
      );
    }
  })();
}

// ─── Compute quality metrics ──────────────────────────────────

export function computeCalibrationQuality(
  sessionId: string,
  participantId: string,
): CalibrationQuality {
  const db = getDb();

  const within = db.prepare(
    `SELECT cr.consistent, cr.timeout, cr.rt_ms
     FROM calibration_responses cr
     JOIN calibration_trials ct ON ct.id = cr.trial_id
     WHERE cr.session_id = ? AND ct.phase = 'within_full_pair'`
  ).all(sessionId) as { consistent: number | null; timeout: number; rt_ms: number | null }[];

  const allResp = db.prepare(
    `SELECT cr.timeout, cr.rt_ms FROM calibration_responses cr WHERE cr.session_id = ?`
  ).all(sessionId) as { timeout: number; rt_ms: number | null }[];

  const totalResponses = allResp.length;
  const timeouts = allResp.filter((r) => r.timeout).length;

  const withinCons = within.filter((r) => r.consistent !== null);
  const withinConsistency = withinCons.length > 0
    ? withinCons.filter((r) => r.consistent === 1).length / withinCons.length
    : null;

  const rts = allResp.filter((r) => r.rt_ms != null).map((r) => r.rt_ms!);
  const meanRt = rts.length > 0 ? rts.reduce((a, b) => a + b, 0) / rts.length : null;

  return {
    session_id: sessionId,
    participant_id: participantId,
    within_set_consistency: withinConsistency,
    cross_set_anchor_consistency: null,
    cross_set_near_rank_consistency: null,
    cross_set_same_rank_bias_flag: false,
    tie_flag_count: 0,
    timeout_rate: totalResponses > 0 ? timeouts / totalResponses : null,
    mean_rt_ms: meanRt,
  };
}

export function saveCalibrationQuality(quality: CalibrationQuality): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO calibration_quality
      (id, session_id, participant_id,
       within_set_consistency, cross_set_anchor_consistency,
       cross_set_near_rank_consistency, cross_set_same_rank_bias_flag,
       tie_flag_count, timeout_rate, mean_rt_ms,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    (db.prepare("SELECT id FROM calibration_quality WHERE session_id = ?").get(quality.session_id) as any)?.id ?? crypto.randomUUID(),
    quality.session_id, quality.participant_id,
    quality.within_set_consistency, quality.cross_set_anchor_consistency,
    quality.cross_set_near_rank_consistency, quality.cross_set_same_rank_bias_flag ? 1 : 0,
    quality.tie_flag_count, quality.timeout_rate, quality.mean_rt_ms,
    now, now,
  );
}
