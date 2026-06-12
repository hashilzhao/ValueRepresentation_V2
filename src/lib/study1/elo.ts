/**
 * Elo Rating System for Study 1 Liking Calibration.
 *
 * Replaces discrete win-count ranking with a continuous, cross-set-comparable
 * Elo score for each stimulus.  All calibration phases feed into a single
 * unified Elo pool, producing a smooth "liking strength" metric.
 */

import { getDb } from "@/lib/db";
import crypto from "crypto";
import type { CalibrationPhase, SetStimulus } from "./calibration-types";

// ─── Constants ──────────────────────────────────────────────────

const INITIAL_ELO = 1500;
const MIN_ELO = 1100;
const MAX_ELO = 1900;
const INITIAL_VOLATILITY = 200;

/** K-values decrease as confidence increases across phases. */
export const K_VALUES: Partial<Record<CalibrationPhase, number>> = {
  within_full_pair: 32,
  within_adjacent_retest: 24,
  within_adjacent_retest_r2: 24,
  cross_set_anchor_mid: 20,
  cross_set_anchor_low: 20,
  cross_set_anchor_high: 20,
  cross_set_adaptive: 20,
};

// ─── Elo State ───────────────────────────────────────────────────

export interface EloState {
  score: number;
  volatility: number;
  comparisons: number;
}

// ─── Core Elo Functions ──────────────────────────────────────────

/** Expected probability that `ratingA` beats `ratingB` (0-1). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Compute new Elo ratings after a single contest. */
export function updateElo(
  winnerElo: number,
  loserElo: number,
  K: number,
): { newWinner: number; newLoser: number } {
  const expectedWin = expectedScore(winnerElo, loserElo);
  return {
    newWinner: winnerElo + K * (1 - expectedWin),
    newLoser: loserElo + K * (0 - (1 - expectedWin)),
  };
}

/** Clamp Elo to [MIN_ELO, MAX_ELO] to prevent runaway divergence. */
export function clampElo(elo: number): number {
  return Math.max(MIN_ELO, Math.min(MAX_ELO, elo));
}

/** Safe update with clamping. */
export function updateEloSafe(
  winnerElo: number,
  loserElo: number,
  K: number,
): { newWinner: number; newLoser: number } {
  const { newWinner, newLoser } = updateElo(winnerElo, loserElo, K);
  return {
    newWinner: clampElo(newWinner),
    newLoser: clampElo(newLoser),
  };
}

// ─── Volatility Decay ────────────────────────────────────────────

/**
 * Volatility decreases with more comparisons.
 * Models decreasing uncertainty as we gather more data.
 */
function decayedVolatility(initialVol: number, comparisons: number): number {
  // Bayesian-inspired: σ_new = σ₀ / sqrt(1 + n)
  return Math.max(50, initialVol / Math.sqrt(1 + comparisons));
}

// ─── Phase-level Elo Computation ─────────────────────────────────

/**
 * Compute Elo scores for a specific phase from calibration_responses.
 *
 * @param sessionId
 * @param phase - single phase name
 * @param initialScores - optional existing Elo scores to carry over from prior phases
 * @returns Map of stim_id → EloState
 */
export function computeEloForPhase(
  sessionId: string,
  phase: string,
  initialScores?: Map<string, EloState>,
): Map<string, EloState> {
  const db = getDb();
  const eloMap = new Map<string, EloState>();

  // Initialize from carry-over or fresh.
  if (initialScores) {
    for (const [stimId, state] of initialScores) {
      eloMap.set(stimId, { ...state });
    }
  }

  const K = (K_VALUES as Record<string, number>)[phase] ?? 24;

  const responses = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout,
              ct.left_stim_id, ct.right_stim_id
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase = ?
         AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0
       ORDER BY ct.trial_index`,
    )
    .all(sessionId, phase) as {
    chosen_stim_id: string;
    timeout: number;
    left_stim_id: string;
    right_stim_id: string;
  }[];

  for (const r of responses) {
    const winner = r.chosen_stim_id;
    const loser =
      winner === r.left_stim_id ? r.right_stim_id : r.left_stim_id;

    // Ensure both stimuli are in the map.
    if (!eloMap.has(winner)) {
      eloMap.set(winner, {
        score: INITIAL_ELO,
        volatility: INITIAL_VOLATILITY,
        comparisons: 0,
      });
    }
    if (!eloMap.has(loser)) {
      eloMap.set(loser, {
        score: INITIAL_ELO,
        volatility: INITIAL_VOLATILITY,
        comparisons: 0,
      });
    }

    const wState = eloMap.get(winner)!;
    const lState = eloMap.get(loser)!;

    const { newWinner, newLoser } = updateEloSafe(wState.score, lState.score, K);

    wState.score = newWinner;
    lState.score = newLoser;
    wState.comparisons++;
    lState.comparisons++;
    wState.volatility = decayedVolatility(INITIAL_VOLATILITY, wState.comparisons);
    lState.volatility = decayedVolatility(INITIAL_VOLATILITY, lState.comparisons);
  }

  return eloMap;
}

// ─── Merged Elo Across Phases ────────────────────────────────────

/**
 * Compute Elo scores from ALL calibration responses, processing phases
 * in order so later phases refine the scores from earlier ones.
 */
export function computeAllPhaseElo(
  sessionId: string,
  phases: string[],
): Map<string, EloState> {
  let eloMap: Map<string, EloState> | undefined;

  for (const phase of phases) {
    eloMap = computeEloForPhase(sessionId, phase, eloMap);
  }

  return eloMap ?? new Map();
}

// ─── Within-Set Ranking from Elo ─────────────────────────────────

/**
 * Rank stimuli within each set by descending Elo score.
 * Returns rank 5 = highest Elo (most liked), rank 1 = lowest Elo.
 */
export function rankWithinSetByElo(
  eloMap: Map<string, EloState>,
  bySet: Record<string, SetStimulus[]>,
): { stim_id: string; set_id: string; elo_rank: number; elo_score: number }[] {
  const results: { stim_id: string; set_id: string; elo_rank: number; elo_score: number }[] = [];

  for (const [setId, stims] of Object.entries(bySet)) {
    // Collect Elo for each stim in set.
    const scored = stims.map((s) => {
      const elo = eloMap.get(s.stim_id);
      return {
        stim_id: s.stim_id,
        set_id: setId,
        elo_score: elo?.score ?? INITIAL_ELO,
      };
    });

    // Sort by Elo descending → rank 5 = highest.
    scored.sort((a, b) => b.elo_score - a.elo_score);

    // Assign ranks 1-5.
    for (let i = 0; i < scored.length; i++) {
      results.push({
        stim_id: scored[i].stim_id,
        set_id: setId,
        elo_rank: scored.length - i, // rank 5 = most liked
        elo_score: scored[i].elo_score,
      });
    }
  }

  return results;
}

// ─── Persistence ─────────────────────────────────────────────────

/**
 * Upsert Elo scores into the stimulus_elo table.
 * Idempotent: replaces existing rows for same (session_id, stim_id, attempt_index).
 */
export function saveEloScores(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
  eloMap: Map<string, EloState>,
  setMembers: Record<string, SetStimulus[]>,
): void {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO stimulus_elo
      (id, session_id, participant_id, stim_id, set_id,
       elo_score, elo_volatility, comparisons_count,
       calibration_attempt_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  // Build stim_id → set_id lookup.
  const setIdMap = new Map<string, string>();
  for (const stims of Object.values(setMembers)) {
    for (const s of stims) {
      setIdMap.set(s.stim_id, s.set_id);
    }
  }

  db.transaction(() => {
    for (const [stimId, state] of eloMap) {
      const existing = db
        .prepare(
          `SELECT id FROM stimulus_elo
           WHERE session_id = ? AND stim_id = ? AND calibration_attempt_index = ?`,
        )
        .get(sessionId, stimId, attemptIndex) as { id: string } | undefined;

      upsert.run(
        existing?.id ?? crypto.randomUUID(),
        sessionId,
        participantId,
        stimId,
        setIdMap.get(stimId) ?? "unknown",
        state.score,
        state.volatility,
        state.comparisons,
        attemptIndex,
        existing ? undefined : now,
        now,
      );
    }
  })();
}

/**
 * Load Elo scores from stimulus_elo table.
 */
export function loadEloScores(
  sessionId: string,
  attemptIndex: number,
): Map<string, EloState> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT stim_id, elo_score, elo_volatility, comparisons_count
       FROM stimulus_elo
       WHERE session_id = ? AND calibration_attempt_index = ?
       ORDER BY stim_id`,
    )
    .all(sessionId, attemptIndex) as {
    stim_id: string;
    elo_score: number;
    elo_volatility: number;
    comparisons_count: number;
  }[];

  const map = new Map<string, EloState>();
  for (const r of rows) {
    map.set(r.stim_id, {
      score: r.elo_score,
      volatility: r.elo_volatility,
      comparisons: r.comparisons_count,
    });
  }
  return map;
}

// ─── Elo Prediction / Fit ────────────────────────────────────────

/**
 * Back-test Elo model predictions against actual responses.
 * Returns RMSE (root mean squared error) of predicted vs actual outcomes.
 */
export function computeEloModelRMSE(
  sessionId: string,
  eloMap: Map<string, EloState>,
): number {
  const db = getDb();

  const responses = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout,
              ct.left_stim_id, ct.right_stim_id
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ?
         AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0
       ORDER BY ct.trial_index`,
    )
    .all(sessionId) as {
    chosen_stim_id: string;
    timeout: number;
    left_stim_id: string;
    right_stim_id: string;
  }[];

  let sumSqErr = 0;
  let count = 0;

  for (const r of responses) {
    const leftElo = eloMap.get(r.left_stim_id)?.score ?? INITIAL_ELO;
    const rightElo = eloMap.get(r.right_stim_id)?.score ?? INITIAL_ELO;

    // Predicted probability that left beats right.
    const predLeftWin = expectedScore(leftElo, rightElo);
    // Actual outcome: 1 if left was chosen, 0 if right.
    const actual = r.chosen_stim_id === r.left_stim_id ? 1 : 0;

    sumSqErr += (actual - predLeftWin) ** 2;
    count++;
  }

  return count > 0 ? Math.sqrt(sumSqErr / count) : 0;
}
