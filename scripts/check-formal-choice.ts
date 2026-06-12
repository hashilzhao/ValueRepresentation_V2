// @ts-nocheck
/**
 * Formal choice pipeline check.
 * Run: npm run check:formal-choice
 */
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

const DB_PATH = path.join(process.cwd(), "study1.db");
const TEST_CODE = "TEST_FC_PIPELINE";
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

let passed = 0; let failed = 0;
function check(label: string, expected: number, actual: number, detail?: string) {
  const ok = expected === actual;
  if (ok) { passed++; console.log("  ✅ " + label + ": " + actual); }
  else { failed++; console.log("  ❌ " + label + ": expected=" + expected + " actual=" + actual + (detail ? " (" + detail + ")" : "")); }
}

console.log("=== Formal Choice Pipeline Check ===\n");

// Setup test session with cross_set_orthogonalized + value_assignment.
let participant = db.prepare("SELECT id FROM participants WHERE participant_code = ?").get(TEST_CODE) as any;
if (!participant) {
  const pid = crypto.randomUUID();
  db.prepare("INSERT INTO participants (id, participant_code, age, gender, major, consented, consent_timestamp, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(pid, TEST_CODE, 99, "test", "test", 1, new Date().toISOString(), "active", new Date().toISOString());
  participant = { id: pid };
}

const oldSession = db.prepare("SELECT id FROM experiment_sessions WHERE participant_id = ?").get(participant.id) as any;
if (oldSession) {
  for (const t of ["formal_trials","choice_responses","calibration_trials","calibration_responses","liking_validation_trials","liking_validation_responses","value_assignment","stimulus_value_map","subject_selected_stimuli","subject_set_assignment","cross_set_orthogonalized","liking_map","within_set_stable"]) {
    db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(oldSession.id);
  }
  db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(oldSession.id);
}

const sessionId = crypto.randomUUID();
db.prepare("INSERT INTO experiment_sessions (id, participant_id, group_label, current_stage, status, random_seed, started_at, created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run(sessionId, participant.id, "scarcity", "study1_formal_choice", "in_progress", 42, new Date().toISOString(), new Date().toISOString());

const now = new Date().toISOString();

// Seed 25 stimuli + value assignments + cross_set_orthogonalized.
const { initializeStudy1StimulusAssignment } = require("../src/lib/study1/sampling");
initializeStudy1StimulusAssignment(sessionId);

const members = db.prepare("SELECT set_id, stim_id, stimulus_pool_id, image_url, position_in_set FROM subject_set_assignment WHERE session_id = ?").all(sessionId) as any[];
const setIds = ["set_1","set_2","set_3","set_4","set_5"];
const VALUES = [5,10,15,20,25];
for (const [i, sid] of setIds.entries()) {
  db.prepare("INSERT INTO value_assignment (id, session_id, participant_id, set_id, external_value, assignment_pattern_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), sessionId, participant.id, sid, VALUES[i], 0, now, now);
}
check("value_assignment", 5, (db.prepare("SELECT COUNT(*) AS cnt FROM value_assignment WHERE session_id=?").get(sessionId) as any).cnt);

// Create cross_set_orthogonalized: each set gets 5 stimuli with unique calibrated ranks 1-5.
const setStims: Record<string, any[]> = {};
for (const m of members) (setStims[m.set_id] ??= []).push(m);
for (const sid of setIds) {
  const items = setStims[sid] || [];
  for (let i = 0; i < items.length; i++) {
    db.prepare("INSERT OR REPLACE INTO cross_set_orthogonalized (id, session_id, participant_id, stim_id, set_id, original_liking_rank, calibrated_liking_rank, shift_direction, shift_rate, shift_threshold_met, shift_confidence, evidence_summary, source_comparisons_count, wins_against_adjacent_level, losses_to_adjacent_level, calibration_attempt_index, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(), sessionId, participant.id, items[i].stim_id, sid, i+1, i+1, "none", 0, 0, "none", "{}", 0, 0, 0, 0, now);
  }
}
check("cross_set_orthogonalized", 25, (db.prepare("SELECT COUNT(*) AS cnt FROM cross_set_orthogonalized WHERE session_id=?").get(sessionId) as any).cnt);

// Sync liking_map (needed by downstream).
const cs = db.prepare("SELECT stim_id, set_id, calibrated_liking_rank, original_liking_rank FROM cross_set_orthogonalized WHERE session_id = ?").all(sessionId) as any[];
for (const r of cs) {
  const pid = db.prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?").get(r.stim_id) as any;
  db.prepare("INSERT OR REPLACE INTO liking_map (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id, preliminary_liking_rank, final_liking_rank, win_count_within_set, total_pairwise_wins, total_pairwise_losses, preference_score, tie_flag, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,0,NULL,0,?,?)")
    .run(crypto.randomUUID(), sessionId, participant.id, r.set_id, r.stim_id, pid.id, r.original_liking_rank, r.calibrated_liking_rank, now, now);
}

// Generate formal choice trials.
console.log("--- Generating formal trials ---");
const { generateFormalChoiceTrials, trialSummary } = require("../src/lib/study1/formal-trial-generator");
const result = generateFormalChoiceTrials(sessionId, participant.id);
const summary = trialSummary(result.trials);

console.log("Total:", summary.total);
console.log("By type:", JSON.stringify(summary.byType));
console.log("Duplicate pairs:", summary.duplicatePairs);
console.log("HL position: L=" + summary.highLikingLeft + " R=" + summary.highLikingRight);
console.log("HV position: L=" + summary.highValueLeft + " R=" + summary.highValueRight);
console.log("Conflict HV: L=" + summary.conflictHighValueLeft + " R=" + summary.conflictHighValueRight);

check("formal_trials total", 162, summary.total);
check("liking_only", 32, summary.byType["liking_only"] || 0);
check("value_only", 32, summary.byType["value_only"] || 0);
check("congruent", 32, summary.byType["congruent"] || 0);
check("conflict", 66, summary.byType["conflict"] || 0);
check("duplicate pairs", 0, summary.duplicatePairs);
check("repeated pairs", 0, summary.repeatedPairs);

// Verify repeat tracking fields exist in all trials.
const repeatedRows = db.prepare(
  "SELECT repeated_pair_flag, repeat_index, original_pair_key FROM formal_trials WHERE session_id = ? AND repeated_pair_flag = 1"
).all(sessionId) as any[];
check("trials with repeated_pair_flag=1", 0, repeatedRows.length);

// Check all trials use calibrated_liking_rank from cross_set_orthogonalized.
const ftRows = db.prepare("SELECT ft.left_liking_rank, ft.right_liking_rank, ft.left_external_value, ft.right_external_value FROM formal_trials ft WHERE ft.session_id = ?").all(sessionId) as any[];
let badLiking = 0, badValue = 0;
for (const r of ftRows) {
  if (r.left_liking_rank < 1 || r.left_liking_rank > 5) badLiking++;
  if (r.right_liking_rank < 1 || r.right_liking_rank > 5) badLiking++;
  if (!VALUES.includes(r.left_external_value)) badValue++;
  if (!VALUES.includes(r.right_external_value)) badValue++;
}
check("valid liking ranks (1-5)", 0, badLiking);
check("valid external values (5/10/15/20/25)", 0, badValue);

// Check no empty cells used.
const emptyCells = db.prepare("SELECT COUNT(*) AS cnt FROM formal_trials ft WHERE ft.session_id = ? AND (ft.left_stim_id IS NULL OR ft.right_stim_id IS NULL)").get(sessionId) as any;
check("empty cell trials", 0, emptyCells.cnt);

// Check item_pair_key uniqueness.
const pairKeys = db.prepare("SELECT item_pair_key FROM formal_trials WHERE session_id = ?").all(sessionId) as any[];
const dupKeys = pairKeys.length - new Set(pairKeys.map((p: any) => p.item_pair_key)).size;
check("unique item_pair_keys", 0, dupKeys);

// Stim appearance balance.
const stimCounts = {} as Record<string, number>;
for (const t of result.trials) {
  stimCounts[t.left_stim_id] = (stimCounts[t.left_stim_id] || 0) + 1;
  stimCounts[t.right_stim_id] = (stimCounts[t.right_stim_id] || 0) + 1;
}
const counts = Object.values(stimCounts);
const maxCount = Math.max(...counts);
const minCount = Math.min(...counts);
console.log("Stim appearances: min=" + minCount + " max=" + maxCount + " avg=" + (counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(1));

// Clean up.
for (const t of ["formal_trials","choice_responses","calibration_trials","calibration_responses","liking_validation_trials","liking_validation_responses","value_assignment","stimulus_value_map","subject_selected_stimuli","subject_set_assignment","cross_set_orthogonalized","liking_map","within_set_stable"]) {
  db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(sessionId);
}
db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(sessionId);
db.prepare("DELETE FROM participants WHERE id = ?").run(participant.id);
console.log("\n=== Summary ===");
console.log("  Passed: " + passed + "/" + (passed + failed));
if (failed > 0) { console.log("  Failed: " + failed); process.exit(1); }
console.log("  ✅ ALL CHECKS PASSED");
db.close();
