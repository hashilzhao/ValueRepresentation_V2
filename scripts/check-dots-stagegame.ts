// @ts-nocheck
/**
 * Dot generation + abundance trajectory check.
 * Run: npm run check:dots-stagegame
 */
const DOTS_SAMPLES = 1000;
const TRAJECTORY_SIMS = 200;
const TOTAL_TRIALS = 90;

import { generateDotPositions } from "../src/lib/stimulus/dots";

let passed = 0; let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { passed++; } else { failed++; console.log("  ❌ " + label + (detail ? ": " + detail : "")); }
}

// ═══════════════════════════════════════════════════════════════
// Part 1: Dot generation quality
// ═══════════════════════════════════════════════════════════════

console.log("=== Dot Generation Check ===\n");

let globalMinDist = Infinity;
let globalMinDistPx = Infinity;
let overlapCount = 0;
let edgeTouchCount = 0;
const panelPx = 320; // CSS panel width in px (approximate)

for (let s = 0; s < DOTS_SAMPLES; s++) {
  const count = 30 + Math.floor(Math.random() * 21); // 30–50
  const positions = generateDotPositions(count, {
    panelWidth: 45, panelHeight: 90, minDistance: 7, padding: 5,
  });

  // Check count
  if (positions.length !== count) {
    console.warn(`  Sample ${s}: only ${positions.length}/${count} dots generated`);
  }

  // Check overlap & distances (in % units, convert to approximate px)
  let sampleMinPct = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const [xi, yi] = positions[i];
    // Edge check (padding = 5, panelWidth = 45, panelHeight = 90)
    if (xi < 4 || xi > 41 || yi < 4 || yi > 86) {
      edgeTouchCount++;
    }
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[j][0] - xi;
      const dy = positions[j][1] - yi;
      const d2 = dx * dx + dy * dy;
      if (d2 < sampleMinPct) sampleMinPct = d2;
      if (d2 < 1e-6) overlapCount++; // essentially identical positions
    }
  }
  if (sampleMinPct < globalMinDist) globalMinDist = sampleMinPct;
  const minPx = Math.sqrt(sampleMinPct) * (panelPx / 45);
  if (minPx < globalMinDistPx) globalMinDistPx = minPx;
}

console.log(`  Samples: ${DOTS_SAMPLES}`);
console.log(`  Overlaps (identical positions): ${overlapCount}`);
console.log(`  Edge violations: ${edgeTouchCount}`);
console.log(`  Min center distance (%): ${Math.sqrt(globalMinDist).toFixed(2)}`);
console.log(`  Min center distance (px approx): ${globalMinDistPx.toFixed(1)}`);
check("Zero overlaps", overlapCount === 0);
check("Min distance >= 5 units", Math.sqrt(globalMinDist) >= 5);
check("Min distance >= 10px", globalMinDistPx >= 10);

// ═══════════════════════════════════════════════════════════════
// Part 2: Abundance trajectory simulation
// ═══════════════════════════════════════════════════════════════

console.log("\n=== Abundance Trajectory Simulation ===\n");

// Inline abundance feedback logic (same as trial-generator).
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function abundanceFeedback(balance: number, trialIndex: number): { dir: string; pts: number } {
  const roll = Math.random();
  const remaining = TOTAL_TRIALS - trialIndex;

  if (remaining <= 5) {
    if (balance < 110) {
      if (balance < 105) return { dir: "gain", pts: randInt(2, 3) };
      return { dir: "gain", pts: randInt(1, 2) };
    }
    if (balance > 130) {
      if (roll < 0.50) return { dir: "loss", pts: 1 };
      return { dir: "gain", pts: 1 };
    }
    if (roll < 0.55) return { dir: "gain", pts: 1 };
    return { dir: "loss", pts: 1 };
  }

  if (remaining <= 20) {
    if (balance < 105) {
      if (roll < 0.85) return { dir: "gain", pts: randInt(1, 3) };
      return { dir: "gain", pts: 1 };
    }
    if (balance < 110) {
      if (roll < 0.70) return { dir: "gain", pts: randInt(1, 2) };
      return { dir: "loss", pts: 1 };
    }
    if (balance >= 110 && balance <= 125) {
      if (balance > 122) {
        if (roll < 0.40) return { dir: "gain", pts: 1 };
        if (roll < 0.82) return { dir: "loss", pts: 1 };
        return { dir: "loss", pts: randInt(1, 2) };
      }
      if (roll < 0.48) return { dir: "gain", pts: 1 };
      if (roll < 0.85) return { dir: "loss", pts: 1 };
      return { dir: "gain", pts: randInt(1, 2) };
    }
    if (roll < 0.25) return { dir: "gain", pts: 1 };
    if (roll < 0.80) return { dir: "loss", pts: randInt(1, 2) };
    return { dir: "loss", pts: randInt(1, 3) };
  }

  if (trialIndex < 30) {
    if (balance < 95) return { dir: "gain", pts: randInt(2, 4) };
    if (balance < 100) {
      if (roll < 0.80) return { dir: "gain", pts: randInt(1, 3) };
      return { dir: "gain", pts: 1 };
    }
    if (balance >= 100 && balance <= 110) {
      if (roll < 0.60) return { dir: "gain", pts: randInt(1, 2) };
      if (roll < 0.85) return { dir: "loss", pts: 1 };
      return { dir: "gain", pts: 1 };
    }
    if (balance > 118) {
      if (roll < 0.60) return { dir: "loss", pts: randInt(1, 2) };
      return { dir: "gain", pts: 1 };
    }
    if (roll < 0.50) return { dir: "gain", pts: 1 };
    if (roll < 0.85) return { dir: "loss", pts: 1 };
    return { dir: "gain", pts: randInt(1, 2) };
  }

  // Middle
  if (balance < 100) {
    if (roll < 0.80) return { dir: "gain", pts: randInt(2, 4) };
    return { dir: "gain", pts: 1 };
  }
  if (balance < 105) {
    if (roll < 0.70) return { dir: "gain", pts: randInt(1, 2) };
    return { dir: "loss", pts: 1 };
  }
  if (balance >= 105 && balance <= 120) {
    if (roll < 0.45) return { dir: "gain", pts: 1 };
    if (roll < 0.85) return { dir: "loss", pts: 1 };
    return { dir: "gain", pts: randInt(1, 2) };
  }
  if (balance > 120 && balance <= 128) {
    if (roll < 0.35) return { dir: "gain", pts: 1 };
    if (roll < 0.80) return { dir: "loss", pts: 1 };
    return { dir: "loss", pts: randInt(1, 2) };
  }
  if (roll < 0.25) return { dir: "gain", pts: 1 };
  if (roll < 0.80) return { dir: "loss", pts: randInt(1, 2) };
  return { dir: "loss", pts: randInt(1, 3) };
}

function shapeMatchingFeedback(accuracy: number | null, timeout: boolean): { dir: string; pts: number } {
  if (timeout || accuracy === 0) return { dir: "loss", pts: 2 };
  return { dir: "gain", pts: 2 };
}

const finals: number[] = [];
const late20: number[] = [];
const below100: number[] = [];
const above140: number[] = [];

// Simulate trial order: 72 DC + 18 SM, constrained random.
function generateTaskTypes(): string[] {
  const types: string[] = new Array(TOTAL_TRIALS).fill("dot_comparison");
  const smPositions: number[] = [];
  const step = Math.floor(TOTAL_TRIALS / 18);
  for (let i = 0; i < 18; i++) smPositions.push(i * step + Math.floor(Math.random() * 2));
  smPositions.sort((a, b) => a - b);
  for (const pos of smPositions) { if (pos < TOTAL_TRIALS) types[pos] = "shape_matching"; }
  return types;
}

for (let sim = 0; sim < TRAJECTORY_SIMS; sim++) {
  let balance = 100;
  const taskTypes = generateTaskTypes();
  let below = 0, above = 0;
  const lateBalances: number[] = [];

  for (let t = 0; t < TOTAL_TRIALS; t++) {
    if (taskTypes[t] === "shape_matching") {
      // Simulate ~80% accuracy for SM.
      const correct = Math.random() < 0.80;
      const fb = shapeMatchingFeedback(correct ? 1 : 0, false);
      balance += fb.dir === "gain" ? fb.pts : -fb.pts;
    } else {
      const fb = abundanceFeedback(balance, t);
      balance += fb.dir === "gain" ? fb.pts : -fb.pts;
    }

    if (balance < 100) below++;
    if (balance > 140) above++;
    if (t >= TOTAL_TRIALS - 20) lateBalances.push(balance);
  }

  finals.push(balance);
  below100.push(below);
  above140.push(above);
  late20.push(...lateBalances);
}

const finalAvg = finals.reduce((a, b) => a + b, 0) / finals.length;
const finalMin = Math.min(...finals);
const finalMax = Math.max(...finals);
const below110 = finals.filter(b => b < 110).length;
const late20InRange = late20.filter(b => b >= 110 && b <= 130).length;
const late20Rate = (late20InRange / late20.length * 100);
const avgBelow = below100.reduce((a, b) => a + b, 0) / below100.length;
const avgAbove = above140.reduce((a, b) => a + b, 0) / above140.length;

console.log(`  Simulations: ${TRAJECTORY_SIMS}`);
console.log(`  Final balance: avg=${finalAvg.toFixed(1)} min=${finalMin} max=${finalMax}`);
console.log(`  Final >= 110: ${TRAJECTORY_SIMS - below110}/${TRAJECTORY_SIMS}`);
console.log(`  Late 20 in 110–130: ${late20Rate.toFixed(1)}%`);
console.log(`  Avg trials below 100: ${avgBelow.toFixed(1)} per sim`);
console.log(`  Avg trials above 140: ${avgAbove.toFixed(1)} per sim`);
console.log(`  Final in 112–128: ${finals.filter(b => b >= 112 && b <= 128).length}/${TRAJECTORY_SIMS}`);

check("Final balance >= 110 for all sims", below110 === 0,
  `${below110}/${TRAJECTORY_SIMS} failed`);
check("Late 20 mostly in 110–130 (>= 80%)", late20Rate >= 80,
  `${late20Rate.toFixed(1)}%`);
check("Below 100 is rare (< 5 avg trials)", avgBelow < 5,
  `avg ${avgBelow.toFixed(1)}`);
check("Above 140 is rare (< 3 avg trials)", avgAbove < 3,
  `avg ${avgAbove.toFixed(1)}`);
check("Final mostly in 112–128 (>= 70%)",
  finals.filter(b => b >= 112 && b <= 128).length / TRAJECTORY_SIMS >= 0.70);

// ═══════════════════════════════════════════════════════════════
console.log("\n=== Summary ===");
console.log(`  Passed: ${passed}/${passed + failed}`);
if (failed > 0) { console.log(`  Failed: ${failed}`); process.exit(1); }
console.log("  ✅ ALL CHECKS PASSED");
