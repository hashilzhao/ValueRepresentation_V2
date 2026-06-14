import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "study1.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    seedAdmin(db);
    autoSeedStimuli(db);
    backfillStimulusVersions(db);
  }
  return db;
}

function autoSeedStimuli(database: Database.Database) {
  const cnt = database.prepare("SELECT COUNT(*) AS cnt FROM stimulus_pool").get() as { cnt: number };
  if (cnt.cnt === 0) {
    try {
      const { seedStimulusPool } = require("@/lib/stimulus-seed");
      seedStimulusPool();
    } catch { /* seed not available or no files */ }
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      participant_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL CHECK (gender IN ('male','female')),
      grade TEXT NOT NULL DEFAULT '',
      major TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      consented INTEGER NOT NULL DEFAULT 0,
      consent_timestamp TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'excluded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS experiment_sessions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      group_label TEXT NOT NULL DEFAULT 'scarcity' CHECK (group_label IN ('scarcity', 'abundance')),
      current_stage TEXT NOT NULL DEFAULT 'baseline_questionnaire',
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'excluded')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_participants_code ON participants(participant_code);
    CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_participant ON experiment_sessions(participant_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON experiment_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_event_logs_session ON event_logs(session_id);

    CREATE TABLE IF NOT EXISTS stage_game_trials (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      block_index INTEGER NOT NULL,
      trial_index INTEGER NOT NULL,
      global_trial_index INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      stimulus_payload TEXT,
      correct_answer TEXT NOT NULL,
      preset_feedback_direction TEXT NOT NULL CHECK (preset_feedback_direction IN ('gain','loss','none')),
      preset_feedback_points INTEGER NOT NULL,
      planned_balance_after INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stage_game_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      block_index INTEGER NOT NULL DEFAULT 0,
      trial_index INTEGER NOT NULL DEFAULT 0,
      global_trial_index INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      stimulus_payload TEXT,
      correct_answer TEXT NOT NULL,
      response TEXT,
      accuracy INTEGER,
      rt_ms REAL,
      missed_response INTEGER NOT NULL DEFAULT 0,
      timeout INTEGER NOT NULL DEFAULT 0,
      feedback_mode TEXT NOT NULL DEFAULT 'preset',
      preset_feedback_direction TEXT NOT NULL,
      preset_feedback_points INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      dot_count_left INTEGER,
      dot_count_right INTEGER,
      correct_side TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trials_session ON stage_game_trials(session_id);
    CREATE INDEX IF NOT EXISTS idx_trials_global ON stage_game_trials(session_id, global_trial_index);
    CREATE INDEX IF NOT EXISTS idx_responses_session ON stage_game_responses(session_id);

    CREATE TABLE IF NOT EXISTS manipulation_check_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL,
      construct TEXT NOT NULL,
      item_text TEXT NOT NULL,
      response_value INTEGER NOT NULL CHECK (response_value BETWEEN 1 AND 7),
      reverse_scored INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS manipulation_check_summary (
      session_id TEXT PRIMARY KEY REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      resource_insufficiency_mean REAL,
      resource_confidence_mean REAL,
      stress_negative_affect_mean REAL,
      task_engagement_mean REAL
    );

    CREATE INDEX IF NOT EXISTS idx_mc_responses_session ON manipulation_check_responses(session_id);

    CREATE TABLE IF NOT EXISTS stimulus_pool (
      id TEXT PRIMARY KEY,
      stim_id TEXT NOT NULL UNIQUE,
      storage_path TEXT NOT NULL,
      image_url TEXT NOT NULL,
      visual_category TEXT NOT NULL CHECK (visual_category IN ('A','B','C','D')),
      complexity_level TEXT NOT NULL DEFAULT 'low_medium',
      regularity_level TEXT NOT NULL DEFAULT 'regular',
      semantic_risk TEXT NOT NULL DEFAULT 'low' CHECK (semantic_risk IN ('low','medium','high')),
      usable INTEGER NOT NULL DEFAULT 1,
      stimulus_version INTEGER NOT NULL DEFAULT 1,
      original_filename TEXT NOT NULL,
      width_px INTEGER,
      height_px INTEGER,
      file_size_bytes INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stimulus_category ON stimulus_pool(visual_category);
    CREATE INDEX IF NOT EXISTS idx_stimulus_usable ON stimulus_pool(usable);

    CREATE TABLE IF NOT EXISTS stimulus_versions (
      id TEXT PRIMARY KEY,
      stim_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      file_path TEXT,
      original_filename TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      width_px INTEGER,
      height_px INTEGER,
      file_size_bytes INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stim_id, version_number)
    );

    CREATE INDEX IF NOT EXISTS idx_stimulus_versions_stim_id ON stimulus_versions(stim_id);

    CREATE TABLE IF NOT EXISTS subject_selected_stimuli (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      stim_id TEXT NOT NULL,
      stimulus_pool_id TEXT NOT NULL REFERENCES stimulus_pool(id),
      image_url TEXT NOT NULL,
      visual_category TEXT NOT NULL,
      complexity_level TEXT NOT NULL,
      regularity_level TEXT NOT NULL,
      semantic_risk TEXT NOT NULL,
      selection_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subject_set_assignment (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL CHECK (set_id IN ('set_1','set_2','set_3','set_4','set_5')),
      stim_id TEXT NOT NULL,
      stimulus_pool_id TEXT NOT NULL REFERENCES stimulus_pool(id),
      image_url TEXT NOT NULL,
      visual_category TEXT NOT NULL,
      complexity_level TEXT NOT NULL,
      regularity_level TEXT NOT NULL,
      semantic_risk TEXT NOT NULL,
      position_in_set INTEGER NOT NULL CHECK (position_in_set BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subject_stimuli_session ON subject_selected_stimuli(session_id);
    CREATE INDEX IF NOT EXISTS idx_subject_sets_session ON subject_set_assignment(session_id);

    CREATE TABLE IF NOT EXISTS calibration_trials (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      phase TEXT NOT NULL CHECK (phase IN ('within_set','cross_set_same_rank','cross_set_near_rank','cross_set_anchor','within_full_pair','within_adjacent_retest','within_adjacent_retest_r2','cross_set_boundary','cross_set_anchor_mid','cross_set_anchor_low','cross_set_anchor_high','cross_set_adaptive')),
      trial_index INTEGER NOT NULL,
      left_stim_id TEXT NOT NULL,
      right_stim_id TEXT NOT NULL,
      left_set_id TEXT NOT NULL,
      right_set_id TEXT NOT NULL,
      left_preliminary_rank INTEGER,
      right_preliminary_rank INTEGER,
      expected_choice TEXT CHECK (expected_choice IN ('left','right','none')),
      boundary_type TEXT,
      left_image_url TEXT NOT NULL,
      right_image_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calibration_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      trial_id TEXT NOT NULL REFERENCES calibration_trials(id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      left_stim_id TEXT NOT NULL,
      right_stim_id TEXT NOT NULL,
      response_side TEXT CHECK (response_side IN ('left','right')),
      chosen_stim_id TEXT,
      response_method TEXT CHECK (response_method IN ('keyboard','mouse')),
      rt_ms REAL,
      timeout INTEGER NOT NULL DEFAULT 0,
      consistent INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liking_map (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL,
      stim_id TEXT NOT NULL,
      stimulus_pool_id TEXT NOT NULL REFERENCES stimulus_pool(id),
      preliminary_liking_rank INTEGER,
      final_liking_rank INTEGER NOT NULL CHECK (final_liking_rank BETWEEN 1 AND 5),
      win_count_within_set INTEGER NOT NULL DEFAULT 0,
      total_pairwise_wins INTEGER NOT NULL DEFAULT 0,
      total_pairwise_losses INTEGER NOT NULL DEFAULT 0,
      preference_score REAL,
      tie_flag INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calibration_quality (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      within_set_consistency INTEGER,
      cross_set_anchor_consistency INTEGER,
      cross_set_near_rank_consistency INTEGER,
      cross_set_same_rank_bias_flag INTEGER NOT NULL DEFAULT 0,
      tie_flag_count INTEGER NOT NULL DEFAULT 0,
      timeout_rate REAL,
      mean_rt_ms REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_calibration_trials_session ON calibration_trials(session_id);
    CREATE INDEX IF NOT EXISTS idx_calibration_responses_session ON calibration_responses(session_id);
    CREATE INDEX IF NOT EXISTS idx_liking_map_session ON liking_map(session_id);

    -- V2: within-set stable modeling table (first table)
    CREATE TABLE IF NOT EXISTS within_set_stable (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL,
      stim_id TEXT NOT NULL,
      stimulus_pool_id TEXT NOT NULL REFERENCES stimulus_pool(id),
      image_url TEXT NOT NULL,
      original_within_rank INTEGER NOT NULL,
      stable_within_rank INTEGER NOT NULL,
      win_count INTEGER NOT NULL DEFAULT 0,
      adjacent_retest_result TEXT NOT NULL DEFAULT 'N/A',
      adjacent_consistency REAL,
      tie_flag INTEGER NOT NULL DEFAULT 0,
      ambiguity_flag INTEGER NOT NULL DEFAULT 0,
      final_stable_rank INTEGER NOT NULL,
      calibration_attempt_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_within_set_stable_session ON within_set_stable(session_id);

    -- V2: cross-set orthogonalized table (second table)
    CREATE TABLE IF NOT EXISTS cross_set_orthogonalized (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      stim_id TEXT NOT NULL,
      set_id TEXT NOT NULL,
      original_liking_rank INTEGER NOT NULL,
      calibrated_liking_rank INTEGER NOT NULL,
      shift_direction TEXT NOT NULL DEFAULT 'none' CHECK (shift_direction IN ('up','down','none','ambiguous')),
      shift_rate REAL NOT NULL DEFAULT 0,
      shift_threshold_met INTEGER NOT NULL DEFAULT 0,
      shift_confidence TEXT NOT NULL DEFAULT 'none' CHECK (shift_confidence IN ('none','low','high','ambiguous')),
      evidence_summary TEXT,
      source_comparisons_count INTEGER NOT NULL DEFAULT 0,
      wins_against_adjacent_level INTEGER NOT NULL DEFAULT 0,
      losses_to_adjacent_level INTEGER NOT NULL DEFAULT 0,
      calibration_attempt_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cross_set_orth_session ON cross_set_orthogonalized(session_id);

    -- V3: stimulus Elo scores for continuous likeability measurement
    CREATE TABLE IF NOT EXISTS stimulus_elo (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      stim_id TEXT NOT NULL,
      set_id TEXT NOT NULL,
      elo_score REAL NOT NULL DEFAULT 1500.0,
      elo_volatility REAL NOT NULL DEFAULT 200.0,
      comparisons_count INTEGER NOT NULL DEFAULT 0,
      calibration_attempt_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stimulus_elo_session ON stimulus_elo(session_id, calibration_attempt_index);

    -- V3: calibration stability report (5-dimension validation)
    CREATE TABLE IF NOT EXISTS calibration_stability (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      cycle_consistency_rate REAL,
      test_retest_agreement REAL,
      cross_level_kendall_w REAL,
      elo_model_rmse REAL,
      timeout_rate REAL,
      stability_grade TEXT NOT NULL DEFAULT 'C' CHECK (stability_grade IN ('A','B','C')),
      low_confidence_sets TEXT,
      adaptive_supplement_count INTEGER NOT NULL DEFAULT 0,
      calibration_attempt_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_calibration_stability_session ON calibration_stability(session_id);

    CREATE TABLE IF NOT EXISTS value_assignment (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL,
      external_value INTEGER NOT NULL CHECK (external_value IN (5,10,15,20,25)),
      assignment_pattern_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stimulus_value_map (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL,
      stim_id TEXT NOT NULL,
      stimulus_pool_id TEXT NOT NULL REFERENCES stimulus_pool(id),
      final_liking_rank INTEGER NOT NULL CHECK (final_liking_rank BETWEEN 1 AND 5),
      external_value INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS value_comprehension_checks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL,
      selected_answer TEXT NOT NULL,
      correct INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_value_assignment_session ON value_assignment(session_id);
    CREATE INDEX IF NOT EXISTS idx_stimulus_value_map_session ON stimulus_value_map(session_id);

    CREATE TABLE IF NOT EXISTS formal_trials (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      trial_index INTEGER NOT NULL,
      trial_type TEXT NOT NULL CHECK (trial_type IN ('liking_only','value_only','congruent','conflict')),
      left_stim_id TEXT NOT NULL,
      right_stim_id TEXT NOT NULL,
      left_image_url TEXT NOT NULL,
      right_image_url TEXT NOT NULL,
      left_set_id TEXT NOT NULL,
      right_set_id TEXT NOT NULL,
      left_liking_rank INTEGER NOT NULL,
      right_liking_rank INTEGER NOT NULL,
      left_external_value INTEGER NOT NULL,
      right_external_value INTEGER NOT NULL,
      delta_liking INTEGER NOT NULL,
      delta_value INTEGER NOT NULL,
      high_liking_side TEXT CHECK (high_liking_side IN ('left','right','none')),
      high_value_side TEXT CHECK (high_value_side IN ('left','right','none')),
      congruent_side TEXT CHECK (congruent_side IN ('left','right','none')),
      conflict_high_value_side TEXT CHECK (conflict_high_value_side IN ('left','right','none')),
      conflict_high_liking_side TEXT CHECK (conflict_high_liking_side IN ('left','right','none')),
      high_liking_low_value_side TEXT,
      low_liking_high_value_side TEXT,
      item_pair_key TEXT,
      repeated_pair_flag INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_formal_trials_session ON formal_trials(session_id);

    CREATE TABLE IF NOT EXISTS choice_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      formal_trial_id TEXT NOT NULL REFERENCES formal_trials(id) ON DELETE CASCADE,
      trial_index INTEGER NOT NULL,
      trial_type TEXT NOT NULL,
      left_stim_id TEXT NOT NULL,
      right_stim_id TEXT NOT NULL,
      left_liking_rank INTEGER NOT NULL,
      right_liking_rank INTEGER NOT NULL,
      left_external_value INTEGER NOT NULL,
      right_external_value INTEGER NOT NULL,
      delta_liking INTEGER NOT NULL,
      delta_value INTEGER NOT NULL,
      response_side TEXT CHECK (response_side IN ('left','right')),
      chosen_stim_id TEXT,
      chosen_liking_rank INTEGER,
      chosen_external_value INTEGER,
      response_method TEXT CHECK (response_method IN ('keyboard','mouse')),
      rt_ms REAL,
      timeout INTEGER NOT NULL DEFAULT 0,
      chose_high_liking INTEGER,
      chose_high_value INTEGER,
      chose_congruent_advantage INTEGER,
      chose_high_liking_low_value INTEGER,
      chose_low_liking_high_value INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_choice_responses_session ON choice_responses(session_id);

    CREATE TABLE IF NOT EXISTS block_manipulation_checks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      block_index INTEGER NOT NULL,
      resource_insufficient INTEGER NOT NULL CHECK (resource_insufficient BETWEEN 1 AND 7),
      resource_confident INTEGER NOT NULL CHECK (resource_confident BETWEEN 1 AND 7),
      stressed INTEGER NOT NULL CHECK (stressed BETWEEN 1 AND 7),
      engaged INTEGER NOT NULL CHECK (engaged BETWEEN 1 AND 7),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liking_rankings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      set_id TEXT NOT NULL,
      stim_id TEXT NOT NULL,
      stimulus_pool_id TEXT NOT NULL REFERENCES stimulus_pool(id),
      image_url TEXT NOT NULL,
      liking_rank INTEGER NOT NULL CHECK (liking_rank BETWEEN 1 AND 5),
      ranking_round INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liking_validation_trials (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      trial_index INTEGER NOT NULL,
      validation_type TEXT NOT NULL CHECK (validation_type IN ('different_rank','same_rank')),
      left_stim_id TEXT NOT NULL,
      right_stim_id TEXT NOT NULL,
      left_set_id TEXT NOT NULL,
      right_set_id TEXT NOT NULL,
      left_liking_rank INTEGER NOT NULL,
      right_liking_rank INTEGER NOT NULL,
      expected_choice TEXT CHECK (expected_choice IN ('left','right','none')),
      boundary_type TEXT,
      left_image_url TEXT NOT NULL,
      right_image_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liking_validation_responses (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      trial_id TEXT NOT NULL REFERENCES liking_validation_trials(id) ON DELETE CASCADE,
      trial_index INTEGER NOT NULL,
      validation_type TEXT NOT NULL,
      response_side TEXT CHECK (response_side IN ('left','right')),
      chosen_stim_id TEXT,
      rt_ms REAL,
      timeout INTEGER NOT NULL DEFAULT 0,
      response_method TEXT CHECK (response_method IN ('keyboard','mouse')),
      consistent_with_ranking INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS liking_validation_quality (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      different_rank_consistency_rate REAL,
      same_rank_bias_flag INTEGER NOT NULL DEFAULT 0,
      timeout_rate REAL,
      mean_rt_ms REAL,
      validation_passed INTEGER NOT NULL DEFAULT 0,
      needs_rerank INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_liking_rankings_session ON liking_rankings(session_id);
    CREATE INDEX IF NOT EXISTS idx_liking_val_trials_session ON liking_validation_trials(session_id);
    CREATE INDEX IF NOT EXISTS idx_liking_val_resp_session ON liking_validation_responses(session_id);

    CREATE TABLE IF NOT EXISTS post_experiment_checks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      performance_feedback_belief INTEGER CHECK (performance_feedback_belief BETWEEN 1 AND 7),
      preset_feedback_suspicion INTEGER CHECK (preset_feedback_suspicion BETWEEN 1 AND 7),
      resource_task_influence_belief INTEGER CHECK (resource_task_influence_belief BETWEEN 1 AND 7),
      perceived_study_purpose_text TEXT,
      main_choice_strategy TEXT,
      unusual_or_unrealistic_text TEXT,
      suspicion_flag INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_post_experiment_session ON post_experiment_checks(session_id);
  `);

  // Migrations for columns added after initial schema.
  try {
    db.exec(`ALTER TABLE experiment_sessions ADD COLUMN group_label TEXT NOT NULL DEFAULT 'scarcity' CHECK (group_label IN ('scarcity', 'abundance'))`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE experiment_sessions ADD COLUMN resource_balance INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE experiment_sessions ADD COLUMN random_seed INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE stimulus_pool ADD COLUMN current_version INTEGER DEFAULT 1`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE stimulus_pool ADD COLUMN retired_at TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE stimulus_pool ADD COLUMN retired_reason TEXT`);
  } catch { /* column already exists */ }
  // V2 migrations — continuous resource task, no blocks.
  try {
    db.exec(`ALTER TABLE stage_game_trials ADD COLUMN is_manipulated_feedback INTEGER NOT NULL DEFAULT 1`);
  } catch { /* column already exists */ }
  // Widen preset_feedback_direction CHECK to allow 'none' for real-feedback trials.
  try {
    migrateStageGameFeedbackConstraint(db);
  } catch { /* migration already applied */ }
  try {
    db.exec(`ALTER TABLE stage_game_responses ADD COLUMN feedback_mode TEXT NOT NULL DEFAULT 'preset'`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE stage_game_responses ADD COLUMN dot_count_left INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE stage_game_responses ADD COLUMN dot_count_right INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE stage_game_responses ADD COLUMN correct_side TEXT`);
  } catch { /* column already exists */ }
  // V2 formal choice — new columns for orthogonalized table support.
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN high_liking_low_value_side TEXT`); } catch { }
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN low_liking_high_value_side TEXT`); } catch { }
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN item_pair_key TEXT`); } catch { }
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN repeated_pair_flag INTEGER NOT NULL DEFAULT 0`); } catch { }
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN repeat_index INTEGER`); } catch { }
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN original_pair_key TEXT`); } catch { }
  try { db.exec(`ALTER TABLE choice_responses ADD COLUMN chose_high_liking_low_value INTEGER`); } catch { }
  try { db.exec(`ALTER TABLE choice_responses ADD COLUMN chose_low_liking_high_value INTEGER`); } catch { }
  // V2 calibration — boundary_type column.
  try {
    db.exec(`ALTER TABLE calibration_trials ADD COLUMN boundary_type TEXT`);
  } catch { /* column already exists */ }
  // V2 calibration — calibration attempt tracking.
  try {
    db.exec(`ALTER TABLE experiment_sessions ADD COLUMN calibration_attempt_index INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  // V4: enriched participant fields.
  try { db.exec(`ALTER TABLE participants ADD COLUMN name TEXT NOT NULL DEFAULT ''`); } catch { }
  try { db.exec(`ALTER TABLE participants ADD COLUMN birth_date TEXT NOT NULL DEFAULT ''`); } catch { }
  try { db.exec(`ALTER TABLE participants ADD COLUMN grade TEXT NOT NULL DEFAULT ''`); } catch { }
  try { db.exec(`ALTER TABLE participants ADD COLUMN contact TEXT NOT NULL DEFAULT ''`); } catch { }

  // V3: Elo scores on existing tables.
  try { db.exec(`ALTER TABLE stimulus_value_map ADD COLUMN elo_score REAL`); } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE formal_trials ADD COLUMN delta_elo REAL`); } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE liking_map ADD COLUMN elo_score REAL`); } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE within_set_stable ADD COLUMN elo_score REAL`); } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE cross_set_orthogonalized ADD COLUMN elo_score REAL`); } catch { /* column already exists */ }

  // V2 calibration phases — widen CHECK constraint for new phases.
  migrateCalibrationPhaseConstraint(db);
}

function backfillStimulusVersions(database: Database.Database) {
  // For each stimulus_pool row missing a version-1 entry, create one.
  const rows = database.prepare(
    "SELECT stim_id, image_url, original_filename, width_px, height_px, file_size_bytes FROM stimulus_pool"
  ).all() as { stim_id: string; image_url: string; original_filename: string; width_px: number | null; height_px: number | null; file_size_bytes: number | null }[];

  const insert = database.prepare(`
    INSERT OR IGNORE INTO stimulus_versions
      (id, stim_id, version_number, image_url, file_path, original_filename, is_current, width_px, height_px, file_size_bytes, created_at)
    VALUES (?, ?, 1, ?, ?, ?, 1, ?, ?, ?, datetime('now'))
  `);

  const crypto = require("crypto");
  for (const r of rows) {
    const existing = database.prepare(
      "SELECT COUNT(*) AS cnt FROM stimulus_versions WHERE stim_id = ? AND version_number = 1"
    ).get(r.stim_id) as { cnt: number };
    if (existing.cnt === 0) {
      insert.run(
        crypto.randomUUID(), r.stim_id, r.image_url,
        `storage/stimuli/${r.original_filename || r.stim_id + '.png'}`, r.original_filename,
        r.width_px, r.height_px, r.file_size_bytes,
      );
    }
  }

  // Ensure current_version matches the max version_number.
  database.prepare(`
    UPDATE stimulus_pool SET current_version = (
      SELECT MAX(version_number) FROM stimulus_versions WHERE stim_id = stimulus_pool.stim_id
    ) WHERE current_version IS NULL OR current_version < (
      SELECT MAX(version_number) FROM stimulus_versions WHERE stim_id = stimulus_pool.stim_id
    )
  `).run();
}

/** V2 migration: widen stage_game_trials.preset_feedback_direction CHECK constraint
 *  to allow 'none' for real-feedback (accuracy-based) trials. */
function migrateStageGameFeedbackConstraint(database: Database.Database) {
  database.pragma("foreign_keys = OFF");
  try {
    database.prepare(
      `INSERT INTO stage_game_trials (id, session_id, block_index, trial_index, global_trial_index, task_type, stimulus_payload, correct_answer, preset_feedback_direction, preset_feedback_points, created_at)
       VALUES ('__mig_test__', '__test__', 0, 0, 0, 'shape_matching', '{}', 'F', 'none', 0, datetime('now'))`
    ).run();
    database.prepare("DELETE FROM stage_game_trials WHERE id = '__mig_test__'").run();
    database.pragma("foreign_keys = ON");
  } catch {
    database.pragma("foreign_keys = ON");
    // Old constraint — recreate table with widened CHECK.
    database.exec(`
      CREATE TABLE IF NOT EXISTS stage_game_trials_v2 (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
        block_index INTEGER NOT NULL DEFAULT 0,
        trial_index INTEGER NOT NULL,
        global_trial_index INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        stimulus_payload TEXT,
        correct_answer TEXT NOT NULL,
        is_manipulated_feedback INTEGER NOT NULL DEFAULT 1,
        preset_feedback_direction TEXT NOT NULL CHECK (preset_feedback_direction IN ('gain','loss','none')),
        preset_feedback_points INTEGER,
        planned_balance_after INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO stage_game_trials_v2 SELECT * FROM stage_game_trials;
      DROP TABLE stage_game_trials;
      ALTER TABLE stage_game_trials_v2 RENAME TO stage_game_trials;
    `);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_trials_session ON stage_game_trials(session_id)`);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_trials_global ON stage_game_trials(session_id, global_trial_index)`);
  }
}

/** V2 migration: widen calibration_trials.phase CHECK constraint. */
function migrateCalibrationPhaseConstraint(database: Database.Database) {
  // Test if new phases are accepted — disable FK temporarily for test row.
  database.pragma("foreign_keys = OFF");
  try {
    database.prepare(
      `INSERT INTO calibration_trials (id, session_id, participant_id, phase, trial_index, left_stim_id, right_stim_id, left_set_id, right_set_id, left_preliminary_rank, right_preliminary_rank, expected_choice, left_image_url, right_image_url, created_at)
       VALUES ('__migration_test__', '__test__', '__test__', 'cross_set_anchor_mid', 0, 'x', 'x', 'x', 'x', NULL, NULL, NULL, '', '', datetime('now'))`
    ).run();
    database.prepare("DELETE FROM calibration_trials WHERE id = '__migration_test__'").run();
    database.pragma("foreign_keys = ON");
  } catch {
    database.pragma("foreign_keys = ON");
    // Old constraint active — recreate table.
    database.exec(`
      CREATE TABLE IF NOT EXISTS calibration_trials_v2 (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES experiment_sessions(id) ON DELETE CASCADE,
        participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        phase TEXT NOT NULL CHECK (phase IN ('within_set','cross_set_same_rank','cross_set_near_rank','cross_set_anchor','within_full_pair','within_adjacent_retest','within_adjacent_retest_r2','cross_set_boundary','cross_set_anchor_mid','cross_set_anchor_low','cross_set_anchor_high','cross_set_adaptive')),
        trial_index INTEGER NOT NULL,
        left_stim_id TEXT NOT NULL,
        right_stim_id TEXT NOT NULL,
        left_set_id TEXT NOT NULL,
        right_set_id TEXT NOT NULL,
        left_preliminary_rank INTEGER,
        right_preliminary_rank INTEGER,
        expected_choice TEXT CHECK (expected_choice IN ('left','right','none')),
        boundary_type TEXT,
        left_image_url TEXT NOT NULL,
        right_image_url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO calibration_trials_v2 SELECT * FROM calibration_trials;
      DROP TABLE calibration_trials;
      ALTER TABLE calibration_trials_v2 RENAME TO calibration_trials;
    `);
    // Recreate indexes.
    database.exec(`CREATE INDEX IF NOT EXISTS idx_calibration_trials_session ON calibration_trials(session_id)`);
  }
}

function seedAdmin(db: Database.Database) {
  // The admin user is stored in-memory in the auth module (hashed password).
  // This function is kept for seeding any initial data if needed later.
  // See lib/auth/index.ts for admin credentials.
}

/** Close the database connection (for graceful shutdown). */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
