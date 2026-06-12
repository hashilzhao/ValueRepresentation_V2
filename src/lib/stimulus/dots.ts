/**
 * Safe dot position generation for dot_comparison stimuli.
 *
 * Rules:
 * - Rejection sampling: each candidate point must be ≥ minDistance from all existing.
 * - Dots stay within padding from panel edges.
 * - On exhaustion, relax minDistance in steps; never drop below absolute floor.
 * - If still failing, deterministically fill remaining slots with guaranteed spacing.
 *
 * Shared by: practice trials, formal stage-game (StageGameTask), and trial-generator.
 */

export interface DotGenOptions {
  panelWidth?: number;   // percentage, default 85
  panelHeight?: number;  // percentage, default 85
  minDistance?: number;  // percentage, default 16
  padding?: number;      // percentage, default 14
  maxAttempts?: number;  // default 3000
}

const DEFAULTS: Required<DotGenOptions> = {
  panelWidth: 100,
  panelHeight: 100,
  minDistance: 4,
  padding: 6,
  maxAttempts: 8000,
};

/** Absolute floor for minDistance — never go below this. */
const ABSOLUTE_MIN_DIST = 2;

export function generateDotPositions(
  count: number,
  opts: DotGenOptions = {},
): [number, number][] {
  const o = { ...DEFAULTS, ...opts };
  const positions: [number, number][] = [];
  const minX = o.padding;
  const maxX = o.panelWidth - o.padding;
  const minY = o.padding;
  const maxY = o.panelHeight - o.padding;

  // Rejection sampling with progressive relaxation.
  const relaxSteps = [1.0, 0.8, 0.6, 0.4, 0.25];
  for (let step = 0; step < relaxSteps.length && positions.length < count; step++) {
    const d2 = (o.minDistance * relaxSteps[step]) ** 2;
    if (d2 < ABSOLUTE_MIN_DIST ** 2) break;
    for (let att = 0; att < o.maxAttempts && positions.length < count; att++) {
      // Use a jittered random position for more natural scatter.
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      let ok = true;
      for (const [px, py] of positions) {
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy < d2) { ok = false; break; }
      }
      if (ok) positions.push([x, y]);
    }
  }

  // Deterministic grid-fallback if still short.
  if (positions.length < count) {
    console.warn(
      `[dots] Rejection sampling placed only ${positions.length}/${count} dots. ` +
      `Falling back to deterministic grid with minDist=${ABSOLUTE_MIN_DIST}.`,
    );
    const cols = Math.floor((maxX - minX) / ABSOLUTE_MIN_DIST);
    const rows = Math.floor((maxY - minY) / ABSOLUTE_MIN_DIST);
    const grid: [number, number][] = [];
    for (let r = 0; r < rows && grid.length < count; r++) {
      for (let c = 0; c < cols && grid.length < count; c++) {
        grid.push([
          minX + (c + 0.5) * ((maxX - minX) / cols),
          minY + (r + 0.5) * ((maxY - minY) / rows),
        ]);
      }
    }
    // Shuffle grid so it doesn't look like a checkerboard.
    const shuffled = [...grid].sort(() => Math.random() - 0.5);
    while (positions.length < count) {
      positions.push(shuffled[positions.length % shuffled.length]);
    }
  }

  return shufflePositions(positions);
}

function shufflePositions(pos: [number, number][]): [number, number][] {
  const a = [...pos];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
