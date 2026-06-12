import { getDb } from "@/lib/db";
import crypto from "crypto";

// ─── Types ─────────────────────────────────────────────────────

interface Stimulus {
  id: string;
  stim_id: string;
  image_url: string;
  visual_category: string;
  complexity_level: string;
  regularity_level: string;
  semantic_risk: string;
}

interface SelectedStimulus extends Stimulus {
  selection_order: number;
}

export interface SetAssignment {
  set_id: string;
  stim_id: string;
  stimulus_pool_id: string;
  image_url: string;
  visual_category: string;
  complexity_level: string;
  regularity_level: string;
  semantic_risk: string;
  position_in_set: number;
}

// ─── Simple seeded PRNG (mulberry32) ──────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Quota ──────────────────────────────────────────────────

const QUOTA_PATTERNS: Record<number, Record<string, number>> = {
  0: { A: 7, B: 6, C: 6, D: 6 },
  1: { A: 6, B: 7, C: 6, D: 6 },
  2: { A: 6, B: 6, C: 7, D: 6 },
  3: { A: 6, B: 6, C: 6, D: 7 },
};

function getSamplingQuota(subjectIndex: number): Record<string, number> {
  return { ...QUOTA_PATTERNS[subjectIndex % 4] };
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Main entry point. Idempotent: returns existing assignment if already created.
 */
export function initializeStudy1StimulusAssignment(sessionId: string): {
  selected: SelectedStimulus[];
  sets: SetAssignment[];
  seed: number;
} {
  const db = getDb();

  // Already initialized?
  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM subject_selected_stimuli WHERE session_id = ?")
    .get(sessionId) as { cnt: number };
  if (existing.cnt > 0) {
    const selected = db
      .prepare(
        `SELECT sss.*, sp.id AS stimulus_pool_id FROM subject_selected_stimuli sss
         JOIN stimulus_pool sp ON sp.stim_id = sss.stim_id
         WHERE sss.session_id = ? ORDER BY selection_order`,
      )
      .all(sessionId) as SelectedStimulus[];
    const sets = db
      .prepare(
        `SELECT * FROM subject_set_assignment WHERE session_id = ? ORDER BY set_id, position_in_set`,
      )
      .all(sessionId) as SetAssignment[];
    const seed = db
      .prepare("SELECT random_seed FROM experiment_sessions WHERE id = ?")
      .get(sessionId) as { random_seed: number };
    return { selected, sets, seed: seed?.random_seed ?? 0 };
  }

  // Determine subject index for quota rotation.
  const totalParticipants = db
    .prepare("SELECT COUNT(*) AS cnt FROM participants")
    .get() as { cnt: number };
  const subjectIndex = totalParticipants.cnt - 1; // zero-based, this participant was just created

  // Generate seed if doesn't exist.
  let seedRow = db
    .prepare("SELECT random_seed FROM experiment_sessions WHERE id = ?")
    .get(sessionId) as { random_seed: number | null };
  let seed = seedRow?.random_seed;
  if (seed == null) {
    seed = Math.floor(Math.random() * 2147483647);
    db.prepare("UPDATE experiment_sessions SET random_seed = ? WHERE id = ?").run(seed, sessionId);
  }
  const rng = mulberry32(seed);

  // Get usable stimuli.
  const usable = getUsableStimuli();

  // Sample 25.
  const quota = getSamplingQuota(subjectIndex);
  const selected = sample25Stimuli(usable, quota, rng);

  // Construct hidden sets.
  const sets = constructHiddenSets(selected, rng);

  // Save.
  const participantRow = db
    .prepare("SELECT participant_id FROM experiment_sessions WHERE id = ?")
    .get(sessionId) as { participant_id: string };

  const insertSelected = db.prepare(`
    INSERT INTO subject_selected_stimuli
      (id, session_id, participant_id, stim_id, stimulus_pool_id,
       image_url, visual_category, complexity_level, regularity_level,
       semantic_risk, selection_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSet = db.prepare(`
    INSERT INTO subject_set_assignment
      (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id,
       image_url, visual_category, complexity_level, regularity_level,
       semantic_risk, position_in_set, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    for (const s of selected) {
      insertSelected.run(
        crypto.randomUUID(), sessionId, participantRow.participant_id,
        s.stim_id, s.id, s.image_url, s.visual_category,
        s.complexity_level, s.regularity_level, s.semantic_risk,
        s.selection_order, now,
      );
    }
    for (const s of sets) {
      insertSet.run(
        crypto.randomUUID(), sessionId, participantRow.participant_id,
        s.set_id, s.stim_id, s.stimulus_pool_id,
        s.image_url, s.visual_category,
        s.complexity_level, s.regularity_level, s.semantic_risk,
        s.position_in_set, now,
      );
    }
  });
  txn();

  return { selected, sets, seed };
}

// ─── Internal ─────────────────────────────────────────────────

function getUsableStimuli(): Stimulus[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, stim_id, image_url, visual_category,
              complexity_level, regularity_level, semantic_risk
       FROM stimulus_pool
       WHERE usable = 1 AND semantic_risk != 'high'
       ORDER BY visual_category, stim_id`,
    )
    .all() as Stimulus[];
}

function sample25Stimuli(
  pool: Stimulus[],
  quota: Record<string, number>,
  rng: () => number,
): SelectedStimulus[] {
  const byCat: Record<string, Stimulus[]> = {};
  for (const s of pool) {
    (byCat[s.visual_category] ??= []).push(s);
  }

  const selected: SelectedStimulus[] = [];
  for (const cat of ["A", "B", "C", "D"]) {
    const catPool = shuffle(byCat[cat] ?? [], rng);
    const n = quota[cat] ?? 6;
    for (let i = 0; i < n && i < catPool.length; i++) {
      selected.push({ ...catPool[i], selection_order: -1 });
    }
  }

  // Shuffle selection order.
  const ordered = shuffle(selected, rng);
  return ordered.map((s, i) => ({ ...s, selection_order: i }));
}

// ─── Set construction with hard category constraints ───────────

/**
 * Build a duplicate-slot plan across the 5 sets.
 *
 * Hard constraint: each of the 5 sets must contain all 4 categories.
 * With 5 slots per set, the structure is 1/1/1/2: three categories appear
 * once, one category appears twice.  That means 5 duplicate slots total.
 *
 * The duplicate slots are assigned to categories proportional to how many
 * stimuli were sampled beyond the base 5 (one per set). For example:
 *   A=7 → 2 extra → A is duplicated in 2 sets
 *   B=6 → 1 extra → B is duplicated in 1 set
 *   etc.
 *
 * Returns a map: set_id → the category that gets the duplicate slot.
 */
function buildDuplicatePlan(
  catCounts: Record<string, number>,
  rng: () => number,
): Record<string, string> {
  // Each category gets at least 1 slot per set = 5 base slots.
  // Extras beyond 5 become duplicate assignments.
  const extra: string[] = [];
  for (const cat of ["A", "B", "C", "D"]) {
    const count = catCounts[cat] ?? 0;
    if (count < 5) {
      throw new Error(
        `Not enough usable stimuli in category ${cat} (have ${count}, need ≥5). Cannot construct balanced hidden sets.`,
      );
    }
    for (let e = 0; e < count - 5; e++) {
      extra.push(cat);
    }
  }

  if (extra.length !== 5) {
    throw new Error(
      `Duplicate slot count mismatch: expected 5, got ${extra.length}. Category counts: ${JSON.stringify(catCounts)}`,
    );
  }

  // Shuffle which sets get which duplicate.
  const shuffled = shuffle(extra, rng);
  const plan: Record<string, string> = {};
  for (let s = 0; s < 5; s++) {
    plan[`set_${s + 1}`] = shuffled[s];
  }
  return plan;
}

/**
 * Soft-balance score for a specific assignment of stimuli to sets.
 * Hard constraints are already satisfied by construction — this only
 * evaluates soft desiderata (complexity, regularity, risk spread).
 */
function evaluateSoftBalance(sets: Record<string, SelectedStimulus[]>): number {
  let penalty = 0;

  for (const items of Object.values(sets)) {
    const riskCounts: Record<string, number> = {};
    const complexities = new Set<string>();
    const regularities = new Set<string>();

    for (const item of items) {
      riskCounts[item.semantic_risk] = (riskCounts[item.semantic_risk] ?? 0) + 1;
      complexities.add(item.complexity_level);
      regularities.add(item.regularity_level);
    }

    // Penalize medium risk concentration (>2 in one set).
    if ((riskCounts["medium"] ?? 0) > 2) penalty += 10;

    // Reward diversity within each set.
    penalty -= complexities.size * 3;
    penalty -= regularities.size * 3;
  }

  return penalty;
}

function constructHiddenSets(
  selected25: SelectedStimulus[],
  rng: () => number,
): SetAssignment[] {
  // Group by category.
  const byCat: Record<string, SelectedStimulus[]> = { A: [], B: [], C: [], D: [] };
  for (const s of selected25) {
    byCat[s.visual_category].push(s);
  }

  const catCounts: Record<string, number> = {};
  for (const cat of ["A", "B", "C", "D"]) {
    catCounts[cat] = byCat[cat].length;
  }

  const duplicatePlan = buildDuplicatePlan(catCounts, rng);

  // Run 500 random assignments to optimise soft balance.
  let bestSets: Record<string, SelectedStimulus[]> | null = null;
  let bestPenalty = Infinity;

  for (let attempt = 0; attempt < 500; attempt++) {
    // Shuffle the stimuli within each category pool.
    const pools: Record<string, SelectedStimulus[]> = {};
    for (const cat of ["A", "B", "C", "D"]) {
      pools[cat] = shuffle(byCat[cat], rng);
    }

    // Assign: each set gets 1 from each category + 1 extra from its duplicate.
    const sets: Record<string, SelectedStimulus[]> = {};
    const ptr: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

    for (let s = 0; s < 5; s++) {
      const setId = `set_${s + 1}`;
      const dup = duplicatePlan[setId];
      const items: SelectedStimulus[] = [];

      for (const cat of ["A", "B", "C", "D"]) {
        items.push(pools[cat][ptr[cat]]);
        ptr[cat]++;
        // If this category is the duplicate for this set, add a second one.
        if (cat === dup) {
          items.push(pools[cat][ptr[cat]]);
          ptr[cat]++;
        }
      }

      // Shuffle within-set order.
      sets[setId] = shuffle(items, rng);
    }

    const penalty = evaluateSoftBalance(sets);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestSets = sets;
    }
  }

  // Convert to flat rows.
  const db = getDb();
  const result: SetAssignment[] = [];
  for (let s = 0; s < 5; s++) {
    const setId = `set_${s + 1}`;
    const items = bestSets![setId];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const poolRow = db
        .prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?")
        .get(item.stim_id) as { id: string };
      result.push({
        set_id: setId,
        stim_id: item.stim_id,
        stimulus_pool_id: poolRow.id,
        image_url: item.image_url,
        visual_category: item.visual_category,
        complexity_level: item.complexity_level,
        regularity_level: item.regularity_level,
        semantic_risk: item.semantic_risk,
        position_in_set: i + 1,
      });
    }
  }

  return result;
}
