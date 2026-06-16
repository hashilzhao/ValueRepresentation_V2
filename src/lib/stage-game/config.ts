import type { Group } from "@/lib/stages";
import type { ResourceTaskConfig } from "./types";

/** DEV_TEST_MODE shortens the task for testing. Set via env var. */
export const DEV_TEST_MODE =
  process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true";

/** Continuous resource task — no block structure. */
export const REAL_DOT_COUNT = DEV_TEST_MODE ? 2 : 18;    // accuracy-based feedback
export const MANIPULATED_DOT_COUNT = DEV_TEST_MODE ? 4 : 54; // preset feedback
export const SHAPE_MATCHING_COUNT = DEV_TEST_MODE ? 4 : 18;
export const TOTAL_TRIALS = REAL_DOT_COUNT + MANIPULATED_DOT_COUNT + SHAPE_MATCHING_COUNT;

// ─── Timing ──────────────────────────────────────────────────

export const STIMULUS_DURATION_MS = 3000;
export const FIXATION_DURATION_MS = 500;
export const FEEDBACK_DURATION_MS = 800;
export const BLANK_DURATION_MS = 300;

export const VALID_KEYS = ["f", "j"] as const;

// ─── Group-specific config ───────────────────────────────────

export const RESOURCE_TASK_CONFIG: Record<Group, ResourceTaskConfig> = {
  scarcity: {
    initial_balance: 10,
    pass_threshold: 10,
    balance_min: 4,
    balance_max: 12,
  },
  abundance: {
    initial_balance: 10,
    pass_threshold: 10,
    balance_min: 8,
    balance_max: 40,
  },
};

// ─── Real dot comparison constraints (accuracy-based, 15-25 dots) ──

export const REAL_DOT_MIN = 15;
export const REAL_DOT_MAX = 25;
export const REAL_DOT_DIFF_MIN = 1;
export const REAL_DOT_DIFF_MAX = 3;
export const REAL_DOT_CORRECT = 2;
export const REAL_DOT_INCORRECT = 2;

// ─── Manipulated dot comparison constraints (preset feedback, 30-50 dots) ──

export const MANIPULATED_DOT_MIN = 30;
export const MANIPULATED_DOT_MAX = 50;
export const MANIPULATED_DOT_DIFF_MIN = 2;
export const MANIPULATED_DOT_DIFF_MAX = 4;

// ─── Shape matching feedback (true / real) ───────────────────

export const SM_CORRECT_POINTS = 2;
export const SM_INCORRECT_POINTS = 2;

// ─── Deprecated: keep for backward compat in response.ts ─────

/** @deprecated Use REAL_DOT_MIN/MAX or MANIPULATED_DOT_MIN/MAX */
export const DOT_MIN = 30;
/** @deprecated */
export const DOT_MAX = 50;
/** @deprecated */
export const DOT_DIFF_MIN = 1;
/** @deprecated */
export const DOT_DIFF_MAX = 3;
