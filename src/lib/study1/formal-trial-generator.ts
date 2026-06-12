import crypto from "crypto";
import { getDb } from "@/lib/db";

const DEV = process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true";

const FULL_TARGETS = {
  liking_only: 32,
  value_only: 32,
  congruent: 32,
  conflict: 80,
} as const;

const DEV_TARGETS = {
  liking_only: 4,
  value_only: 4,
  congruent: 4,
  conflict: 8,
} as const;

const TARGETS = DEV ? DEV_TARGETS : FULL_TARGETS;
const MAX_STIM_APPEARANCES = 20;

interface Stim {
  stim_id: string;
  set_id: string;
  calibrated_liking_rank: number; // from cross_set_orthogonalized
  external_value: number;          // from value_assignment
  elo_score: number | null;       // from stimulus_elo (may be null if Elo not computed)
  image_url: string;
}

interface FormalTrial {
  id: string;
  session_id: string;
  participant_id: string;
  trial_index: number;
  trial_type: string;
  left_stim_id: string;
  right_stim_id: string;
  left_image_url: string;
  right_image_url: string;
  left_set_id: string;
  right_set_id: string;
  left_liking_rank: number;
  right_liking_rank: number;
  left_external_value: number;
  right_external_value: number;
  delta_liking: number;
  delta_value: number;
  high_liking_side: string | null;
  high_value_side: string | null;
  congruent_side: string | null;
  conflict_high_value_side: string | null;
  conflict_high_liking_side: string | null;
  high_liking_low_value_side: string | null;   // conflict only
  low_liking_high_value_side: string | null;   // conflict only
  delta_elo: number | null;                    // V3: continuous Elo difference
  item_pair_key: string;
  repeated_pair_flag: number;
  repeat_index: number | null;
  original_pair_key: string | null;
}

// ─── RNG ──────────────────────────────────────────────────────

let _rngState = 0;
function seedRng(s: number) { _rngState = s; }
function rng(): number {
  _rngState = (_rngState * 1664525 + 1013904223) | 0;
  return (_rngState >>> 0) / 4294967296;
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Public API ──────────────────────────────────────────────

export function generateFormalChoiceTrials(
  sessionId: string,
  participantId: string,
): { trials: FormalTrial[]; summary: TrialSummary } {
  const db = getDb();

  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id = ?")
    .get(sessionId) as { cnt: number };
  if (existing.cnt > 0) {
    const trials = db
      .prepare("SELECT * FROM formal_trials WHERE session_id = ? ORDER BY trial_index")
      .all(sessionId) as FormalTrial[];
    return { trials, summary: trialSummary(trials) };
  }

  const seedRow = db
    .prepare("SELECT random_seed FROM experiment_sessions WHERE id = ?")
    .get(sessionId) as { random_seed: number | null };
  const seed = seedRow?.random_seed ?? Math.floor(Math.random() * 2147483647);
  seedRng(seed);

  // Load material pool from cross_set_orthogonalized + value_assignment.
  const stims = db
    .prepare(
      `SELECT cso.stim_id, cso.set_id, cso.calibrated_liking_rank,
              va.external_value,
              se.elo_score,
              ssa.image_url
       FROM cross_set_orthogonalized cso
       JOIN value_assignment va ON va.session_id = cso.session_id AND va.set_id = cso.set_id
       JOIN subject_set_assignment ssa ON ssa.stim_id = cso.stim_id AND ssa.session_id = cso.session_id
       LEFT JOIN stimulus_elo se ON se.session_id = cso.session_id
         AND se.stim_id = cso.stim_id
         AND se.calibration_attempt_index = cso.calibration_attempt_index
       WHERE cso.session_id = ?
       ORDER BY cso.calibrated_liking_rank, va.external_value`
    )
    .all(sessionId) as Stim[];

  if (stims.length < 25) {
    throw new Error(`Material pool too small: ${stims.length} stimuli. Need ≥25 from cross_set_orthogonalized.`);
  }

  // Enumerate unique pairs and classify.
  const usedPairs = new Set<string>();
  const pairsByType: Record<string, [Stim, Stim][]> = {
    liking_only: [], value_only: [], congruent: [], conflict: [],
  };

  for (let a = 0; a < stims.length; a++) {
    for (let b = a + 1; b < stims.length; b++) {
      const key = [stims[a].stim_id, stims[b].stim_id].sort().join("|");
      if (usedPairs.has(key)) continue;
      usedPairs.add(key);
      const type = classifyPair(stims[a], stims[b]);
      pairsByType[type].push([stims[a], stims[b]]);
    }
  }

  const allPairs: [Stim, Stim][] = [];
  const pairKeys = new Set<string>();
  const stimCount = new Map<string, number>();

  function addPair(pair: [Stim, Stim]): boolean {
    const key = [pair[0].stim_id, pair[1].stim_id].sort().join("|");
    if (pairKeys.has(key)) return false;
    // Check stim appearance limit.
    const c0 = stimCount.get(pair[0].stim_id) ?? 0;
    const c1 = stimCount.get(pair[1].stim_id) ?? 0;
    if (c0 >= MAX_STIM_APPEARANCES || c1 >= MAX_STIM_APPEARANCES) return false;
    pairKeys.add(key);
    stimCount.set(pair[0].stim_id, c0 + 1);
    stimCount.set(pair[1].stim_id, c1 + 1);
    allPairs.push(pair);
    return true;
  }

  // Sample from each type.
  for (const type of ["liking_only", "value_only", "congruent"] as const) {
    const pool = shuffle(pairsByType[type]);
    const target = TARGETS[type];
    let added = 0;
    for (const pair of pool) {
      if (added >= target) break;
      if (addPair(pair)) added++;
    }
    if (added < target) {
      console.warn(`[FormalChoice] Only ${added}/${target} ${type} pairs available.`);
    }
  }

  // Conflict: try unique pairs first, then allow limited repeats to reach target.
  const conflictPool = shuffle(pairsByType["conflict"]);
  const conflictTarget = TARGETS.conflict;
  let conflictAdded = 0;
  const remainingConflict: [Stim, Stim][] = [];

  // Round 1: take unique pairs respecting MAX_STIM_APPEARANCES.
  for (const pair of conflictPool) {
    if (conflictAdded >= conflictTarget) break;
    if (addPair(pair)) conflictAdded++;
    else remainingConflict.push(pair);
  }

  // Round 2: if still short, allow repeated pair_keys with tracking.
  if (conflictAdded < conflictTarget) {
    const repeatIndexByKey: Record<string, number> = {};
    const fallbackCandidates = shuffle(remainingConflict);
    for (const pair of fallbackCandidates) {
      if (conflictAdded >= conflictTarget) break;
      const key = [pair[0].stim_id, pair[1].stim_id].sort().join("|");
      const c0 = stimCount.get(pair[0].stim_id) ?? 0;
      const c1 = stimCount.get(pair[1].stim_id) ?? 0;
      if (c0 >= MAX_STIM_APPEARANCES || c1 >= MAX_STIM_APPEARANCES) continue;
      repeatIndexByKey[key] = (repeatIndexByKey[key] ?? 0) + 1;
      (pair as any)._repeated = true;
      (pair as any)._repeat_index = repeatIndexByKey[key];
      (pair as any)._original_pair_key = key;
      pairKeys.add(key);
      stimCount.set(pair[0].stim_id, c0 + 1);
      stimCount.set(pair[1].stim_id, c1 + 1);
      allPairs.push(pair);
      conflictAdded++;
    }
  }

  if (conflictAdded < conflictTarget) {
    console.warn(
      `[FormalChoice] Only ${conflictAdded}/${conflictTarget} conflict pairs ` +
      `(pool exhausted or per-stim cap reached).`,
    );
  }

  // Balance positions and shuffle.
  const balanced = balancePositions(allPairs);
  const shuffled = shuffle(balanced);

  const trials = shuffled.map((pair, idx) =>
    buildTrialRow(pair, sessionId, participantId, idx),
  );

  // Save.
  const insert = db.prepare(`
    INSERT INTO formal_trials
      (id, session_id, participant_id, trial_index, trial_type,
       left_stim_id, right_stim_id, left_image_url, right_image_url,
       left_set_id, right_set_id,
       left_liking_rank, right_liking_rank,
       left_external_value, right_external_value,
       delta_liking, delta_value,
       high_liking_side, high_value_side,
       congruent_side, conflict_high_value_side, conflict_high_liking_side,
       high_liking_low_value_side, low_liking_high_value_side,
       delta_elo,
       item_pair_key, repeated_pair_flag,
       repeat_index, original_pair_key,
       created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const t of trials) {
      insert.run(
        t.id, t.session_id, t.participant_id, t.trial_index, t.trial_type,
        t.left_stim_id, t.right_stim_id, t.left_image_url, t.right_image_url,
        t.left_set_id, t.right_set_id,
        t.left_liking_rank, t.right_liking_rank,
        t.left_external_value, t.right_external_value,
        t.delta_liking, t.delta_value,
        t.high_liking_side, t.high_value_side,
        t.congruent_side, t.conflict_high_value_side, t.conflict_high_liking_side,
        t.high_liking_low_value_side, t.low_liking_high_value_side,
        t.delta_elo,
        t.item_pair_key, t.repeated_pair_flag,
        t.repeat_index, t.original_pair_key,
        now,
      );
    }
  })();

  return { trials, summary: trialSummary(trials) };
}

// ─── Classification ───────────────────────────────────────────

function classifyPair(a: Stim, b: Stim): string {
  const dLiking = b.calibrated_liking_rank - a.calibrated_liking_rank;
  const dValue = b.external_value - a.external_value;

  if (dValue === 0 && dLiking !== 0) return "liking_only";
  if (dLiking === 0 && dValue !== 0) return "value_only";
  if (dLiking * dValue > 0) return "congruent";
  return "conflict";
}

// ─── Position balancing ───────────────────────────────────────

function balancePositions(pairs: [Stim, Stim][]): [Stim, Stim][] {
  // Track balance per type.
  const typeCounters: Record<string, number> = {};
  return pairs.map(([a, b]) => {
    const type = classifyPair(a, b);
    const cnt = typeCounters[type] ?? 0;
    typeCounters[type] = cnt + 1;
    return cnt % 2 === 0 ? [a, b] : [b, a];
  });
}

// ─── Build trial row ──────────────────────────────────────────

function buildTrialRow(
  pair: [Stim, Stim],
  sessionId: string,
  participantId: string,
  trialIndex: number,
): FormalTrial {
  const [left, right] = pair;
  const dLiking = right.calibrated_liking_rank - left.calibrated_liking_rank;
  const dValue = right.external_value - left.external_value;

  const highLikingSide =
    dLiking > 0 ? "right" : dLiking < 0 ? "left" : "none";
  const highValueSide =
    dValue > 0 ? "right" : dValue < 0 ? "left" : "none";

  const type = classifyPair(left, right);

  let congruentSide: string | null = null;
  let conflictHighValueSide: string | null = null;
  let conflictHighLikingSide: string | null = null;
  let highLikingLowValueSide: string | null = null;
  let lowLikingHighValueSide: string | null = null;

  if (type === "congruent") {
    congruentSide = highLikingSide;
  }
  if (type === "conflict") {
    conflictHighValueSide = highValueSide;
    conflictHighLikingSide = highLikingSide;
    highLikingLowValueSide = highLikingSide;
    lowLikingHighValueSide = highValueSide;
  }

  const pairKey = [left.stim_id, right.stim_id].sort().join("|");

  // Read repeat metadata injected by the fallback loop.
  const repeated = (pair as any)._repeated === true;
  const repeatIdx: number | null = (pair as any)._repeat_index ?? null;
  const origKey: string | null = (pair as any)._original_pair_key ?? null;

  return {
    id: crypto.randomUUID(),
    session_id: sessionId,
    participant_id: participantId,
    trial_index: trialIndex,
    trial_type: type,
    left_stim_id: left.stim_id,
    right_stim_id: right.stim_id,
    left_image_url: left.image_url,
    right_image_url: right.image_url,
    left_set_id: left.set_id,
    right_set_id: right.set_id,
    left_liking_rank: left.calibrated_liking_rank,
    right_liking_rank: right.calibrated_liking_rank,
    left_external_value: left.external_value,
    right_external_value: right.external_value,
    delta_liking: dLiking,
    delta_value: dValue,
    delta_elo: (right.elo_score != null && left.elo_score != null)
      ? (right.elo_score! - left.elo_score!)
      : null,
    high_liking_side: highLikingSide,
    high_value_side: highValueSide,
    congruent_side: congruentSide,
    conflict_high_value_side: conflictHighValueSide,
    conflict_high_liking_side: conflictHighLikingSide,
    high_liking_low_value_side: highLikingLowValueSide,
    low_liking_high_value_side: lowLikingHighValueSide,
    item_pair_key: pairKey,
    repeated_pair_flag: repeated ? 1 : 0,
    repeat_index: repeated ? repeatIdx : null,
    original_pair_key: repeated ? origKey : null,
  };
}

// ─── Summary ──────────────────────────────────────────────────

export interface TrialSummary {
  total: number;
  byType: Record<string, number>;
  highLikingLeft: number;
  highLikingRight: number;
  highValueLeft: number;
  highValueRight: number;
  conflictHighValueLeft: number;
  conflictHighValueRight: number;
  duplicatePairs: number;
  repeatedPairs: number;
  deltaLikingDist: Record<number, number>;
  deltaValueDist: Record<number, number>;
}

export function trialSummary(trials: FormalTrial[]): TrialSummary {
  const byType: Record<string, number> = {};
  let hLikingLeft = 0, hLikingRight = 0;
  let hValueLeft = 0, hValueRight = 0;
  let cValLeft = 0, cValRight = 0;
  const pairSet = new Set<string>();
  let dups = 0;
  let repeated = 0;
  const dLDist: Record<number, number> = {};
  const dVDist: Record<number, number> = {};

  for (const t of trials) {
    byType[t.trial_type] = (byType[t.trial_type] ?? 0) + 1;

    if (t.high_liking_side === "left") hLikingLeft++;
    else if (t.high_liking_side === "right") hLikingRight++;

    if (t.high_value_side === "left") hValueLeft++;
    else if (t.high_value_side === "right") hValueRight++;

    if (t.conflict_high_value_side === "left") cValLeft++;
    else if (t.conflict_high_value_side === "right") cValRight++;

    if (pairSet.has(t.item_pair_key)) dups++;
    else pairSet.add(t.item_pair_key);

    if (t.repeated_pair_flag === 1) repeated++;

    dLDist[t.delta_liking] = (dLDist[t.delta_liking] ?? 0) + 1;
    dVDist[t.delta_value] = (dVDist[t.delta_value] ?? 0) + 1;
  }

  return {
    total: trials.length,
    byType,
    highLikingLeft: hLikingLeft,
    highLikingRight: hLikingRight,
    highValueLeft: hValueLeft,
    highValueRight: hValueRight,
    conflictHighValueLeft: cValLeft,
    conflictHighValueRight: cValRight,
    duplicatePairs: dups,
    repeatedPairs: repeated,
    deltaLikingDist: dLDist,
    deltaValueDist: dVDist,
  };
}
