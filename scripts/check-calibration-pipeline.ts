/**
 * Calibration pipeline self-check script.
 * Run: npm run check:calibration
 *
 * Creates a test session, walks through all calibration phases,
 * and verifies counts at each step.
 */
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "study1.db");

interface CheckResult {
  step: string;
  expected: number;
  actual: number;
  pass: boolean;
  detail?: string;
}

const results: CheckResult[] = [];
let passed = 0;
let failed = 0;

function check(label: string, expected: number, actual: number, detail?: string) {
  const ok = expected === actual;
  results.push({ step: label, expected, actual, pass: ok, detail });
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}: expected=${expected} actual=${actual}${detail ? " (" + detail + ")" : ""}`);
}

// ── Setup ────────────────────────────────────────────────────

console.log("=== Calibration Pipeline Self-Check ===\n");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create or find test participant.
const TEST_CODE = "TEST_CAL_PIPELINE";

let participant = db.prepare("SELECT id FROM participants WHERE participant_code = ?").get(TEST_CODE) as { id: string } | undefined;
if (!participant) {
  const pid = crypto.randomUUID();
  db.prepare("INSERT INTO participants (id, participant_code, age, gender, major, consented, consent_timestamp, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(pid, TEST_CODE, 99, "test", "test", 1, new Date().toISOString(), "active", new Date().toISOString());
  participant = { id: pid };
}

// Delete old test session if exists.
const oldSession = db.prepare("SELECT id FROM experiment_sessions WHERE participant_id = ?").get(participant.id) as { id: string } | undefined;
if (oldSession) {
  // Clean all related data.
  const tables = [
    "calibration_responses", "calibration_trials",
    "liking_validation_responses", "liking_validation_trials",
    "liking_validation_quality", "calibration_quality",
    "within_set_stable", "cross_set_orthogonalized",
    "stage_game_trials", "stage_game_responses",
    "subject_selected_stimuli", "subject_set_assignment",
    "value_assignment", "stimulus_value_map",
    "formal_trials", "choice_responses",
  ];
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(oldSession.id);
  }
  db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(oldSession.id);
}

// Create new test session.
const sessionId = crypto.randomUUID();
const group = "scarcity";
db.prepare("INSERT INTO experiment_sessions (id, participant_id, group_label, current_stage, status, resource_balance, started_at, created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run(sessionId, participant.id, group, "study1_liking_ranking", "in_progress", 0, new Date().toISOString(), new Date().toISOString());

console.log("Test session:", sessionId.slice(0, 8), "...\n");

// ── Step 1: Initialize stimulus assignment ────────────────────

console.log("--- Step 1: Stimulus Assignment ---");
try {
  const { initializeStudy1StimulusAssignment } = require("../src/lib/study1/sampling");
  initializeStudy1StimulusAssignment(sessionId);
} catch (e: any) {
  console.log("  ❌ Error:", e.message);
  failed++;
}

const selCount = (db.prepare("SELECT COUNT(*) AS cnt FROM subject_selected_stimuli WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
const setCount = (db.prepare("SELECT COUNT(*) AS cnt FROM subject_set_assignment WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
check("subject_selected_stimuli", 25, selCount);
check("subject_set_assignment", 25, setCount);

// Check image urls.
const badUrlCount = (db.prepare("SELECT COUNT(*) AS cnt FROM subject_set_assignment WHERE session_id = ? AND (image_url = '' OR image_url IS NULL)").get(sessionId) as { cnt: number }).cnt;
check("missing image_url in set_assignment", 0, badUrlCount);

// ── Step 2: Generate 4A ──────────────────────────────────────

console.log("\n--- Step 2: Phase 4A (within_full_pair) ---");
try {
  const { generateWithinFullPairTrials } = require("../src/lib/study1/calibration-generator");
  const trials4A = generateWithinFullPairTrials(sessionId, participant.id);
  const insert = db.prepare(`INSERT INTO calibration_trials (id, session_id, participant_id, phase, trial_index, left_stim_id, right_stim_id, left_set_id, right_set_id, left_preliminary_rank, right_preliminary_rank, expected_choice, left_image_url, right_image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const t of trials4A) {
      insert.run(t.id, t.session_id, t.participant_id, t.phase, t.trial_index, t.left_stim_id, t.right_stim_id, t.left_set_id, t.right_set_id, t.left_rank_before, t.right_rank_before, t.expected_choice, t.left_image_url, t.right_image_url, now);
    }
  })();
} catch (e: any) {
  console.log("  ❌ Error:", e.message);
  failed++;
}
const phase4aCount = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = 'within_full_pair'").get(sessionId) as { cnt: number }).cnt;
check("within_full_pair trials", 50, phase4aCount);

// Check trial image urls.
const badCalUrl = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND (left_image_url = '' OR right_image_url = '' OR left_image_url IS NULL OR right_image_url IS NULL)").get(sessionId) as { cnt: number }).cnt;
check("calibration trials missing image_url", 0, badCalUrl);

// ── Step 3: Simulate 4A responses ────────────────────────────

console.log("\n--- Step 3: Simulate 4A responses ---");
const trials4A = db.prepare("SELECT id, left_stim_id, right_stim_id, phase, left_preliminary_rank, right_preliminary_rank FROM calibration_trials WHERE session_id = ? AND phase = 'within_full_pair' ORDER BY trial_index").all(sessionId) as any[];
const insResp = db.prepare("INSERT OR IGNORE INTO calibration_responses (id, session_id, participant_id, trial_id, phase, left_stim_id, right_stim_id, response_side, chosen_stim_id, response_method, rt_ms, timeout, consistent, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
const now = new Date().toISOString();
db.transaction(() => {
  for (const t of trials4A) {
    // Simulate: randomly choose left or right.
    const side = Math.random() < 0.5 ? "left" : "right";
    const chosen = side === "left" ? t.left_stim_id : t.right_stim_id;
    insResp.run(crypto.randomUUID(), sessionId, participant.id, t.id, t.phase, t.left_stim_id, t.right_stim_id, side, chosen, "keyboard", 500 + Math.random() * 1500, 0, null, now);
  }
})();
const phase4aDone = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses cr JOIN calibration_trials ct ON ct.id = cr.trial_id WHERE cr.session_id = ? AND ct.phase = 'within_full_pair'").get(sessionId) as { cnt: number }).cnt;
check("within_full_pair responses", 50, phase4aDone);

// ── Step 4: Trigger 4A→4B transition ─────────────────────────

console.log("\n--- Step 4: Phase 4A→4B transition ---");
try {
  const { inferWithinSetRanks, generateWithinAdjacentRetestTrials } = require("../src/lib/study1/calibration-generator");
  const ranks4A = inferWithinSetRanks(sessionId);
  const trials4B = generateWithinAdjacentRetestTrials(sessionId, participant.id, ranks4A.map((r: any) => ({ stim_id: r.stim_id, set_id: r.set_id, rank: r.rank })));
  const maxIdx4A = (db.prepare("SELECT MAX(trial_index) AS mx FROM calibration_trials WHERE session_id = ?").get(sessionId) as { mx: number }).mx;
  const insert2 = db.prepare(`INSERT INTO calibration_trials (id, session_id, participant_id, phase, trial_index, left_stim_id, right_stim_id, left_set_id, right_set_id, left_preliminary_rank, right_preliminary_rank, expected_choice, left_image_url, right_image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (let i = 0; i < trials4B.length; i++) {
      const t = trials4B[i];
      insert2.run(t.id, t.session_id, t.participant_id, t.phase, maxIdx4A + 1 + i, t.left_stim_id, t.right_stim_id, t.left_set_id, t.right_set_id, t.left_rank_before, t.right_rank_before, t.expected_choice, t.left_image_url, t.right_image_url, now);
    }
  })();
} catch (e: any) {
  console.log("  ❌ Error:", e.message);
  failed++;
}
const phase4bCount = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = 'within_adjacent_retest'").get(sessionId) as { cnt: number }).cnt;
check("within_adjacent_retest trials", 20, phase4bCount);

// ── Step 5: Simulate 4B responses ────────────────────────────

console.log("\n--- Step 5: Simulate 4B responses ---");
const trials4B = db.prepare("SELECT id, left_stim_id, right_stim_id, phase, left_preliminary_rank, right_preliminary_rank FROM calibration_trials WHERE session_id = ? AND phase = 'within_adjacent_retest' ORDER BY trial_index").all(sessionId) as any[];
db.transaction(() => {
  for (const t of trials4B) {
    const higherRank = (t.left_preliminary_rank ?? 0) > (t.right_preliminary_rank ?? 0) ? "left" : "right";
    // 80% consistent with rank, 20% random
    const side = Math.random() < 0.8 ? higherRank : (higherRank === "left" ? "right" : "left");
    const chosen = side === "left" ? t.left_stim_id : t.right_stim_id;
    insResp.run(crypto.randomUUID(), sessionId, participant.id, t.id, t.phase, t.left_stim_id, t.right_stim_id, side, chosen, "keyboard", 500 + Math.random() * 1500, 0, null, now);
  }
})();
const phase4bDone = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses cr JOIN calibration_trials ct ON ct.id = cr.trial_id WHERE cr.session_id = ? AND ct.phase = 'within_adjacent_retest'").get(sessionId) as { cnt: number }).cnt;
check("within_adjacent_retest responses", 20, phase4bDone);

// ── Step 6: Trigger 4B→4C transition ─────────────────────────

console.log("\n--- Step 6: Phase 4B→4C transition ---");
try {
  const { saveWithinSetStableTable, getCalibrationAttemptIndex } = require("../src/lib/study1/calibration-scoring");
  const { generateCrossSetBoundaryTrials } = require("../src/lib/study1/calibration-generator");
  const attemptIdx = getCalibrationAttemptIndex(sessionId);
  saveWithinSetStableTable(sessionId, participant.id, attemptIdx);
  const stableRows = db.prepare("SELECT stim_id, set_id, final_stable_rank FROM within_set_stable WHERE session_id = ? AND calibration_attempt_index = ?").all(sessionId, attemptIdx) as any[];
  const trials4C = generateCrossSetBoundaryTrials(sessionId, participant.id, stableRows);
  const maxIdx4B = (db.prepare("SELECT MAX(trial_index) AS mx FROM calibration_trials WHERE session_id = ?").get(sessionId) as { mx: number }).mx;
  const insert3 = db.prepare(`INSERT INTO calibration_trials (id, session_id, participant_id, phase, trial_index, left_stim_id, right_stim_id, left_set_id, right_set_id, left_preliminary_rank, right_preliminary_rank, expected_choice, left_image_url, right_image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (let i = 0; i < trials4C.length; i++) {
      const t = trials4C[i];
      insert3.run(t.id, t.session_id, t.participant_id, t.phase, maxIdx4B + 1 + i, t.left_stim_id, t.right_stim_id, t.left_set_id, t.right_set_id, t.left_rank_before, t.right_rank_before, t.expected_choice, t.left_image_url, t.right_image_url, now);
    }
  })();
} catch (e: any) {
  console.log("  ❌ Error:", e.message);
  failed++;
}

const wsCount = (db.prepare("SELECT COUNT(*) AS cnt FROM within_set_stable WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
check("within_set_stable rows", 25, wsCount);

const phase4cCount = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = 'cross_set_boundary'").get(sessionId) as { cnt: number }).cnt;
check("cross_set_boundary trials", 80, phase4cCount);

// ── Step 7: Simulate 4C responses ────────────────────────────

console.log("\n--- Step 7: Simulate 4C responses ---");
const trials4C = db.prepare("SELECT id, left_stim_id, right_stim_id, phase, left_preliminary_rank, right_preliminary_rank FROM calibration_trials WHERE session_id = ? AND phase = 'cross_set_boundary' ORDER BY trial_index").all(sessionId) as any[];
db.transaction(() => {
  for (const t of trials4C) {
    const higherRank = (t.left_preliminary_rank ?? 0) > (t.right_preliminary_rank ?? 0) ? "left" : "right";
    // 55% choose higher rank (creates some movement)
    const side = Math.random() < 0.55 ? higherRank : (higherRank === "left" ? "right" : "left");
    const chosen = side === "left" ? t.left_stim_id : t.right_stim_id;
    insResp.run(crypto.randomUUID(), sessionId, participant.id, t.id, t.phase, t.left_stim_id, t.right_stim_id, side, chosen, "keyboard", 500 + Math.random() * 1500, 0, null, now);
  }
})();
const phase4cDone = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses cr JOIN calibration_trials ct ON ct.id = cr.trial_id WHERE cr.session_id = ? AND ct.phase = 'cross_set_boundary'").get(sessionId) as { cnt: number }).cnt;
check("cross_set_boundary responses", 80, phase4cDone);

// ── Step 8: Build second table ───────────────────────────────

console.log("\n--- Step 8: Build second table ---");
try {
  const { saveCrossSetOrthogonalizedTable, syncLikingMapFromOrthogonalized } = require("../src/lib/study1/calibration-scoring");
  const attemptIdx = (db.prepare("SELECT calibration_attempt_index FROM experiment_sessions WHERE id = ?").get(sessionId) as { calibration_attempt_index: number }).calibration_attempt_index;
  saveCrossSetOrthogonalizedTable(sessionId, participant.id, attemptIdx);
  syncLikingMapFromOrthogonalized(sessionId, participant.id, attemptIdx);
} catch (e: any) {
  console.log("  ❌ Error:", e.message);
  failed++;
}
const csCount = (db.prepare("SELECT COUNT(*) AS cnt FROM cross_set_orthogonalized WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
check("cross_set_orthogonalized rows", 25, csCount);

const lmCount = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_map WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
check("liking_map rows", 25, lmCount);

const shiftCounts = db.prepare("SELECT shift_direction, COUNT(*) AS cnt FROM cross_set_orthogonalized WHERE session_id = ? GROUP BY shift_direction").all(sessionId) as any[];
console.log("  Shift distribution:", shiftCounts.map((r: any) => r.shift_direction + ":" + r.cnt).join(", "));

// ── Step 9: Generate validation trials ────────────────────────

console.log("\n--- Step 9: Validation generation ---");
try {
  const attemptIdx = (db.prepare("SELECT calibration_attempt_index FROM experiment_sessions WHERE id = ?").get(sessionId) as { calibration_attempt_index: number }).calibration_attempt_index;
  const rows = db.prepare("SELECT cso.stim_id, cso.set_id, cso.calibrated_liking_rank, ssa.image_url FROM cross_set_orthogonalized cso JOIN subject_set_assignment ssa ON ssa.session_id = cso.session_id AND ssa.stim_id = cso.stim_id WHERE cso.session_id = ? AND cso.calibration_attempt_index = ?").all(sessionId, attemptIdx) as any[];
  const byRank: Record<number, any[]> = {};
  for (const r of rows) (byRank[r.calibrated_liking_rank] ??= []).push(r);

  const vTrials: any[] = [];
  let vIdx = 0;
  // 30 different-rank
  const diffPairs: [number, number][] = [[1, 3], [2, 4], [3, 5], [1, 4], [2, 5], [1, 5]];
  for (const [lo, hi] of diffPairs) {
    const loItems = byRank[lo] ?? [];
    const hiItems = byRank[hi] ?? [];
    for (const loItem of loItems) {
      for (const hiItem of hiItems) {
        if (vTrials.length >= 30) break;
        const swap = Math.random() < 0.5;
        vTrials.push({
          id: crypto.randomUUID(), session_id: sessionId, trial_index: vIdx++, validation_type: "different_rank",
          left_stim_id: swap ? loItem.stim_id : hiItem.stim_id,
          right_stim_id: swap ? hiItem.stim_id : loItem.stim_id,
          left_set_id: swap ? loItem.set_id : hiItem.set_id,
          right_set_id: swap ? hiItem.set_id : loItem.set_id,
          left_liking_rank: swap ? lo : hi, right_liking_rank: swap ? hi : lo,
          expected_choice: swap ? "right" : "left",
          left_image_url: swap ? loItem.image_url : hiItem.image_url,
          right_image_url: swap ? hiItem.image_url : loItem.image_url,
          created_at: now,
        });
      }
      if (vTrials.length >= 30) break;
    }
    if (vTrials.length >= 30) break;
  }
  // 15 same-rank
  for (let rank = 1; rank <= 5 && vTrials.length < 45; rank++) {
    const items = byRank[rank] ?? [];
    for (let a = 0; a < items.length && vTrials.length < 45; a++) {
      for (let b = a + 1; b < items.length && vTrials.length < 45; b++) {
        const swap = Math.random() < 0.5;
        vTrials.push({
          id: crypto.randomUUID(), session_id: sessionId, trial_index: vIdx++, validation_type: "same_rank",
          left_stim_id: swap ? items[b].stim_id : items[a].stim_id,
          right_stim_id: swap ? items[a].stim_id : items[b].stim_id,
          left_set_id: swap ? items[b].set_id : items[a].set_id,
          right_set_id: swap ? items[a].set_id : items[b].set_id,
          left_liking_rank: rank, right_liking_rank: rank,
          expected_choice: "none",
          left_image_url: swap ? items[b].image_url : items[a].image_url,
          right_image_url: swap ? items[a].image_url : items[b].image_url,
          created_at: now,
        });
      }
    }
  }
  const vInsert = db.prepare("INSERT INTO liking_validation_trials (id, session_id, participant_id, trial_index, validation_type, left_stim_id, right_stim_id, left_set_id, right_set_id, left_liking_rank, right_liking_rank, expected_choice, left_image_url, right_image_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  db.transaction(() => {
    for (const t of vTrials) {
      vInsert.run(t.id, t.session_id, participant.id, t.trial_index, t.validation_type, t.left_stim_id, t.right_stim_id, t.left_set_id, t.right_set_id, t.left_liking_rank, t.right_liking_rank, t.expected_choice, t.left_image_url, t.right_image_url, t.created_at);
    }
  })();
} catch (e: any) {
  console.log("  ❌ Error:", e.message);
  failed++;
}
const vCount = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_trials WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
check("validation trials", 45, vCount);

// ── Summary ──────────────────────────────────────────────────

console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}/${results.length}`);
console.log(`  Failed: ${failed}/${results.length}`);

if (failed > 0) {
  console.log("\n  FAILED CHECKS:");
  for (const r of results) {
    if (!r.pass) console.log(`    ❌ ${r.step}: expected=${r.expected} actual=${r.actual}`);
  }
} else {
  console.log("\n  ✅ ALL CHECKS PASSED");
}

// Clean up test data.
console.log("\nCleaning up test session...");
for (const t of ["calibration_responses", "calibration_trials", "liking_validation_responses", "liking_validation_trials", "liking_validation_quality", "calibration_quality", "within_set_stable", "cross_set_orthogonalized", "stage_game_trials", "stage_game_responses", "subject_selected_stimuli", "subject_set_assignment"]) {
  db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(sessionId);
}
db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(sessionId);
db.prepare("DELETE FROM participants WHERE id = ?").run(participant.id);
console.log("Test data cleaned.");

db.close();

if (failed > 0) process.exit(1);
process.exit(0);
