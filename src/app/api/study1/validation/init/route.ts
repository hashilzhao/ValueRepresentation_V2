import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import crypto from "crypto";

const DEV = process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true";

export async function POST(request: Request) {
  const { session_id } = await request.json();
  if (!session_id) return NextResponse.json({ error: "session_id required." }, { status: 400 });

  const db = getDb();

  // Already generated?
  const existing = db.prepare(
    "SELECT COUNT(*) AS cnt FROM liking_validation_trials WHERE session_id = ?"
  ).get(session_id) as { cnt: number };
  if (existing.cnt > 0) {
    const done = db.prepare(
      "SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id = ?"
    ).get(session_id) as { cnt: number };
    return NextResponse.json({ initialized: false, total: existing.cnt, done: done.cnt });
  }

  // Read calibrated ranks from second orthogonalized table.
  const attemptIndex = (db.prepare(
    "SELECT calibration_attempt_index FROM experiment_sessions WHERE id = ?"
  ).get(session_id) as { calibration_attempt_index: number }).calibration_attempt_index;

  const rows = db.prepare(
    `SELECT cso.stim_id, cso.set_id, cso.calibrated_liking_rank,
            ssa.image_url
     FROM cross_set_orthogonalized cso
     JOIN subject_set_assignment ssa ON ssa.session_id = cso.session_id AND ssa.stim_id = cso.stim_id
     WHERE cso.session_id = ? AND cso.calibration_attempt_index = ?`
  ).all(session_id, attemptIndex) as {
    stim_id: string; set_id: string; calibrated_liking_rank: number; image_url: string;
  }[];

  if (rows.length < 25) {
    return NextResponse.json({
      error: `Orthogonalized table incomplete: ${rows.length}/25.`,
    }, { status: 400 });
  }

  // Group by calibrated rank.
  const byRank: Record<number, { stim_id: string; set_id: string; image_url: string }[]> = {};
  for (const r of rows) {
    (byRank[r.calibrated_liking_rank] ??= []).push({
      stim_id: r.stim_id, set_id: r.set_id, image_url: r.image_url,
    });
  }

  const trials: any[] = [];
  let idx = 0;

  // different_rank: 30 trials comparing items from different calibrated ranks.
  const diffRankPairs: [number, number][] = [[1, 3], [2, 4], [3, 5], [1, 4], [2, 5], [1, 5]];
  const targetDiff = DEV ? 6 : 30;

  for (const [lo, hi] of diffRankPairs) {
    const loItems = byRank[lo] ?? [];
    const hiItems = byRank[hi] ?? [];
    if (loItems.length === 0 || hiItems.length === 0) continue;

    for (const loItem of loItems) {
      for (const hiItem of hiItems) {
        if (trials.length >= targetDiff) break;
        const swap = Math.random() < 0.5;
        trials.push({
          id: crypto.randomUUID(), session_id, trial_index: idx++, validation_type: "different_rank",
          left_stim_id: swap ? loItem.stim_id : hiItem.stim_id,
          right_stim_id: swap ? hiItem.stim_id : loItem.stim_id,
          left_set_id: swap ? loItem.set_id : hiItem.set_id,
          right_set_id: swap ? hiItem.set_id : loItem.set_id,
          left_liking_rank: swap ? lo : hi,
          right_liking_rank: swap ? hi : lo,
          expected_choice: swap ? "right" : "left",
          left_image_url: swap ? loItem.image_url : hiItem.image_url,
          right_image_url: swap ? hiItem.image_url : loItem.image_url,
          created_at: new Date().toISOString(),
        });
      }
      if (trials.length >= targetDiff) break;
    }
    if (trials.length >= targetDiff) break;
  }

  // same_rank: 15 trials comparing items with same calibrated rank.
  const targetSame = DEV ? 4 : 15;
  for (let rank = 1; rank <= 5 && trials.length < targetDiff + targetSame; rank++) {
    const items = byRank[rank] ?? [];
    for (let a = 0; a < items.length && trials.length < targetDiff + targetSame; a++) {
      for (let b = a + 1; b < items.length && trials.length < targetDiff + targetSame; b++) {
        const swap = Math.random() < 0.5;
        trials.push({
          id: crypto.randomUUID(), session_id, trial_index: idx++, validation_type: "same_rank",
          left_stim_id: swap ? items[b].stim_id : items[a].stim_id,
          right_stim_id: swap ? items[a].stim_id : items[b].stim_id,
          left_set_id: swap ? items[b].set_id : items[a].set_id,
          right_set_id: swap ? items[a].set_id : items[b].set_id,
          left_liking_rank: rank, right_liking_rank: rank,
          expected_choice: "none",
          left_image_url: swap ? items[b].image_url : items[a].image_url,
          right_image_url: swap ? items[a].image_url : items[b].image_url,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // If we couldn't reach 45, mark repeated pairs where necessary.
  const totalGenerated = trials.length;

  // Save trials.
  const session = db.prepare(
    "SELECT participant_id FROM experiment_sessions WHERE id = ?"
  ).get(session_id) as { participant_id: string };

  const insert = db.prepare(`
    INSERT INTO liking_validation_trials
      (id, session_id, participant_id, trial_index, validation_type,
       left_stim_id, right_stim_id, left_set_id, right_set_id,
       left_liking_rank, right_liking_rank, expected_choice,
       left_image_url, right_image_url, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  db.transaction(() => {
    for (const t of trials) {
      insert.run(
        t.id, t.session_id, session.participant_id, t.trial_index, t.validation_type,
        t.left_stim_id, t.right_stim_id, t.left_set_id, t.right_set_id,
        t.left_liking_rank, t.right_liking_rank, t.expected_choice,
        t.left_image_url, t.right_image_url, t.created_at,
      );
    }
  })();

  return NextResponse.json({
    initialized: true,
    total: totalGenerated,
    done: 0,
    target_diff: targetDiff,
    target_same: targetSame,
  });
}
