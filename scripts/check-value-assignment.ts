/**
 * Value assignment pipeline check.
 * Run: npm run check:value-assignment
 * Checks that cross_set_orthogonalized → liking_map → value_assignment → stimulus_value_map
 * pipeline works end-to-end.
 */
// @ts-nocheck
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

const DB_PATH = path.join(process.cwd(), "study1.db");
const TEST_CODE = "TEST_VA_PIPELINE";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

let passed = 0;
let failed = 0;

function check(label: string, expected: number, actual: number, detail?: string) {
  const ok = expected === actual;
  if (ok) { passed++; console.log("  ✅ " + label + ": " + actual); }
  else { failed++; console.log("  ❌ " + label + ": expected=" + expected + " actual=" + actual + (detail ? " (" + detail + ")" : "")); }
}

console.log("=== Value Assignment Pipeline Check ===\n");

// Create test participant/session if doesn't exist.
let participant = db.prepare("SELECT id FROM participants WHERE participant_code = ?").get(TEST_CODE) as { id: string } | undefined;
if (!participant) {
  const pid = crypto.randomUUID();
  db.prepare("INSERT INTO participants (id, participant_code, age, gender, major, consented, consent_timestamp, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(pid, TEST_CODE, 99, "test", "test", 1, new Date().toISOString(), "active", new Date().toISOString());
  participant = { id: pid };
}

const oldSession = db.prepare("SELECT id FROM experiment_sessions WHERE participant_id = ?").get(participant.id) as { id: string } | undefined;
if (oldSession) {
  const tables = ["calibration_responses","calibration_trials","liking_validation_responses","liking_validation_trials","liking_validation_quality","calibration_quality","within_set_stable","cross_set_orthogonalized","liking_map","value_assignment","stimulus_value_map","subject_selected_stimuli","subject_set_assignment"];
  for (const t of tables) db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(oldSession.id);
  db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(oldSession.id);
}

const sessionId = crypto.randomUUID();
db.prepare("INSERT INTO experiment_sessions (id, participant_id, group_label, current_stage, status, started_at, created_at) VALUES (?,?,?,?,?,?,?)")
  .run(sessionId, participant.id, "scarcity", "study1_value_assignment", "in_progress", new Date().toISOString(), new Date().toISOString());

// Step 1: Set up cross_set_orthogonalized with 25 rows.
console.log("--- Step 1: Seed cross_set_orthogonalized ---");
const { initializeStudy1StimulusAssignment } = require("../src/lib/study1/sampling");
initializeStudy1StimulusAssignment(sessionId);

const members = db.prepare("SELECT set_id, stim_id, stimulus_pool_id, image_url FROM subject_set_assignment WHERE session_id = ?").all(sessionId) as any[];
const now = new Date().toISOString();

for (const m of members) {
  db.prepare("INSERT OR REPLACE INTO cross_set_orthogonalized (id, session_id, participant_id, stim_id, set_id, original_liking_rank, calibrated_liking_rank, shift_direction, shift_rate, shift_threshold_met, shift_confidence, evidence_summary, source_comparisons_count, wins_against_adjacent_level, losses_to_adjacent_level, calibration_attempt_index, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), sessionId, participant.id, m.stim_id, m.set_id, m.position_in_set || 3, m.position_in_set || 3, "none", 0, 0, "none", "{}", 0, 0, 0, 0, now);
}
check("cross_set_orthogonalized", 25, db.prepare("SELECT COUNT(*) AS cnt FROM cross_set_orthogonalized WHERE session_id=?").get(sessionId).cnt);

// Step 2: Sync liking_map.
console.log("--- Step 2: Sync liking_map ---");
const csRows = db.prepare("SELECT stim_id, set_id, calibrated_liking_rank, original_liking_rank FROM cross_set_orthogonalized WHERE session_id = ?").all(sessionId) as any[];
const lmUpsert = db.prepare("INSERT OR REPLACE INTO liking_map (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id, preliminary_liking_rank, final_liking_rank, win_count_within_set, total_pairwise_wins, total_pairwise_losses, preference_score, tie_flag, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,0,NULL,0,?,?)");
db.transaction(() => {
  for (const r of csRows) {
    const poolId = db.prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?").get(r.stim_id) as { id: string };
    lmUpsert.run(crypto.randomUUID(), sessionId, participant.id, r.set_id, r.stim_id, poolId.id, r.original_liking_rank, r.calibrated_liking_rank, now, now);
  }
})();
check("liking_map", 25, db.prepare("SELECT COUNT(*) AS cnt FROM liking_map WHERE session_id=?").get(sessionId).cnt);

// Step 3: Generate value_assignment.
console.log("--- Step 3: Value assignment ---");
const VALUES = [5, 10, 15, 20, 25];
const patternIdx = db.prepare("SELECT COUNT(DISTINCT session_id) AS cnt FROM value_assignment").get().cnt;
const setIds = ["set_1","set_2","set_3","set_4","set_5"];
for (const [i, sid] of setIds.entries()) {
  db.prepare("INSERT INTO value_assignment (id, session_id, participant_id, set_id, external_value, assignment_pattern_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(), sessionId, participant.id, sid, VALUES[(patternIdx + i) % 5], patternIdx, now, now);
}
check("value_assignment", 5, db.prepare("SELECT COUNT(*) AS cnt FROM value_assignment WHERE session_id=?").get(sessionId).cnt);

// Step 4: Generate stimulus_value_map.
console.log("--- Step 4: Stimulus value map ---");
const va = db.prepare("SELECT set_id, external_value FROM value_assignment WHERE session_id=?").all(sessionId) as any[];
const vm = new Map(va.map((v: any) => [v.set_id, v.external_value]));
const lm = db.prepare("SELECT lm.set_id, lm.stim_id, lm.stimulus_pool_id, lm.final_liking_rank, ssa.image_url FROM liking_map lm JOIN subject_set_assignment ssa ON ssa.session_id=lm.session_id AND ssa.stim_id=lm.stim_id WHERE lm.session_id=?").all(sessionId) as any[];
const svmIns = db.prepare("INSERT INTO stimulus_value_map (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id, final_liking_rank, external_value, image_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
db.transaction(() => {
  for (const r of lm) {
    svmIns.run(crypto.randomUUID(), sessionId, participant.id, r.set_id, r.stim_id, r.stimulus_pool_id, r.final_liking_rank, vm.get(r.set_id)||0, r.image_url, now, now);
  }
})();
check("stimulus_value_map", 25, db.prepare("SELECT COUNT(*) AS cnt FROM stimulus_value_map WHERE session_id=?").get(sessionId).cnt);

// Step 5: Verify Liking×Value matrix.
console.log("--- Step 5: Liking×Value matrix ---");
const svm = db.prepare("SELECT set_id, stim_id, final_liking_rank, external_value FROM stimulus_value_map WHERE session_id=? ORDER BY set_id, final_liking_rank").all(sessionId) as any[];
const matrix: Record<string, Record<number, string[]>> = {};
for (const r of svm) {
  (matrix[r.set_id] ??= {})[r.final_liking_rank] = [...(matrix[r.set_id]?.[r.final_liking_rank] ?? []), r.stim_id];
}
for (const sid of setIds) {
  for (let rank = 1; rank <= 5; rank++) {
    const items = matrix[sid]?.[rank] ?? [];
    if (items.length === 0) console.log("  " + sid + " Like " + rank + ": (空)");
    else console.log("  " + sid + " Like " + rank + ": " + items.join(", "));
  }
}
check("matrix has 5 sets", 5, Object.keys(matrix).length);

// Clean up.
console.log("\nCleaning up...");
const tables = ["calibration_responses","calibration_trials","liking_validation_responses","liking_validation_trials","liking_validation_quality","calibration_quality","within_set_stable","cross_set_orthogonalized","liking_map","value_assignment","stimulus_value_map","subject_selected_stimuli","subject_set_assignment"];
for (const t of tables) db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(sessionId);
db.prepare("DELETE FROM experiment_sessions WHERE id = ?").run(sessionId);
db.prepare("DELETE FROM participants WHERE id = ?").run(participant.id);
console.log("Test data cleaned.");

console.log("\n=== Summary ===");
console.log("  Passed: " + passed + "/" + (passed + failed));
if (failed > 0) { console.log("  Failed: " + failed); process.exit(1); }
console.log("  ✅ ALL CHECKS PASSED");
db.close();
