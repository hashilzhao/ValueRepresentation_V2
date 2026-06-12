/**
 * Anomaly Detection for Stage 4C Cross-Set Calibration.
 *
 * Detects inconsistencies in cross-set comparisons after 4C-a and 4C-b
 * phases are complete. Results are used to decide whether 4C-c
 * (adaptive supplement) trials are needed.
 */

import { getDb } from "@/lib/db";
import { loadEloScores } from "./elo";
import type { AnomalyDetectionResult } from "./calibration-types";

/** Main entry point: detect anomalies after 4C-a + 4C-b. */
export function detectAnomalies(
  sessionId: string,
  attemptIndex: number,
): AnomalyDetectionResult {
  const anomalyDetails: string[] = [];
  const flaggedStimuli: { stim_id: string; set_id: string; reason: string }[] = [];
  const flaggedSet = new Set<string>();

  // ── 1. Test-retest inconsistency (4C-a) ────────────────────
  detectTestRetestAnomalies(sessionId, anomalyDetails, flaggedStimuli, flaggedSet);

  // ── 2. Cross-level contradiction ───────────────────────────
  detectCrossLevelContradictions(sessionId, attemptIndex, anomalyDetails, flaggedStimuli, flaggedSet);

  // ── 3. High Elo uncertainty ────────────────────────────────
  detectHighEloUncertainty(sessionId, attemptIndex, anomalyDetails, flaggedStimuli, flaggedSet);

  // ── 4. Low Kendall's W across rank levels ──────────────────
  detectLowKendallW(sessionId, anomalyDetails, flaggedStimuli, flaggedSet);

  return {
    has_anomalies: anomalyDetails.length > 0,
    anomaly_details: anomalyDetails,
    flagged_stimuli: flaggedStimuli,
  };
}

// ─── Detector 1: Test-retest inconsistency ───────────────────────

function detectTestRetestAnomalies(
  sessionId: string,
  details: string[],
  flagged: { stim_id: string; set_id: string; reason: string }[],
  flaggedSet: Set<string>,
): void {
  const db = getDb();

  // 4C-a pairs are presented twice. Group by unique pair (sorted stim ids).
  const responses = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout,
              ct.left_stim_id, ct.right_stim_id,
              ct.left_set_id, ct.right_set_id
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase = 'cross_set_anchor_mid'
         AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0
       ORDER BY ct.trial_index`,
    )
    .all(sessionId) as {
    chosen_stim_id: string;
    timeout: number;
    left_stim_id: string;
    right_stim_id: string;
    left_set_id: string;
    right_set_id: string;
  }[];

  // Group pairs: sorted stimIdA|stimIdB → array of chosen_stim_id.
  const pairGroups = new Map<string, string[]>();
  for (const r of responses) {
    const key = [r.left_stim_id, r.right_stim_id].sort().join("|");
    const group = pairGroups.get(key) ?? [];
    group.push(r.chosen_stim_id);
    pairGroups.set(key, group);
  }

  let inconsistentCount = 0;
  for (const [key, choices] of pairGroups) {
    if (choices.length < 2) continue; // incomplete pair
    if (choices[0] !== choices[1]) {
      inconsistentCount++;
      const stims = key.split("|");
      for (const sid of stims) {
        if (!flaggedSet.has(sid)) {
          flagged.push({ stim_id: sid, set_id: "", reason: "test_retest_inconsistent" });
          flaggedSet.add(sid);
        }
      }
    }
  }

  if (inconsistentCount > 0) {
    details.push(`test_retest_inconsistent: ${inconsistentCount} pairs had different outcomes across repetitions`);
  }
}

// ─── Detector 2: Cross-level contradiction ───────────────────────

function detectCrossLevelContradictions(
  sessionId: string,
  attemptIndex: number,
  details: string[],
  flagged: { stim_id: string; set_id: string; reason: string }[],
  flaggedSet: Set<string>,
): void {
  const db = getDb();

  // Get set ordering from rank-3 comparisons.
  const rank3Order = getSetOrdering(sessionId, "cross_set_anchor_mid");
  // Get set ordering from rank-1 comparisons.
  const rank1Order = getSetOrdering(sessionId, "cross_set_anchor_low");
  // Get set ordering from rank-5 comparisons.
  const rank5Order = getSetOrdering(sessionId, "cross_set_anchor_high");

  if (!rank3Order || !rank1Order || !rank5Order) return;

  // Compare orderings: if rank-1 disagrees with rank-3, flag all stims in contradicted sets.
  const contradictions: string[] = [];
  const rank3Rank = new Map(rank3Order.map((s, i) => [s, i]));
  const rank1Rank = new Map(rank1Order.map((s, i) => [s, i]));
  const rank5Rank = new Map(rank5Order.map((s, i) => [s, i]));

  for (const setId of rank3Order) {
    const r3 = rank3Rank.get(setId) ?? 0;
    const r1 = rank1Rank.get(setId) ?? 0;
    const r5 = rank5Rank.get(setId) ?? 0;
    const diff13 = Math.abs(r3 - r1);
    const diff35 = Math.abs(r3 - r5);
    if (diff13 >= 2) contradictions.push(`${setId}: rank-3 pos=${r3}, rank-1 pos=${r1}`);
    if (diff35 >= 2) contradictions.push(`${setId}: rank-3 pos=${r3}, rank-5 pos=${r5}`);
  }

  if (contradictions.length > 0) {
    details.push(`cross_level_contradiction: ${contradictions.join("; ")}`);
    // Flag stimuli from contradicted sets.
    for (const c of contradictions) {
      const setId = c.split(":")[0];
      const stims = db
        .prepare("SELECT stim_id FROM subject_set_assignment WHERE session_id = ? AND set_id = ?")
        .all(sessionId, setId) as { stim_id: string }[];
      for (const s of stims) {
        if (!flaggedSet.has(s.stim_id)) {
          flagged.push({ stim_id: s.stim_id, set_id: setId, reason: "cross_level_contradiction" });
          flaggedSet.add(s.stim_id);
        }
      }
    }
  }
}

/** Get set ordering from pairwise comparisons in a phase (by win count). */
function getSetOrdering(sessionId: string, phase: string): string[] | null {
  const db = getDb();

  const responses = db
    .prepare(
      `SELECT cr.chosen_stim_id, ct.left_set_id, ct.right_set_id
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase = ?
         AND cr.chosen_stim_id IS NOT NULL AND cr.timeout = 0`,
    )
    .all(sessionId, phase) as {
    chosen_stim_id: string; left_set_id: string; right_set_id: string;
  }[];

  if (responses.length === 0) return null;

  // Read set membership map.
  const setMap = new Map<string, string>();
  const members = db
    .prepare("SELECT stim_id, set_id FROM subject_set_assignment WHERE session_id = ?")
    .all(sessionId) as { stim_id: string; set_id: string }[];
  for (const m of members) setMap.set(m.stim_id, m.set_id);

  const setWins: Record<string, number> = {};
  for (const r of responses) {
    const winnerSet = setMap.get(r.chosen_stim_id) ?? "unknown";
    setWins[winnerSet] = (setWins[winnerSet] ?? 0) + 1;
  }

  // Order sets by win count descending.
  const ordered = Object.entries(setWins)
    .sort((a, b) => b[1] - a[1])
    .map(([setId]) => setId);

  return ordered.length >= 2 ? ordered : null;
}

// ─── Detector 3: High Elo uncertainty ────────────────────────────

const HIGH_VOLATILITY_THRESHOLD = 120;

function detectHighEloUncertainty(
  sessionId: string,
  attemptIndex: number,
  details: string[],
  flagged: { stim_id: string; set_id: string; reason: string }[],
  flaggedSet: Set<string>,
): void {
  const eloMap = loadEloScores(sessionId, attemptIndex);
  const highUncertainty: string[] = [];

  for (const [stimId, state] of eloMap) {
    if (state.volatility > HIGH_VOLATILITY_THRESHOLD) {
      highUncertainty.push(stimId);
    }
  }

  if (highUncertainty.length > 0) {
    details.push(`high_elo_uncertainty: ${highUncertainty.length} stimuli with volatility > ${HIGH_VOLATILITY_THRESHOLD}`);
    for (const sid of highUncertainty) {
      if (!flaggedSet.has(sid)) {
        flagged.push({ stim_id: sid, set_id: "", reason: "high_elo_uncertainty" });
        flaggedSet.add(sid);
      }
    }
  }
}

// ─── Detector 4: Low Kendall's W ──────────────────────────────────

const KENDALL_W_THRESHOLD = 0.6;

function detectLowKendallW(
  sessionId: string,
  details: string[],
  flagged: { stim_id: string; set_id: string; reason: string }[],
  flaggedSet: Set<string>,
): void {
  const rank3Order = getSetOrdering(sessionId, "cross_set_anchor_mid");
  const rank1Order = getSetOrdering(sessionId, "cross_set_anchor_low");
  const rank5Order = getSetOrdering(sessionId, "cross_set_anchor_high");

  if (!rank3Order || !rank1Order || !rank5Order) return;

  const W = computeKendallW([rank3Order, rank1Order, rank5Order]);

  if (W < KENDALL_W_THRESHOLD) {
    details.push(`low_kendall_w: W=${W.toFixed(2)} (threshold=${KENDALL_W_THRESHOLD})`);
    // Flag all stimuli — entire calibration is uncertain.
    const db = getDb();
    const allStims = db
      .prepare("SELECT stim_id, set_id FROM subject_set_assignment WHERE session_id = ?")
      .all(sessionId) as { stim_id: string; set_id: string }[];
    for (const s of allStims) {
      if (!flaggedSet.has(s.stim_id)) {
        flagged.push({ stim_id: s.stim_id, set_id: s.set_id, reason: "low_kendall_w" });
        flaggedSet.add(s.stim_id);
      }
    }
  }
}

// ─── Kendall's W ──────────────────────────────────────────────────

function computeKendallW(rankings: string[][]): number {
  // Filter to items that appear in all rankings.
  const commonItems = rankings[0].filter((item) =>
    rankings.every((r) => r.includes(item)),
  );

  if (commonItems.length < 2) return 0;

  const m = rankings.length; // number of raters (rank levels)
  const n = commonItems.length; // number of items (sets)

  // Convert rankings to rank values.
  const ranks: number[][] = [];
  for (const ranking of rankings) {
    const rankMap = new Map(ranking.map((item, i) => [item, i + 1]));
    ranks.push(commonItems.map((item) => rankMap.get(item) ?? n));
  }

  // Sum of ranks for each item.
  const Rj = commonItems.map((_, j) => ranks.reduce((sum, r) => sum + r[j], 0));
  const Rbar = Rj.reduce((a, b) => a + b, 0) / n;

  // Sum of squared deviations.
  const S = Rj.reduce((sum, r) => sum + (r - Rbar) ** 2, 0);

  // Maximum possible S (perfect agreement).
  const maxS = (m ** 2 * (n ** 3 - n)) / 12;

  if (maxS === 0) return 0;
  return S / maxS;
}
