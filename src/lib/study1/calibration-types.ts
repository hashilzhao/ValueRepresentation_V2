export type CalibrationPhase =
  | "within_full_pair"            // Stage 4A: 50 within-set full pairing
  | "within_adjacent_retest"      // Stage 4B round 1: 20 within-set adjacent retest
  | "within_adjacent_retest_r2"   // Stage 4B round 2: iterative adjacent retest (≤20 trials)
  | "cross_set_boundary"          // [legacy] Stage 4C: 80 cross-set adjacent-boundary
  | "cross_set_anchor_mid"        // Stage 4C-a: rank-3 anchor ×2 repetitions (20 trials)
  | "cross_set_anchor_low"        // Stage 4C-b: rank-1 anchor (10 trials)
  | "cross_set_anchor_high"       // Stage 4C-b: rank-5 anchor (10 trials)
  | "cross_set_adaptive";         // Stage 4C-c: adaptive supplement (0-15 trials)

export interface CalibrationTrial {
  id: string;
  session_id: string;
  participant_id: string;
  phase: CalibrationPhase;
  trial_index: number;
  left_stim_id: string;
  right_stim_id: string;
  left_set_id: string;
  right_set_id: string;
  left_rank_before: number | null;
  right_rank_before: number | null;
  boundary_type: string | null; // "1v2" | "2v3" | "3v4" | "4v5" | null
  expected_choice: "left" | "right" | "none" | null;
  left_image_url: string;
  right_image_url: string;
  created_at: string;
}

export interface CalibrationResponse {
  session_id: string;
  participant_id: string;
  trial_id: string;
  phase: CalibrationPhase;
  left_stim_id: string;
  right_stim_id: string;
  response_side: "left" | "right" | null;
  chosen_stim_id: string | null;
  response_method: "keyboard" | "mouse" | null;
  rt_ms: number | null;
  timeout: boolean;
  consistent: number | null;
}

export interface LikingMapEntry {
  session_id: string;
  participant_id: string;
  set_id: string;
  stim_id: string;
  stimulus_pool_id: string;
  preliminary_liking_rank: number | null;
  final_liking_rank: number;
  win_count_within_set: number;
  total_pairwise_wins: number;
  total_pairwise_losses: number;
  preference_score: number | null;
  tie_flag: boolean;
}

export interface CalibrationQuality {
  session_id: string;
  participant_id: string;
  within_set_consistency: number | null;
  cross_set_anchor_consistency: number | null;
  cross_set_near_rank_consistency: number | null;
  cross_set_same_rank_bias_flag: boolean;
  tie_flag_count: number;
  timeout_rate: number | null;
  mean_rt_ms: number | null;
}

export interface SetStimulus {
  set_id: string;
  stim_id: string;
  stimulus_pool_id: string;
  image_url: string;
  position_in_set: number;
}

// ─── First table: within-set stable modeling ───────────────────

export interface WithinSetStableEntry {
  id?: string;
  session_id: string;
  participant_id: string;
  set_id: string;
  stim_id: string;
  stimulus_pool_id: string;
  image_url: string;
  original_within_rank: number;       // from 4A win count (1=least, 5=most liked)
  stable_within_rank: number;         // after 4B adjacent retest adjustment
  win_count: number;
  adjacent_retest_result: string;     // "consistent" | "inconsistent" | "N/A"
  adjacent_consistency: number | null; // 0.0–1.0 or null
  tie_flag: number;
  ambiguity_flag: number;
  final_stable_rank: number;          // = stable_within_rank (rank 1–5 within set)
  elo_score?: number;                // V3: Elo score after within-set calibration
  calibration_attempt_index: number;
  created_at: string;
}

// ─── Second table: cross-set orthogonalized ────────────────────

export interface CrossSetOrthogonalizedEntry {
  id?: string;
  session_id: string;
  participant_id: string;
  stim_id: string;
  set_id: string;
  original_liking_rank: number;      // from first stable table
  calibrated_liking_rank: number;    // after cross-set boundary evidence
  shift_direction: "up" | "down" | "none" | "ambiguous";
  shift_rate: number;                // 0.0–1.0
  shift_threshold_met: number;       // 0 or 1
  shift_confidence: "none" | "low" | "high" | "ambiguous";
  evidence_summary: string;          // JSON text
  source_comparisons_count: number;
  wins_against_adjacent_level: number;
  losses_to_adjacent_level: number;
  elo_score?: number;               // V3: final Elo score after cross-set calibration
  calibration_attempt_index: number;
  created_at: string;
}

// ─── V3: Elo score entry ─────────────────────────────────────

export interface StimulusElo {
  session_id: string;
  participant_id: string;
  stim_id: string;
  set_id: string;
  elo_score: number;            // current Elo rating
  elo_volatility: number;       // uncertainty width (decreases with more comparisons)
  comparisons_count: number;
  calibration_attempt_index: number;
}

// ─── V3: Calibration stability report ─────────────────────────

export interface CalibrationStability {
  session_id: string;
  participant_id: string;
  cycle_consistency_rate: number | null;
  test_retest_agreement: number | null;
  cross_level_kendall_w: number | null;
  elo_model_rmse: number | null;
  timeout_rate: number | null;
  stability_grade: "A" | "B" | "C";
  low_confidence_sets: string | null;     // JSON array
  adaptive_supplement_count: number;
  calibration_attempt_index: number;
}

// ─── V3: Anomaly detection result ─────────────────────────────

export interface AnomalyDetectionResult {
  has_anomalies: boolean;
  anomaly_details: string[];
  flagged_stimuli: { stim_id: string; set_id: string; reason: string }[];
}

// ─── V3: Phase state for orchestrator ─────────────────────────

export interface PhaseState {
  phase: CalibrationPhase | "complete";
  total_trials: number;
  completed_trials: number;
  round?: number;
  attempt_index: number;
}

export interface PhaseTransition {
  phase_completed: CalibrationPhase;
  next_phase: CalibrationPhase | "complete" | null;
  next_phase_trials: number;
  message?: string;
}
