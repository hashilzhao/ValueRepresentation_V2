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
      i,           // trialIndex
      TOTAL_TRIALS,
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
// ─── HIGHEST PRIORITY: balance range targets ──────────────────
//
// Scarcity (target: 4–12, ≥75% trials < 10, final balance exactly 10):
//   - Aggressively push below 10 early, keep oscillating 4–9
//   - Converge to exactly 10 in the final stretch (last ~5 trials)
//
// Abundance (target: 90–130, ≥75% trials > 110, last 10% > 110):
//   - Ramp up above 110 early, keep elevated 105–130
//   - Ensure last 10% of trials all above 110
//

export function computeDotComparisonFeedback(
  group: Group,
  balanceBefore: number,
  config: { balance_min: number; balance_max: number; pass_threshold: number },
  trialIndex?: number,
  totalTrials?: number,
): { direction: FeedbackDirection; points: number } {
  const idx = trialIndex ?? 0;
  const total = totalTrials ?? 90;
  const remaining = total - idx;

  if (group === "scarcity") {
    return computeScarcityFeedback(balanceBefore, idx, total, remaining);
  }
  return computeAbundanceFeedback(balanceBefore, idx, total, remaining);
}

function computeScarcityFeedback(
  balance: number,
  trialIndex: number,
  totalTrials: number,
  remaining: number,
): { direction: FeedbackDirection; points: number } {
  const roll = Math.random();

  // ── Emergency bounds ──────────────────────────────────────────
  if (balance > 18) return { direction: "loss", points: 4 };
  if (balance > 15) return { direction: "loss", points: randInt(3, 4) };
  if (balance < 1)  return { direction: "gain", points: 4 };
  if (balance < 3)  return { direction: "gain", points: randInt(3, 4) };

  // ═══════════════════════════════════════════════════════════════
  // HIGHEST PRIORITY: final convergence to [10, 12] (last 12 trials)
  // ═══════════════════════════════════════════════════════════════
  if (remaining <= 12) {
    // Target = 11 (center of acceptable range [10,12])
    const target = 11;
    const gap = target - balance;
    const absGap = Math.abs(gap);

    if (absGap === 0) {
      // At 11 — hold steady, bias slightly down to offset real-trial gains
      if (roll < 0.55) return { direction: "loss", points: 1 };
      return { direction: "gain", points: 1 };
    }

    // ~55% of remaining trials are manipulated
    const remainingManip = Math.max(1, Math.round(remaining * 0.55));
    const perTrial = Math.min(4, Math.max(1, Math.round(absGap / remainingManip)));

    // Extra margin: if far from target, use larger adjustment
    const finalPts = absGap > 5 ? Math.min(4, perTrial + 1) : perTrial;

    if (gap > 0) return { direction: "gain", points: finalPts };
    return { direction: "loss", points: finalPts };
  }

  // ═══════════════════════════════════════════════════════════════
  // HIGHEST PRIORITY: guarantee ≥75% trials below 10
  // ═══════════════════════════════════════════════════════════════
  // Rule: whenever balance ≥ 10, ALWAYS push below immediately.
  // This ensures balance only briefly touches 10+ → ≥75% below 10.

  if (balance >= 10) {
    // Always loss when at/above 10 — no exceptions during main phase
    // Points: enough to push at least to 9 (i.e., below the threshold)
    const needed = balance - 8; // push to ~8 for margin
    return { direction: "loss", points: Math.min(4, Math.max(1, needed)) };
  }

  // ═══════════════════════════════════════════════════════════════
  // Below 10 — control oscillation, prevent too-fast rise
  // ═══════════════════════════════════════════════════════════════

  // Pre-convergence zone (last 13-20 trials): steer toward 10-12
  if (remaining <= 20) {
    if (balance < 8) {
      if (roll < 0.75) return { direction: "gain", points: randInt(1, 2) };
      return { direction: "loss", points: 1 };
    }
    if (balance === 8 || balance === 9) {
      // Near 10 — cautious drift upward
      if (roll < 0.55) return { direction: "gain", points: 1 };
      return { direction: "loss", points: 1 };
    }
  }

  // Main oscillation zone (balance 3-9)
  if (balance >= 7 && balance <= 9) {
    // Upper zone — keep downward pressure so balance doesn't hit 10 often
    if (roll < 0.80) return { direction: "loss", points: randInt(1, 2) };
    return { direction: "gain", points: randInt(1, 2) };
  }

  if (balance >= 4 && balance <= 6) {
    // Sweet spot — oscillate evenly
    if (roll < 0.50) return { direction: "gain", points: randInt(1, 2) };
    return { direction: "loss", points: randInt(1, 2) };
  }

  // balance 3 — prevent collapse
  if (roll < 0.85) return { direction: "gain", points: randInt(1, 4) };
  return { direction: "loss", points: 1 };
}

function computeAbundanceFeedback(
  balance: number,
  trialIndex: number,
  totalTrials: number,
  remaining: number,
): { direction: FeedbackDirection; points: number } {
  const roll = Math.random();
  const isLast10Pct = remaining <= Math.ceil(totalTrials * 0.10);

  // ═══════════════════════════════════════════════════════════════
  // HIGHEST PRIORITY: final 10% — 100% trials > 12
  // ═══════════════════════════════════════════════════════════════
  if (isLast10Pct) {
    if (balance < 10) {
      return { direction: "gain", points: randInt(3, 4) };
    }
    if (balance < 13) {
      return { direction: "gain", points: randInt(1, 3) };
    }
    if (balance >= 13 && balance <= 30) {
      // Good — mild fluctuation, slight gain bias.
      if (roll < 0.50) return { direction: "gain", points: 1 };
      if (roll < 0.80) return { direction: "loss", points: 1 };
      return { direction: "gain", points: randInt(1, 2) };
    }
    // > 30 — mild loss bias
    if (balance > 38) {
      if (roll < 0.75) return { direction: "loss", points: randInt(1, 2) };
      return { direction: "gain", points: 1 };
    }
    if (roll < 0.40) return { direction: "gain", points: 1 };
    if (roll < 0.75) return { direction: "loss", points: 1 };
    return { direction: "loss", points: randInt(1, 2) };
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Early ramp (first 25 trials) — push from 10 to 15+
  // ═══════════════════════════════════════════════════════════════
  if (trialIndex < 25) {
    if (balance < 8) {
      return { direction: "gain", points: randInt(3, 4) };
    }
    if (balance < 12) {
      // Push toward 15+.
      if (roll < 0.85) return { direction: "gain", points: randInt(1, 3) };
      return { direction: "gain", points: 1 };
    }
    if (balance >= 12 && balance <= 20) {
      // Climbing well — gain bias.
      if (roll < 0.60) return { direction: "gain", points: randInt(1, 2) };
      if (roll < 0.85) return { direction: "loss", points: 1 };
      return { direction: "gain", points: 1 };
    }
    if (balance > 28) {
      // Climbing too fast — pull back.
      if (roll < 0.60) return { direction: "loss", points: randInt(1, 2) };
      return { direction: "gain", points: 1 };
    }
    // 20–28: good, maintain.
    if (roll < 0.45) return { direction: "gain", points: 1 };
    if (roll < 0.80) return { direction: "loss", points: 1 };
    return { direction: "gain", points: randInt(1, 2) };
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Main phase — keep 15–30, strong bias > 15
  // ═══════════════════════════════════════════════════════════════

  if (balance < 8) {
    return { direction: "gain", points: randInt(3, 4) };
  }

  if (balance < 12) {
    // Near threshold — strong gain to push above 15.
    if (roll < 0.80) return { direction: "gain", points: randInt(1, 3) };
    return { direction: "gain", points: 1 };
  }

  if (balance >= 12 && balance <= 20) {
    // 12–20 — gain bias to push/stay above 15.
    if (roll < 0.60) return { direction: "gain", points: randInt(1, 2) };
    return { direction: "loss", points: 1 };
  }

  if (balance >= 21 && balance <= 28) {
    // Sweet spot — mild oscillation, slight gain bias.
    if (roll < 0.48) return { direction: "gain", points: 1 };
    if (roll < 0.82) return { direction: "loss", points: 1 };
    return { direction: "gain", points: randInt(1, 2) };
  }

  // > 28 — downward bias toward 15-28 range.
  if (balance > 38) {
    if (roll < 0.85) return { direction: "loss", points: randInt(2, 4) };
    return { direction: "loss", points: 1 };
  }
  if (balance > 32) {
    if (roll < 0.35) return { direction: "gain", points: 1 };
    if (roll < 0.80) return { direction: "loss", points: randInt(1, 2) };
    return { direction: "loss", points: randInt(1, 3) };
  }
  if (roll < 0.30) return { direction: "gain", points: 1 };
  if (roll < 0.78) return { direction: "loss", points: 1 };
  return { direction: "loss", points: randInt(1, 2) };
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
