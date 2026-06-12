import crypto from "crypto";
import type {
  TaskType,
  StageGameTrial,
  FeedbackEntry,
  FeedbackDirection,
  StimulusPayload,
} from "./types";
import type { Group } from "@/lib/stages";
import {
  REAL_DOT_COUNT,
  MANIPULATED_DOT_COUNT,
  SHAPE_MATCHING_COUNT,
  TOTAL_TRIALS,
  RESOURCE_TASK_CONFIG,
  REAL_DOT_MIN,
  REAL_DOT_MAX,
  REAL_DOT_DIFF_MIN,
  REAL_DOT_DIFF_MAX,
  MANIPULATED_DOT_MIN,
  MANIPULATED_DOT_MAX,
  MANIPULATED_DOT_DIFF_MIN,
  MANIPULATED_DOT_DIFF_MAX,
} from "./config";
import { generateDotPositions } from "@/lib/stimulus/dots";

// ─── Public helpers ────────────────────────────────────────────

/**
 * Generate the full trial list + feedback schedule for a session.
 * dot_comparison: pre-computed manipulated feedback
 * shape_matching: no pre-computed feedback (determined at response time from real accuracy)
 */
export function generateStageGameTrials(
  sessionId: string,
  group: Group,
): StageGameTrial[] {
  const slotOrder = generateConstrainedTrialOrder();
  const dcFeedback = generateDotComparisonFeedback(group, slotOrder);
  const trials: StageGameTrial[] = [];

  let fbIdx = 0;
  for (let i = 0; i < TOTAL_TRIALS; i++) {
    const slot = slotOrder[i];
    let taskType: TaskType;
    let stimulus: StimulusPayload;
    let fbDir: FeedbackDirection | null = null;
    let fbPts: number | null = null;
    let isManipulated = 0;

    switch (slot) {
      case "real_dot":
        taskType = "dot_comparison";
        stimulus = generateRealDotComparison();
        // Real feedback — determined at response time from accuracy.
        isManipulated = 0;
        fbDir = null;
        fbPts = null;
        break;
      case "manipulated_dot":
        taskType = "dot_comparison";
        stimulus = generateManipulatedDotComparison();
        isManipulated = 1;
        if (fbIdx < dcFeedback.length) {
          const fb = dcFeedback[fbIdx++];
          fbDir = fb.direction;
          fbPts = fb.points;
        }
        break;
      case "shape_matching":
        taskType = "shape_matching";
        stimulus = generateShapeMatching();
        // Real feedback — determined at response time.
        isManipulated = 0;
        fbDir = null;
        fbPts = null;
        break;
    }

    trials.push({
      id: crypto.randomUUID(),
      session_id: sessionId,
      global_trial_index: i,
      task_type: taskType,
      stimulus_payload: stimulus,
      correct_answer: stimulus.answer,
      is_manipulated_feedback: isManipulated,
      preset_feedback_direction: fbDir,
      preset_feedback_points: fbPts,
      planned_balance_after: null,
      created_at: new Date().toISOString(),
    });
  }

  return trials;
}

/**
 * Pre-compute a manipulated feedback schedule for dot_comparison trials only.
 * Simulates the balance forward to generate plausible feedback.
 */
export function generateDotComparisonFeedback(
  group: Group,
  slotOrder: ("real_dot" | "manipulated_dot" | "shape_matching")[],
): FeedbackEntry[] {
  const config = RESOURCE_TASK_CONFIG[group];
  let balance = config.initial_balance;
  const entries: FeedbackEntry[] = [];

  for (let i = 0; i < TOTAL_TRIALS; i++) {
    if (slotOrder[i] !== "manipulated_dot") continue;

    const { direction, points } = computeDotComparisonFeedback(
      group,
      balance,
      config,
    );

    if (direction === "gain") balance += points;
    else balance -= points;

    entries.push({
      trial_global_index: i,
      direction,
      points,
    });
  }

  return entries;
}

// ─── Adaptive feedback for dot_comparison ──────────────────────

/**
 * Compute manipulated feedback for a dot_comparison trial.
 * Rules differ by group to create the intended resource experience.
 *
 * Scarcity (target: 4–12, often < 10):
 *   balance > 10  → bias toward loss (pull below threshold)
 *   balance 7–10  → mild fluctuation, bias toward tension
 *   balance 4–6   → mixed gain/loss, maintain tension
 *   balance < 4   → provide gains to avoid collapse
 *
 * Abundance (target: 100–130, always well above 10):
 *   balance < 100  → prioritize gain
 *   balance 100–130 → mixed, slight gain bias
 *   balance > 130  → mild loss to avoid runaway inflation
 */
export function computeDotComparisonFeedback(
  group: Group,
  balanceBefore: number,
  config: { balance_min: number; balance_max: number; pass_threshold: number },
  trialIndex?: number,
  totalTrials?: number,
): { direction: FeedbackDirection; points: number } {
  if (group === "scarcity") {
    return computeScarcityFeedback(balanceBefore);
  }
  return computeAbundanceFeedback(balanceBefore, trialIndex ?? 0, totalTrials ?? 90);
}

function computeScarcityFeedback(
  balance: number,
): { direction: FeedbackDirection; points: number } {
  const roll = Math.random();

  if (balance > 10) {
    // Pull below threshold. Strong bias toward loss.
    if (roll < 0.85) return { direction: "loss", points: randInt(1, 3) };
    return { direction: "gain", points: 1 };
  }

  if (balance >= 7 && balance <= 10) {
    // Mild fluctuation, bias toward tension.
    if (roll < 0.60) return { direction: "loss", points: randInt(1, 2) };
    return { direction: "gain", points: randInt(1, 2) };
  }

  if (balance >= 4 && balance <= 6) {
    // Mixed, maintain tension without collapse.
    if (roll < 0.50) return { direction: "gain", points: randInt(1, 2) };
    return { direction: "loss", points: randInt(1, 2) };
  }

  // balance < 4 — prevent collapse.
  if (roll < 0.80) return { direction: "gain", points: randInt(1, 3) };
  return { direction: "loss", points: 1 };
}

function computeAbundanceFeedback(
  balance: number,
  trialIndex: number,
  totalTrials: number,
): { direction: FeedbackDirection; points: number } {
  const roll = Math.random();
  const remaining = totalTrials - trialIndex;

  // ── Final phase (≤5 remaining): guarantee finish ≥110 ──────
  if (remaining <= 5) {
    if (balance < 110) {
      // Must gain to reach 110+. Stronger gain if further below.
      if (balance < 105) return { direction: "gain", points: randInt(2, 3) };
      return { direction: "gain", points: randInt(1, 2) };
    }
    if (balance > 130) {
      // Mild loss only, don't push below 110.
      if (roll < 0.50) return { direction: "loss", points: 1 };
      return { direction: "gain", points: 1 };
    }
    // 110–130: maintain with slight gain bias.
    if (roll < 0.55) return { direction: "gain", points: 1 };
    return { direction: "loss", points: 1 };
  }

  // ── Late phase (≤20 remaining): keep 110–128 ───────────────
  if (remaining <= 20) {
    if (balance < 105) {
      if (roll < 0.85) return { direction: "gain", points: randInt(1, 3) };
      return { direction: "gain", points: 1 };
    }
    if (balance < 110) {
      if (roll < 0.70) return { direction: "gain", points: randInt(1, 2) };
      return { direction: "loss", points: 1 };
    }
    if (balance >= 110 && balance <= 125) {
      // Stable — mild fluctuation with slight downward bias near upper.
      if (balance > 122) {
        if (roll < 0.40) return { direction: "gain", points: 1 };
        if (roll < 0.82) return { direction: "loss", points: 1 };
        return { direction: "loss", points: randInt(1, 2) };
      }
      if (roll < 0.48) return { direction: "gain", points: 1 };
      if (roll < 0.85) return { direction: "loss", points: 1 };
      return { direction: "gain", points: randInt(1, 2) };
    }
    // > 125 — stronger downward pull in late phase.
    if (roll < 0.25) return { direction: "gain", points: 1 };
    if (roll < 0.80) return { direction: "loss", points: randInt(1, 2) };
    return { direction: "loss", points: randInt(1, 3) };
  }

  // ── Early phase (< 30 trials): ramp from 100 toward 110+ ──
  if (trialIndex < 30) {
    if (balance < 95) {
      // Fell below start — recover.
      return { direction: "gain", points: randInt(2, 4) };
    }
    if (balance < 100) {
      if (roll < 0.80) return { direction: "gain", points: randInt(1, 3) };
      return { direction: "gain", points: 1 };
    }
    if (balance >= 100 && balance <= 110) {
      // Gradual climb with slight gain bias.
      if (roll < 0.60) return { direction: "gain", points: randInt(1, 2) };
      if (roll < 0.85) return { direction: "loss", points: 1 };
      return { direction: "gain", points: 1 };
    }
    if (balance > 118) {
      // Climbing too fast — mild pull back.
      if (roll < 0.60) return { direction: "loss", points: randInt(1, 2) };
      return { direction: "gain", points: 1 };
    }
    // 110–118: good, maintain.
    if (roll < 0.50) return { direction: "gain", points: 1 };
    if (roll < 0.85) return { direction: "loss", points: 1 };
    return { direction: "gain", points: randInt(1, 2) };
  }

  // ── Middle phase: 105–130 ───────────────────────────────────
  if (balance < 100) {
    if (roll < 0.80) return { direction: "gain", points: randInt(2, 4) };
    return { direction: "gain", points: 1 };
  }
  if (balance < 105) {
    if (roll < 0.70) return { direction: "gain", points: randInt(1, 2) };
    return { direction: "loss", points: 1 };
  }
  if (balance >= 105 && balance <= 120) {
    // Stable zone — mild fluctuation, slight gain bias.
    if (roll < 0.45) return { direction: "gain", points: 1 };
    if (roll < 0.85) return { direction: "loss", points: 1 };
    return { direction: "gain", points: randInt(1, 2) };
  }
  if (balance > 120 && balance <= 128) {
    // Upper-mid — slight downward bias to prevent drift toward 130+.
    if (roll < 0.35) return { direction: "gain", points: 1 };
    if (roll < 0.80) return { direction: "loss", points: 1 };
    return { direction: "loss", points: randInt(1, 2) };
  }
  // > 128 — stronger downward pull.
  if (roll < 0.25) return { direction: "gain", points: 1 };
  if (roll < 0.80) return { direction: "loss", points: randInt(1, 2) };
  return { direction: "loss", points: randInt(1, 3) };
}

// ─── Constrained random trial order ────────────────────────────

type TrialSlot = "real_dot" | "manipulated_dot" | "shape_matching";

/**
 * Generate trial order with constraints:
 * - 18 real_dot + 54 manipulated_dot + 18 shape_matching
 * - shape_matching never adjacent (gap ≥ 3 to next SM)
 * - real/manipulated dot trials randomly fill remaining slots
 */
function generateConstrainedTrialOrder(): TrialSlot[] {
  const total = TOTAL_TRIALS;

  // Place shape_matching positions.
  const smPositions = placeShapeMatching();
  const smSet = new Set(smPositions);

  // Place real_dot positions (randomly among remaining slots).
  const available = [];
  for (let i = 0; i < total; i++) {
    if (!smSet.has(i)) available.push(i);
  }
  // Shuffle available slots.
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  const realDotPositions = new Set(available.slice(0, REAL_DOT_COUNT));

  // Build trial order.
  const trials: TrialSlot[] = new Array(total);
  for (let i = 0; i < total; i++) {
    if (smSet.has(i)) trials[i] = "shape_matching";
    else if (realDotPositions.has(i)) trials[i] = "real_dot";
    else trials[i] = "manipulated_dot";
  }

  return trials;
}

function placeShapeMatching(): number[] {
  const SM_COUNT = SHAPE_MATCHING_COUNT;
  const total = TOTAL_TRIALS;
  const minGap = 3; // SM + at least 2 other trials after = 3 positions per SM cycle
  const maxSmPos = total - 3;

  for (let attempt = 0; attempt < 200; attempt++) {
    const candidates: number[] = [];
    const segmentSize = total / SM_COUNT;

    for (let i = 0; i < SM_COUNT; i++) {
      const lo = Math.floor(i * segmentSize);
      const hi = Math.min(Math.floor((i + 1) * segmentSize) - 1, maxSmPos);
      if (hi < lo) continue;
      candidates.push(lo + randInt(0, hi - lo));
    }

    candidates.sort((a, b) => a - b);

    let valid = true;
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i] - candidates[i - 1] < minGap) {
        valid = false;
        break;
      }
    }

    if (valid) return candidates;
  }

  // Fallback: deterministic spread.
  const fallback: number[] = [];
  const step = Math.floor(total / SM_COUNT);
  for (let i = 0; i < SM_COUNT; i++) {
    fallback.push(i * step + randInt(0, 1));
  }
  return fallback;
}

// ─── Stimulus generation ──────────────────────────────────────

/** Real dot comparison: 15-25 dots, diff 1-3, real feedback */
function generateRealDotComparison() {
  return generateDotComparisonStimulus(
    REAL_DOT_MIN, REAL_DOT_MAX,
    REAL_DOT_DIFF_MIN, REAL_DOT_DIFF_MAX,
  );
}

/** Manipulated dot comparison: 30-50 dots, diff 2-4, preset feedback */
function generateManipulatedDotComparison() {
  return generateDotComparisonStimulus(
    MANIPULATED_DOT_MIN, MANIPULATED_DOT_MAX,
    MANIPULATED_DOT_DIFF_MIN, MANIPULATED_DOT_DIFF_MAX,
  );
}

function generateDotComparisonStimulus(
  dotMin: number, dotMax: number,
  diffMin: number, diffMax: number,
) {
  const leftHasMore = Math.random() < 0.5;
  const diff = randInt(diffMin, diffMax);
  const midMin = dotMin + diff;
  const midMax = dotMax;
  const mid = randInt(midMin, midMax);

  let leftCount: number;
  let rightCount: number;
  if (leftHasMore) {
    leftCount = mid;
    rightCount = mid - diff;
  } else {
    leftCount = mid - diff;
    rightCount = mid;
  }

  const answer = (leftHasMore ? "F" : "J") as "F" | "J";

  return {
    type: "dot_comparison" as const,
    question: "哪一侧包含更多点？",
    left_dots: leftCount,
    right_dots: rightCount,
    left_positions: generateDotPositions(leftCount, { panelWidth: 90, panelHeight: 90, minDistance: 5, padding: 8 }),
    right_positions: generateDotPositions(rightCount, { panelWidth: 90, panelHeight: 90, minDistance: 5, padding: 8 }),
    answer,
  };
}

function generateShapeMatching() {
  type Shape = "circle" | "square" | "triangle" | "diamond";
  const shapes: Shape[] = ["circle", "square", "triangle", "diamond"];
  const left = shapes[randInt(0, shapes.length - 1)];
  const match = Math.random() < 0.5;
  let right: Shape;
  if (match) {
    right = left;
  } else {
    do {
      right = shapes[randInt(0, shapes.length - 1)];
    } while (right === left);
  }
  const answer = (match ? "F" : "J") as "F" | "J"; // F = Match/Yes, J = No match/No

  return {
    type: "shape_matching" as const,
    question: "这两个图形是否匹配？",
    left_shape: left,
    right_shape: right,
    match,
    answer,
  };
}

// ─── Internal: utilities ───────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
