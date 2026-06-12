import crypto from "crypto";
import { getDb } from "@/lib/db";
import type { CalibrationTrial, CalibrationPhase, SetStimulus, CrossSetOrthogonalizedEntry } from "./calibration-types";
import { computeAllPhaseElo, rankWithinSetByElo } from "./elo";

const DEV = process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true";
const DEV_SET_COUNT = 2; // minimum 2 sets for cross-set phases

// ─── Seeded RNG (hash-based) ──────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

let _seedCounter = 0;
function seededRandom(): number {
  _seedCounter = (_seedCounter * 1664525 + 1013904223) | 0;
  return (_seedCounter >>> 0) / 4294967296;
}

// ─── Helper: load set members ──────────────────────────────────

export function loadSetMembers(sessionId: string): Record<string, SetStimulus[]> {
  const db = getDb();
  const members = db
    .prepare(
      `SELECT set_id, stim_id, stimulus_pool_id, image_url, position_in_set
       FROM subject_set_assignment WHERE session_id = ? ORDER BY set_id, position_in_set`,
    )
    .all(sessionId) as SetStimulus[];
  const bySet: Record<string, SetStimulus[]> = {};
  for (const m of members) {
    (bySet[m.set_id] ??= []).push(m);
  }
  return bySet;
}

function getActiveSetIds(bySet: Record<string, SetStimulus[]>): string[] {
  const all = Object.keys(bySet).sort();
  return DEV ? all.slice(0, DEV_SET_COUNT) : all;
}

// ═══════════════════════════════════════════════════════════════
// Stage 4A: Within-set full pairing — 50 trials (5 sets × 10)
// ═══════════════════════════════════════════════════════════════

export function generateWithinFullPairTrials(
  sessionId: string,
  participantId: string,
): CalibrationTrial[] {
  _seedCounter = hashStr(sessionId + "_4a");
  const bySet = loadSetMembers(sessionId);
  const setIds = getActiveSetIds(bySet);
  const trials: CalibrationTrial[] = [];

  for (const setId of setIds) {
    const items = bySet[setId];
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const swap = seededRandom() < 0.5;
        const leftItem = swap ? items[b] : items[a];
        const rightItem = swap ? items[a] : items[b];
        trials.push({
          id: crypto.randomUUID(),
          session_id: sessionId,
          participant_id: participantId,
          phase: "within_full_pair",
          trial_index: -1,
          left_stim_id: leftItem.stim_id,
          right_stim_id: rightItem.stim_id,
          left_set_id: leftItem.set_id,
          right_set_id: rightItem.set_id,
          left_rank_before: null,
          right_rank_before: null,
          boundary_type: null,
          expected_choice: null,
          left_image_url: leftItem.image_url,
          right_image_url: rightItem.image_url,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  const shuffled = shuffleArray(trials);
  return shuffled.map((t, i) => ({ ...t, trial_index: i }));
}

// ═══════════════════════════════════════════════════════════════
// Infer within-set ranks from 4A responses (win count)
// ═══════════════════════════════════════════════════════════════

export function inferWithinSetRanks(
  sessionId: string,
): { stim_id: string; set_id: string; rank: number; wins: number; tie_flag: boolean }[] {
  const db = getDb();

  const full = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout, ct.left_stim_id, ct.right_stim_id, ssa.set_id AS left_set
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       JOIN subject_set_assignment ssa ON ssa.stim_id = ct.left_stim_id AND ssa.session_id = cr.session_id
       WHERE cr.session_id = ? AND ct.phase = 'within_full_pair'`,
    )
    .all(sessionId) as {
    chosen_stim_id: string | null; timeout: number;
    left_stim_id: string; right_stim_id: string; left_set: string;
  }[];

  // Count wins per stim within each set.
  const wins: Record<string, Record<string, number>> = {};
  const members = db
    .prepare("SELECT set_id, stim_id FROM subject_set_assignment WHERE session_id = ?")
    .all(sessionId) as { set_id: string; stim_id: string }[];
  for (const m of members) {
    (wins[m.set_id] ??= {})[m.stim_id] = 0;
  }

  for (const r of full) {
    if (r.timeout || !r.chosen_stim_id) continue;
    const winner = r.chosen_stim_id;
    const loser = winner === r.left_stim_id ? r.right_stim_id : r.left_stim_id;
    if (wins[r.left_set]) {
      wins[r.left_set][winner] = (wins[r.left_set][winner] ?? 0) + 1;
    }
  }

  const results: { stim_id: string; set_id: string; rank: number; wins: number; tie_flag: boolean }[] = [];

  for (const [setId, stimWins] of Object.entries(wins)) {
    const entries = Object.entries(stimWins).map(([sid, w]) => ({ stim_id: sid, wins: w }));
    entries.sort((a, b) => b.wins - a.wins);

    // Detect ties and break deterministically.
    let hasTies = false;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].wins === entries[i - 1].wins) hasTies = true;
    }
    if (hasTies) {
      entries.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.stim_id.localeCompare(b.stim_id);
      });
    }

    for (let i = 0; i < entries.length; i++) {
      results.push({
        stim_id: entries[i].stim_id,
        set_id: setId,
        rank: entries.length - i, // 5 = most liked, 1 = least liked
        wins: entries[i].wins,
        tie_flag: hasTies && i > 0 && entries[i].wins === entries[i - 1].wins,
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Stage 4B Round 1: Within-set adjacent rank retest — 20 trials (5×4)
// Each adjacent pair is tested once against 4A results.
// Inconsistent pairs trigger Round 2 with 2 repetitions.
// ═══════════════════════════════════════════════════════════════

const R1_RETEST_REPETITIONS = 1;
const R2_RETEST_REPETITIONS = 2;

export function generateWithinAdjacentRetestRound1(
  sessionId: string,
  participantId: string,
  ranks: { stim_id: string; set_id: string; rank: number }[],
): CalibrationTrial[] {
  _seedCounter = hashStr(sessionId + "_4b_r1");
  const bySet = loadSetMembers(sessionId);
  const setIds = getActiveSetIds(bySet);
  const rankMap = new Map(ranks.map((r) => [`${r.set_id}|${r.stim_id}`, r.rank]));

  const trials: CalibrationTrial[] = [];

  for (const setId of setIds) {
    const items = bySet[setId];
    const rankToStim: Record<number, string> = {};
    for (const item of items) {
      const r = rankMap.get(`${setId}|${item.stim_id}`) ?? 0;
      rankToStim[r] = item.stim_id;
    }

    // Adjacent pairs: 1v2, 2v3, 3v4, 4v5. Each pair tested twice.
    for (const [lo, hi] of [[1, 2], [2, 3], [3, 4], [4, 5]]) {
      const loStim = rankToStim[lo];
      const hiStim = rankToStim[hi];
      if (!loStim || !hiStim) continue;

      for (let rep = 0; rep < R1_RETEST_REPETITIONS; rep++) {
        const swap = seededRandom() < 0.5;
        const leftStim = swap ? hiStim : loStim;
        const rightStim = swap ? loStim : hiStim;
        const leftItem = items.find((x) => x.stim_id === leftStim)!;
        const rightItem = items.find((x) => x.stim_id === rightStim)!;

        trials.push({
          id: crypto.randomUUID(),
          session_id: sessionId,
          participant_id: participantId,
          phase: "within_adjacent_retest",
          trial_index: -1,
          left_stim_id: leftStim,
          right_stim_id: rightStim,
          left_set_id: setId,
          right_set_id: setId,
          left_rank_before: swap ? hi : lo,
          right_rank_before: swap ? lo : hi,
          boundary_type: `${lo}v${hi}`,
          expected_choice: "right", // expect higher-ranked (more liked) chosen
          left_image_url: leftItem.image_url,
          right_image_url: rightItem.image_url,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  const shuffled = shuffleArray(trials);
  return shuffled.map((t, i) => ({ ...t, trial_index: i }));
}

// ═══════════════════════════════════════════════════════════════
// Stage 4B Round 2: Iterative retest — only inconsistent pairs + affected neighbors
// Returns null if no inconsistencies (round 2 not needed).
// Each flagged pair is tested twice (R2_RETEST_REPETITIONS=2) for reliability.
// Combined with 4A (×1) + R1 (×1), each flagged pair has 4 comparisons for Elo.
// ═══════════════════════════════════════════════════════════════

export function generateWithinAdjacentRetestRound2(
  sessionId: string,
  participantId: string,
  eloMap: Map<string, { score: number }>,
  setMembers: Record<string, SetStimulus[]>,
): CalibrationTrial[] | null {
  _seedCounter = hashStr(sessionId + "_4b_r2");
  const setIds = getActiveSetIds(setMembers);

  const trials: CalibrationTrial[] = [];
  let hasAnyInconsistency = false;

  for (const setId of setIds) {
    const items = setMembers[setId];

    // Sort items by Elo descending to get current ranking.
    const sorted = [...items].sort((a, b) => {
      const ea = eloMap.get(a.stim_id)?.score ?? 1500;
      const eb = eloMap.get(b.stim_id)?.score ?? 1500;
      return eb - ea; // descending Elo
    });

    // Build Elo-based rank → stim lookup.
    const eloRankToStim: Record<number, string> = {};
    for (let i = 0; i < sorted.length; i++) {
      eloRankToStim[sorted.length - i] = sorted[i].stim_id; // rank 5 = top Elo
    }

    // Check each adjacent pair for inconsistency.
    // Load round-1 responses (all repetitions) for this set to detect conflicts.
    // A pair is flagged if ANY repetition was inconsistent.
    const db = getDb();
    const r1Responses = db
      .prepare(
        `SELECT cr.chosen_stim_id, ct.left_stim_id, ct.right_stim_id,
                ct.left_preliminary_rank AS left_rank, ct.right_preliminary_rank AS right_rank
         FROM calibration_responses cr
         JOIN calibration_trials ct ON ct.id = cr.trial_id
         WHERE cr.session_id = ? AND ct.phase = 'within_adjacent_retest'
           AND ct.left_set_id = ? AND cr.timeout = 0 AND cr.chosen_stim_id IS NOT NULL`,
      )
      .all(sessionId, setId) as {
      chosen_stim_id: string; left_stim_id: string; right_stim_id: string;
      left_rank: number; right_rank: number;
    }[];

    // Set of pairs that need re-testing.
    const inconsistentPairs = new Set<string>();

    for (const r of r1Responses) {
      const hiRankStim = r.left_rank > r.right_rank ? r.left_stim_id : r.right_stim_id;
      if (r.chosen_stim_id !== hiRankStim) {
        // Lower-ranked stim was chosen — inconsistency.
        hasAnyInconsistency = true;
        const lo = Math.min(r.left_rank, r.right_rank);
        const hi = Math.max(r.left_rank, r.right_rank);
        inconsistentPairs.add(`${lo}|${hi}`);

        // Also test affected neighbors.
        if (lo > 1) inconsistentPairs.add(`${lo - 1}|${lo}`);
        if (hi < 5) inconsistentPairs.add(`${hi}|${hi + 1}`);
      }
    }

    // Generate trials for flagged pairs. Each pair tested twice.
    for (const pairKey of inconsistentPairs) {
      const [lo, hi] = pairKey.split("|").map(Number);
      const loStim = eloRankToStim[lo];
      const hiStim = eloRankToStim[hi];
      if (!loStim || !hiStim) continue;

      for (let rep = 0; rep < R2_RETEST_REPETITIONS; rep++) {
        const swap = seededRandom() < 0.5;
        const leftStim = swap ? hiStim : loStim;
        const rightStim = swap ? loStim : hiStim;
        const leftItem = items.find((x) => x.stim_id === leftStim)!;
        const rightItem = items.find((x) => x.stim_id === rightStim)!;

        trials.push({
          id: crypto.randomUUID(),
          session_id: sessionId,
          participant_id: participantId,
          phase: "within_adjacent_retest_r2",
          trial_index: -1,
          left_stim_id: leftStim,
          right_stim_id: rightStim,
          left_set_id: setId,
          right_set_id: setId,
          left_rank_before: swap ? hi : lo,
          right_rank_before: swap ? lo : hi,
          boundary_type: `${lo}v${hi}_r${rep + 1}`,
          expected_choice: "right",
          left_image_url: leftItem.image_url,
          right_image_url: rightItem.image_url,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  if (!hasAnyInconsistency) return null;

  const shuffled = shuffleArray(trials);
  return shuffled.map((t, i) => ({ ...t, trial_index: i }));
}

// ═══════════════════════════════════════════════════════════════
// Build first stable table from 4A + 4B using Elo scores
// ═══════════════════════════════════════════════════════════════

export function buildWithinSetStableTable(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): { entries: import("./calibration-types").WithinSetStableEntry[] } {
  const db = getDb();
  const members = db
    .prepare("SELECT set_id, stim_id, stimulus_pool_id, image_url FROM subject_set_assignment WHERE session_id = ?")
    .all(sessionId) as { set_id: string; stim_id: string; stimulus_pool_id: string; image_url: string }[];

  // Build set members map for Elo ranking.
  const bySet: Record<string, { set_id: string; stim_id: string }[]> = {};
  for (const m of members) {
    (bySet[m.set_id] ??= []).push({ set_id: m.set_id, stim_id: m.stim_id });
  }

  // Compute Elo from 4A + 4B phases.
  const allPhases: string[] = ["within_full_pair", "within_adjacent_retest"];
  // Include round 2 if it exists.
  const r2Count = db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = 'within_adjacent_retest_r2'"
  ).get(sessionId) as { cnt: number };
  if (r2Count.cnt > 0) allPhases.push("within_adjacent_retest_r2");

  const eloMap = computeAllPhaseElo(sessionId, allPhases);

  // Get original win-count ranks from 4A for reference.
  const ranks4A = inferWithinSetRanks(sessionId);

  // Rank by Elo within each set.
  const eloRanks = rankWithinSetByElo(eloMap, bySet as Record<string, import("./calibration-types").SetStimulus[]>);

  // Compute 4B adjacency consistency.
  const retestRows = db
    .prepare(
      `SELECT cr.chosen_stim_id, cr.timeout, ct.left_stim_id, ct.right_stim_id,
              ct.left_preliminary_rank AS left_rank_before, ct.right_preliminary_rank AS right_rank_before
       FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase IN ('within_adjacent_retest', 'within_adjacent_retest_r2')`,
    )
    .all(sessionId) as {
    chosen_stim_id: string | null; timeout: number;
    left_stim_id: string; right_stim_id: string;
    left_rank_before: number; right_rank_before: number;
  }[];

  const adjConsistency: Record<string, { consistent: number; total: number }> = {};
  for (const row of retestRows) {
    if (row.timeout || !row.chosen_stim_id) continue;
    const chosen = row.chosen_stim_id;
    const chosenRank = chosen === row.left_stim_id ? row.left_rank_before : row.right_rank_before;
    const otherRank = chosen === row.left_stim_id ? row.right_rank_before : row.left_rank_before;
    const consistent = chosenRank > otherRank ? 1 : 0;
    for (const sid of [row.left_stim_id, row.right_stim_id]) {
      const entry = adjConsistency[sid] ?? { consistent: 0, total: 0 };
      entry.consistent += consistent;
      entry.total += 1;
      adjConsistency[sid] = entry;
    }
  }

  const entries: import("./calibration-types").WithinSetStableEntry[] = [];
  const now = new Date().toISOString();

  for (const m of members) {
    const eloRank = eloRanks.find((r) => r.stim_id === m.stim_id);
    const elo = eloMap.get(m.stim_id);
    const ac = adjConsistency[m.stim_id];
    const acRate = ac && ac.total > 0 ? ac.consistent / ac.total : null;
    const origRank = ranks4A.find((r) => r.stim_id === m.stim_id)?.rank ?? 0;

    entries.push({
      session_id: sessionId,
      participant_id: participantId,
      set_id: m.set_id,
      stim_id: m.stim_id,
      stimulus_pool_id: m.stimulus_pool_id,
      image_url: m.image_url,
      original_within_rank: origRank,
      stable_within_rank: eloRank?.elo_rank ?? origRank,
      win_count: 0,
      adjacent_retest_result: ac && ac.total > 0 ? (ac.consistent === ac.total ? "consistent" : "inconsistent") : "N/A",
      adjacent_consistency: acRate,
      tie_flag: 0,
      ambiguity_flag: acRate !== null && acRate < 0.5 ? 1 : 0,
      final_stable_rank: eloRank?.elo_rank ?? origRank,
      elo_score: elo?.score,
      calibration_attempt_index: attemptIndex,
      created_at: now,
    });
  }

  return { entries };
}

// ═══════════════════════════════════════════════════════════════
// Stage 4C-a: Cross-set rank-3 anchor ×2 repetitions — 20 trials
// ═══════════════════════════════════════════════════════════════

export function generateCrossSetAnchorMidTrials(
  sessionId: string,
  participantId: string,
  stableRanks: { stim_id: string; set_id: string; final_stable_rank: number }[],
): CalibrationTrial[] {
  _seedCounter = hashStr(sessionId + "_4ca");
  const bySet = loadSetMembers(sessionId);
  const setIds = getActiveSetIds(bySet);

  if (setIds.length < 2) return []; // cross-set requires ≥2 sets

  // Build rank-3 stim lookup per set.
  const rank3Stims: Record<string, string> = {};
  for (const r of stableRanks) {
    if (r.final_stable_rank === 3) rank3Stims[r.set_id] = r.stim_id;
  }

  const imageMap = new Map<string, string>();
  for (const items of Object.values(bySet)) {
    for (const item of items) imageMap.set(item.stim_id, item.image_url);
  }

  const trials: CalibrationTrial[] = [];

  // All set pairs, each presented twice (left/right reversed).
  for (let i = 0; i < setIds.length; i++) {
    for (let j = i + 1; j < setIds.length; j++) {
      const stimA = rank3Stims[setIds[i]];
      const stimB = rank3Stims[setIds[j]];
      if (!stimA || !stimB) continue;

      // Presentation 1
      const swap1 = seededRandom() < 0.5;
      trials.push(makeCrossSetTrial(
        sessionId, participantId, "cross_set_anchor_mid",
        swap1 ? stimB : stimA, swap1 ? stimA : stimB,
        swap1 ? setIds[j] : setIds[i], swap1 ? setIds[i] : setIds[j],
        3, 3, "3v3", "none", imageMap, -1,
      ));

      // Presentation 2 (reversed)
      const swap2 = seededRandom() < 0.5;
      trials.push(makeCrossSetTrial(
        sessionId, participantId, "cross_set_anchor_mid",
        swap2 ? stimA : stimB, swap2 ? stimB : stimA,
        swap2 ? setIds[i] : setIds[j], swap2 ? setIds[j] : setIds[i],
        3, 3, "3v3_retest", "none", imageMap, -1,
      ));
    }
  }

  const shuffled = shuffleArray(trials);
  return shuffled.map((t, i) => ({ ...t, trial_index: i }));
}

// ═══════════════════════════════════════════════════════════════
// Stage 4C-b: Cross-set rank-1 + rank-5 anchors — 20 trials
// ═══════════════════════════════════════════════════════════════

export function generateCrossSetAnchorLowHighTrials(
  sessionId: string,
  participantId: string,
  stableRanks: { stim_id: string; set_id: string; final_stable_rank: number }[],
): CalibrationTrial[] {
  _seedCounter = hashStr(sessionId + "_4cb");
  const bySet = loadSetMembers(sessionId);
  const setIds = getActiveSetIds(bySet);

  if (setIds.length < 2) return [];

  // Build rank → stim lookup per set.
  const bySetRank: Record<string, Record<number, string>> = {};
  for (const r of stableRanks) {
    (bySetRank[r.set_id] ??= {})[r.final_stable_rank] = r.stim_id;
  }

  const imageMap = new Map<string, string>();
  for (const items of Object.values(bySet)) {
    for (const item of items) imageMap.set(item.stim_id, item.image_url);
  }

  const trials: CalibrationTrial[] = [];

  // Rank-1 comparisons across sets.
  for (let i = 0; i < setIds.length; i++) {
    for (let j = i + 1; j < setIds.length; j++) {
      const stimA = bySetRank[setIds[i]]?.[1];
      const stimB = bySetRank[setIds[j]]?.[1];
      if (!stimA || !stimB) continue;

      const swap = seededRandom() < 0.5;
      trials.push(makeCrossSetTrial(
        sessionId, participantId, "cross_set_anchor_low",
        swap ? stimB : stimA, swap ? stimA : stimB,
        swap ? setIds[j] : setIds[i], swap ? setIds[i] : setIds[j],
        1, 1, "1v1", "none", imageMap, -1,
      ));
    }
  }

  // Rank-5 comparisons across sets.
  for (let i = 0; i < setIds.length; i++) {
    for (let j = i + 1; j < setIds.length; j++) {
      const stimA = bySetRank[setIds[i]]?.[5];
      const stimB = bySetRank[setIds[j]]?.[5];
      if (!stimA || !stimB) continue;

      const swap = seededRandom() < 0.5;
      trials.push(makeCrossSetTrial(
        sessionId, participantId, "cross_set_anchor_high",
        swap ? stimB : stimA, swap ? stimA : stimB,
        swap ? setIds[j] : setIds[i], swap ? setIds[i] : setIds[j],
        5, 5, "5v5", "none", imageMap, -1,
      ));
    }
  }

  const shuffled = shuffleArray(trials);
  return shuffled.map((t, i) => ({ ...t, trial_index: i }));
}

// ═══════════════════════════════════════════════════════════════
// Stage 4C-c: Adaptive supplement — 0-15 trials
// ═══════════════════════════════════════════════════════════════

export function generateCrossSetAdaptiveTrials(
  sessionId: string,
  participantId: string,
  flaggedStimuli: { stim_id: string; set_id: string; reason: string }[],
  eloMap: Map<string, { score: number }>,
): CalibrationTrial[] {
  _seedCounter = hashStr(sessionId + "_4cc");
  const bySet = loadSetMembers(sessionId);
  const setIds = getActiveSetIds(bySet);

  if (setIds.length < 2 || flaggedStimuli.length === 0) return [];

  const imageMap = new Map<string, string>();
  for (const items of Object.values(bySet)) {
    for (const item of items) imageMap.set(item.stim_id, item.image_url);
  }

  // Build map of all stimuli with their Elo for finding closest neighbors.
  const allStims: { stim_id: string; set_id: string; elo: number }[] = [];
  for (const setId of setIds) {
    for (const item of (bySet[setId] ?? [])) {
      allStims.push({
        stim_id: item.stim_id,
        set_id: setId,
        elo: eloMap.get(item.stim_id)?.score ?? 1500,
      });
    }
  }

  const trials: CalibrationTrial[] = [];
  const usedPairs = new Set<string>();

  for (const flagged of flaggedStimuli) {
    // Find closest Elo neighbor from a different set.
    const flaggedElo = eloMap.get(flagged.stim_id)?.score ?? 1500;
    let best: typeof allStims[0] | null = null;
    let bestDist = Infinity;

    for (const s of allStims) {
      if (s.set_id === flagged.set_id || s.stim_id === flagged.stim_id) continue;
      const pairKey = [flagged.stim_id, s.stim_id].sort().join("|");
      if (usedPairs.has(pairKey)) continue;
      const dist = Math.abs(flaggedElo - s.elo);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }

    if (!best) continue;

    const pairKey = [flagged.stim_id, best.stim_id].sort().join("|");
    usedPairs.add(pairKey);

    const swap = seededRandom() < 0.5;
    // Determine left/right ranks: estimate rank from Elo position within set.
    const flaggedSetStims = bySet[flagged.set_id] ?? [];
    const targetSetStims = bySet[best.set_id] ?? [];
    const flaggedRank = estimateRankFromElo(flagged.stim_id, flaggedSetStims, eloMap);
    const targetRank = estimateRankFromElo(best.stim_id, targetSetStims, eloMap);

    trials.push(makeCrossSetTrial(
      sessionId, participantId, "cross_set_adaptive",
      swap ? best.stim_id : flagged.stim_id,
      swap ? flagged.stim_id : best.stim_id,
      swap ? best.set_id : flagged.set_id,
      swap ? flagged.set_id : best.set_id,
      swap ? targetRank : flaggedRank,
      swap ? flaggedRank : targetRank,
      "adaptive", "none", imageMap, -1,
    ));

    // Limit to 15 trials max.
    if (trials.length >= 15) break;
  }

  const shuffled = shuffleArray(trials);
  return shuffled.map((t, i) => ({ ...t, trial_index: i }));
}

// ═══════════════════════════════════════════════════════════════
// Build second orthogonalized table — Elo-based, no 50% rule
// ═══════════════════════════════════════════════════════════════

export function buildCrossSetOrthogonalizedTable(
  sessionId: string,
  participantId: string,
  attemptIndex: number,
): { entries: CrossSetOrthogonalizedEntry[] } {
  const db = getDb();

  // Load first stable table.
  const stableRows = db
    .prepare("SELECT * FROM within_set_stable WHERE session_id = ? AND calibration_attempt_index = ?")
    .all(sessionId, attemptIndex) as {
    stim_id: string; set_id: string; final_stable_rank: number; elo_score: number | null;
  }[];

  // Build set members for Elo ranking.
  const bySet: Record<string, { set_id: string; stim_id: string }[]> = {};
  for (const r of stableRows) {
    (bySet[r.set_id] ??= []).push({ set_id: r.set_id, stim_id: r.stim_id });
  }

  // Compute Elo from ALL calibration phases including cross-set.
  const allPhases = [
    "within_full_pair", "within_adjacent_retest", "within_adjacent_retest_r2",
    "cross_set_anchor_mid", "cross_set_anchor_low", "cross_set_anchor_high",
    "cross_set_adaptive",
  ];
  const eloMap = computeAllPhaseElo(sessionId, allPhases);

  // Rank by Elo within each set for calibrated rank.
  const eloRanks = rankWithinSetByElo(eloMap, bySet as Record<string, import("./calibration-types").SetStimulus[]>);

  const entries: CrossSetOrthogonalizedEntry[] = [];
  const now = new Date().toISOString();

  for (const r of stableRows) {
    const stableRank = r.final_stable_rank;
    const eloRank = eloRanks.find((er) => er.stim_id === r.stim_id);
    const elo = eloMap.get(r.stim_id);
    const calibratedRank = eloRank?.elo_rank ?? stableRank;

    // Shift direction relative to stable rank.
    let shiftDir: "up" | "down" | "none" | "ambiguous" = "none";
    if (calibratedRank > stableRank) shiftDir = "up";
    else if (calibratedRank < stableRank) shiftDir = "down";

    entries.push({
      session_id: sessionId,
      participant_id: participantId,
      stim_id: r.stim_id,
      set_id: r.set_id,
      original_liking_rank: stableRank,
      calibrated_liking_rank: calibratedRank,
      shift_direction: shiftDir,
      shift_rate: Math.abs(calibratedRank - stableRank) / 4,
      shift_threshold_met: calibratedRank !== stableRank ? 1 : 0,
      shift_confidence: Math.abs(calibratedRank - stableRank) >= 2 ? "high" : calibratedRank !== stableRank ? "low" : "none",
      evidence_summary: JSON.stringify({ elo_score: elo?.score, elo_comparisons: elo?.comparisons }),
      source_comparisons_count: elo?.comparisons ?? 0,
      wins_against_adjacent_level: 0,
      losses_to_adjacent_level: 0,
      elo_score: elo?.score,
      calibration_attempt_index: attemptIndex,
      created_at: now,
    });
  }

  return { entries };
}

// ─── Cross-set helper ─────────────────────────────────────────

function makeCrossSetTrial(
  sessionId: string, participantId: string, phase: CalibrationPhase,
  leftStim: string, rightStim: string,
  leftSet: string, rightSet: string,
  leftRank: number, rightRank: number,
  boundary: string, expected: "left" | "right" | "none",
  imageMap: Map<string, string>, trialIdx: number,
): CalibrationTrial {
  return {
    id: crypto.randomUUID(),
    session_id: sessionId,
    participant_id: participantId,
    phase,
    trial_index: trialIdx,
    left_stim_id: leftStim,
    right_stim_id: rightStim,
    left_set_id: leftSet,
    right_set_id: rightSet,
    left_rank_before: leftRank,
    right_rank_before: rightRank,
    boundary_type: boundary,
    expected_choice: expected,
    left_image_url: imageMap.get(leftStim) ?? "",
    right_image_url: imageMap.get(rightStim) ?? "",
    created_at: new Date().toISOString(),
  };
}

/** Estimate within-set rank from Elo score (for adaptive trials). */
function estimateRankFromElo(
  stimId: string,
  setStims: { stim_id: string }[],
  eloMap: Map<string, { score: number }>,
): number {
  const scored = setStims.map((s) => ({
    stim_id: s.stim_id,
    elo: eloMap.get(s.stim_id)?.score ?? 1500,
  }));
  scored.sort((a, b) => b.elo - a.elo);
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].stim_id === stimId) return scored.length - i;
  }
  return 3; // fallback to middle
}

// ─── Helpers ─────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
