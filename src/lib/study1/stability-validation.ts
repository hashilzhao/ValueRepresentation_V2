/**
 * 5-Dimension Stability Validation for Study 1 Liking Calibration.
 *
 * Computes a stability grade (A/B/C) after all calibration phases are complete.
 * Used to decide whether the participant's data is trustworthy for formal choice,
 * and whether a retry should be triggered.
 */

import { getDb } from "@/lib/db";
import crypto from "crypto";
import { loadEloScores, computeEloModelRMSE, expectedScore } from "./elo";
import { detectAnomalies } from "./anomaly-detection";
import type { CalibrationStability } from "./calibration-types";

const INITIAL_ELO = 1500;

// ─── Weight configuration ────────────────────────────────────────

const WEIGHTS = {
  cycle_consistency: 0.20,
  test_retest: 0.25,
  cross_level_kendall_w: 0.25,
  elo_rmse: 0.20,
  timeout: 0.10,
};

const GRADE_A_THRESHOLD = 0.80;
const GRADE_B_THRESHOLD = 0.55;

// ─── Main ────────────────────────────────────────────────────────

export function computeStability(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): CalibrationStability {
  const db = getDb();

  // ── 1. Cycle consistency rate (from 4A within-set tournaments) ──
  const cycleRate = computeCycleConsistency(sessionId);

  // ── 2. Test-retest agreement (from 4C-a repeated pairs) ────────
  const testRetestAgreement = computeTestRetestAgreement(sessionId);

  // ── 3. Cross-level Kendall's W (rank-1/3/5 ordering consistency) ──
  const kendallW = computeCrossLevelKendallW(sessionId);

  // ── 4. Elo model RMSE (global back-test) ───────────────────────
  const eloMap = loadEloScores(sessionId, attemptIndex);
  const eloRMSE = eloMap.size > 0 ? computeEloModelRMSE(sessionId, eloMap) : 0;

  // ── 5. Timeout rate ───────────────────────────────────────────
  const timeoutRate = computeTimeoutRate(sessionId);

  // ── Composite score ───────────────────────────────────────────
  const cycleScore = 1 - Math.min(1, cycleRate / 0.20); // ≤10% ideal
  const retestScore = testRetestAgreement ?? 0;
  const kendallScore = kendallW ?? 0;
  const eloScore = 1 - Math.min(1, eloRMSE / 0.50); // ≤0.35 ideal
  const timeoutScore = 1 - Math.min(1, timeoutRate / 0.30);

  const composite =
    cycleScore * WEIGHTS.cycle_consistency +
    retestScore * WEIGHTS.test_retest +
    kendallScore * WEIGHTS.cross_level_kendall_w +
    eloScore * WEIGHTS.elo_rmse +
    timeoutScore * WEIGHTS.timeout;

  const grade: "A" | "B" | "C" =
    composite >= GRADE_A_THRESHOLD ? "A" :
    composite >= GRADE_B_THRESHOLD ? "B" : "C";

  // ── Low confidence sets ───────────────────────────────────────
  const lowConfidenceSets = findLowConfidenceSets(sessionId, attemptIndex);

  // ── Adaptive supplement count ─────────────────────────────────
  const adaptiveCount = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = 'cross_set_adaptive'"
  ).get(sessionId) as { cnt: number }).cnt;

  return {
    session_id: sessionId,
    participant_id: participantId,
    cycle_consistency_rate: cycleRate,
    test_retest_agreement: testRetestAgreement,
    cross_level_kendall_w: kendallW,
    elo_model_rmse: eloRMSE,
    timeout_rate: timeoutRate,
    stability_grade: grade,
    low_confidence_sets: lowConfidenceSets.length > 0 ? JSON.stringify(lowConfidenceSets) : null,
    adaptive_supplement_count: adaptiveCount,
    calibration_attempt_index: attemptIndex,
  };
}

// ─── Save ────────────────────────────────────────────────────────

export function saveStability(stability: CalibrationStability): void {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT id FROM calibration_stability WHERE session_id = ? AND calibration_attempt_index = ?")
    .get(stability.session_id, stability.calibration_attempt_index) as { id: string } | undefined;

  db.prepare(`
    INSERT OR REPLACE INTO calibration_stability
      (id, session_id, participant_id,
       cycle_consistency_rate, test_retest_agreement, cross_level_kendall_w,
       elo_model_rmse, timeout_rate, stability_grade,
       low_confidence_sets, adaptive_supplement_count,
       calibration_attempt_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    existing?.id ?? crypto.randomUUID(),
    stability.session_id,
    stability.participant_id,
    stability.cycle_consistency_rate,
    stability.test_retest_agreement,
    stability.cross_level_kendall_w,
    stability.elo_model_rmse,
    stability.timeout_rate,
    stability.stability_grade,
    stability.low_confidence_sets,
    stability.adaptive_supplement_count,
    stability.calibration_attempt_index,
    existing ? undefined : now,
    now,
  );
}

// ─── Dimension 1: Cycle consistency ──────────────────────────────

function computeCycleConsistency(sessionId: string): number {
  const db = getDb();

  const responses = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout,
              ct.left_stim_id, ct.right_stim_id, ct.left_set_id
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase = 'within_full_pair'
         AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0`,
    )
    .all(sessionId) as {
    chosen_stim_id: string; timeout: number;
    left_stim_id: string; right_stim_id: string; left_set_id: string;
  }[];

  // Group by set.
  const bySet: Record<string, typeof responses> = {};
  for (const r of responses) {
    (bySet[r.left_set_id] ??= []).push(r);
  }

  let totalCycles = 0;
  let maxCycles = 0;

  for (const setResponses of Object.values(bySet)) {
    // Build directed graph: A beats B if A was chosen.
    const beats = new Map<string, Set<string>>();
    for (const r of setResponses) {
      const winner = r.chosen_stim_id;
      const loser = winner === r.left_stim_id ? r.right_stim_id : r.left_stim_id;
      if (!beats.has(winner)) beats.set(winner, new Set());
      beats.get(winner)!.add(loser);
    }

    // Get all stims in this set.
    const stims = new Set<string>();
    for (const r of setResponses) {
      stims.add(r.left_stim_id);
      stims.add(r.right_stim_id);
    }
    const stimList = [...stims];
    const n = stimList.length;

    // Count 3-cycles.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          const a = stimList[i], b = stimList[j], c = stimList[k];
          const ab = beats.get(a)?.has(b) ?? false;
          const ba = beats.get(b)?.has(a) ?? false;
          const bc = beats.get(b)?.has(c) ?? false;
          const cb = beats.get(c)?.has(b) ?? false;
          const ca = beats.get(c)?.has(a) ?? false;
          const ac = beats.get(a)?.has(c) ?? false;

          // A cycle exists if there's a directed 3-cycle.
          const hasCycle =
            (ab && bc && ca) || // A→B→C→A
            (ac && cb && ba) || // A→C→B→A
            (ba && ac && cb) || // B→A→C→B
            (bc && ca && ab) || // B→C→A→B
            (ca && ab && bc) || // C→A→B→C
            (cb && ba && ac);   // C→B→A→C

          if (hasCycle) totalCycles++;
        }
      }
    }
    maxCycles += (n * (n - 1) * (n - 2)) / 6; // C(n,3)
  }

  return maxCycles > 0 ? totalCycles / maxCycles : 0;
}

// ─── Dimension 2: Test-retest agreement ──────────────────────────

function computeTestRetestAgreement(sessionId: string): number | null {
  const db = getDb();

  const responses = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout,
              ct.left_stim_id, ct.right_stim_id
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase = 'cross_set_anchor_mid'
         AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0
       ORDER BY ct.trial_index`,
    )
    .all(sessionId) as {
    chosen_stim_id: string; timeout: number;
    left_stim_id: string; right_stim_id: string;
  }[];

  // Group by pair.
  const pairGroups = new Map<string, string[]>();
  for (const r of responses) {
    const key = [r.left_stim_id, r.right_stim_id].sort().join("|");
    const group = pairGroups.get(key) ?? [];
    group.push(r.chosen_stim_id);
    pairGroups.set(key, group);
  }

  let consistent = 0;
  let total = 0;

  for (const [, choices] of pairGroups) {
    if (choices.length < 2) continue;
    total++;
    if (choices[0] === choices[1]) consistent++;
  }

  return total > 0 ? consistent / total : null;
}

// ─── Dimension 3: Cross-level Kendall's W ────────────────────────

function computeCrossLevelKendallW(sessionId: string): number | null {
  const db = getDb();

  // Get set orderings from each anchor level.
  function getOrdering(phase: string): string[] | null {
    const setWins: Record<string, number> = {};

    const setMap = new Map<string, string>();
    const members = db
      .prepare("SELECT stim_id, set_id FROM subject_set_assignment WHERE session_id = ?")
      .all(sessionId) as { stim_id: string; set_id: string }[];
    for (const m of members) setMap.set(m.stim_id, m.set_id);

    const responses = db
      .prepare(
        `SELECT cr.chosen_stim_id
         FROM calibration_responses cr
         JOIN calibration_trials ct ON ct.id = cr.trial_id
         WHERE cr.session_id = ? AND ct.phase = ?
           AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0`,
      )
      .all(sessionId, phase) as { chosen_stim_id: string }[];

    if (responses.length === 0) return null;

    for (const r of responses) {
      const winnerSet = setMap.get(r.chosen_stim_id) ?? "unknown";
      setWins[winnerSet] = (setWins[winnerSet] ?? 0) + 1;
    }

    return Object.entries(setWins)
      .sort((a, b) => b[1] - a[1])
      .map(([setId]) => setId);
  }

  const rank3 = getOrdering("cross_set_anchor_mid");
  const rank1 = getOrdering("cross_set_anchor_low");
  const rank5 = getOrdering("cross_set_anchor_high");

  const valid = [rank3, rank1, rank5].filter(Boolean) as string[][];
  if (valid.length < 2) return null;

  return computeKendallW(valid);
}

function computeKendallW(rankings: string[][]): number {
  const commonItems = rankings[0].filter((item) =>
    rankings.every((r) => r.includes(item)),
  );
  if (commonItems.length < 2) return 0;

  const m = rankings.length;
  const n = commonItems.length;

  const ranks: number[][] = [];
  for (const ranking of rankings) {
    const rankMap = new Map(ranking.map((item, i) => [item, i + 1]));
    ranks.push(commonItems.map((item) => rankMap.get(item) ?? n));
  }

  const Rj = commonItems.map((_, j) => ranks.reduce((sum, r) => sum + r[j], 0));
  const Rbar = Rj.reduce((a, b) => a + b, 0) / n;
  const S = Rj.reduce((sum, r) => sum + (r - Rbar) ** 2, 0);
  const maxS = (m ** 2 * (n ** 3 - n)) / 12;
  return maxS > 0 ? S / maxS : 0;
}

// ─── Dimension 5: Timeout rate ───────────────────────────────────

function computeTimeoutRate(sessionId: string): number {
  const db = getDb();
  const total = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ?"
  ).get(sessionId) as { cnt: number }).cnt;
  const timeouts = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ? AND timeout = 1"
  ).get(sessionId) as { cnt: number }).cnt;
  return total > 0 ? timeouts / total : 0;
}

// ─── Low confidence sets ─────────────────────────────────────────

function findLowConfidenceSets(
  sessionId: string,
  attemptIndex: number,
): string[] {
  const db = getDb();
  const eloMap = loadEloScores(sessionId, attemptIndex);

  // Check per-set Elo volatility and cycle consistency.
  const sets = db
    .prepare("SELECT DISTINCT set_id FROM subject_set_assignment WHERE session_id = ?")
    .all(sessionId) as { set_id: string }[];

  const lowConf: string[] = [];
  for (const { set_id } of sets) {
    const stims = db
      .prepare("SELECT stim_id FROM subject_set_assignment WHERE session_id = ? AND set_id = ?")
      .all(sessionId, set_id) as { stim_id: string }[];

    // Average Elo volatility in this set.
    let totalVol = 0;
    let count = 0;
    for (const s of stims) {
      const elo = eloMap.get(s.stim_id);
      if (elo) { totalVol += elo.volatility; count++; }
    }
    const avgVol = count > 0 ? totalVol / count : 200;

    if (avgVol > 150) lowConf.push(set_id);
  }

  return lowConf;
}
