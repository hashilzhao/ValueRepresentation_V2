/** Task types for the perceptual stage-game. */
export type TaskType = "dot_comparison" | "shape_matching" | "dot_estimation";

export type FeedbackDirection = "gain" | "loss";

/** Whether feedback is true (accuracy-based) or manipulated (adaptive schedule). */
export type FeedbackMode = "true" | "manipulated";

/** A pre-generated trial row in stage_game_trials. */
export interface StageGameTrial {
  id: string;
  session_id: string;
  global_trial_index: number;
  task_type: TaskType;
  stimulus_payload: StimulusPayload;
  correct_answer: string; // "F" | "J"
  /** Whether this trial's feedback is pre-computed for manipulation (1) or real/accuracy-based (0). */
  is_manipulated_feedback: number; // 0 | 1
  /** Pre-computed manipulated feedback for dot_comparison; null when is_manipulated_feedback=0. */
  preset_feedback_direction: FeedbackDirection | null;
  preset_feedback_points: number | null;
  planned_balance_after: number | null;
  created_at: string;
}

/** A saved response row in stage_game_responses. */
export interface StageGameResponse {
  id: string;
  session_id: string;
  global_trial_index: number;
  task_type: TaskType;
  stimulus_payload: StimulusPayload;
  correct_answer: string;
  response: string | null; // "F" | "J" | null
  accuracy: number | null; // 1 | 0 | null
  rt_ms: number | null;
  missed_response: number; // 0 | 1
  timeout: number; // 0 | 1
  /** "true" for shape_matching (real accuracy), "manipulated" for dot_comparison adaptive schedule. */
  feedback_mode: FeedbackMode;
  feedback_direction: FeedbackDirection;
  feedback_points: number;
  balance_before: number;
  balance_after: number;
  /** Dot comparison: number of dots on left side. */
  dot_count_left: number | null;
  /** Dot comparison: number of dots on right side. */
  dot_count_right: number | null;
  /** Dot comparison: which side has more dots. */
  correct_side: string | null; // "left" | "right"
  created_at: string;
}

/** Stimulus payload varies by task type. */
export type StimulusPayload =
  | DotComparisonStimulus
  | ShapeMatchingStimulus
  | DotEstimationStimulus;

export interface DotComparisonStimulus {
  type: "dot_comparison";
  question: string;
  left_dots: number;
  right_dots: number;
  left_positions: [number, number][]; // [x%, y%][]
  right_positions: [number, number][];
  answer: "F" | "J"; // F = Left has more, J = Right has more
}

export interface ShapeMatchingStimulus {
  type: "shape_matching";
  question: string;
  left_shape: "circle" | "square" | "triangle" | "diamond";
  right_shape: "circle" | "square" | "triangle" | "diamond";
  match: boolean;
  answer: "F" | "J"; // F = Match (Yes), J = No match (No)
}

export interface DotEstimationStimulus {
  type: "dot_estimation";
  question: string;
  dot_count: number;
  reference_number: number;
  comparison: "more" | "fewer";
  answer: "F" | "J"; // F = More, J = Fewer
  positions: [number, number][];
}

/** Feedback entry for pre-computed dot_comparison schedule. */
export interface FeedbackEntry {
  trial_global_index: number;
  direction: FeedbackDirection;
  points: number;
}

/** Resource task config per group. */
export interface ResourceTaskConfig {
  initial_balance: number;
  pass_threshold: number;
  balance_min: number;
  balance_max: number;
}
