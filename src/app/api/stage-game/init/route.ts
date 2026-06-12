import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateStageGameTrials } from "@/lib/stage-game/trial-generator";
import { RESOURCE_TASK_CONFIG } from "@/lib/stage-game/config";
import { logEvent } from "@/lib/db/event-log";
import type { Group } from "@/lib/stages";

/**
 * POST /api/stage-game/init
 * Idempotent: generates 90 continuous trials once.
 * On subsequent calls returns the existing trials.
 */
export async function POST(request: Request) {
  const { session_id } = await request.json();
  if (!session_id) {
    return NextResponse.json({ error: "session_id required." }, { status: 400 });
  }

  const db = getDb();

  // Check session exists and get group.
  const session = db
    .prepare(
      `SELECT id, participant_id, group_label, resource_balance
       FROM experiment_sessions WHERE id = ?`,
    )
    .get(session_id) as {
    id: string;
    participant_id: string;
    group_label: string;
    resource_balance: number;
  } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Already initialized? Return existing trials.
  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM stage_game_trials WHERE session_id = ?")
    .get(session_id) as { cnt: number };

  if (existing.cnt > 0) {
    const trials = db
      .prepare(
        `SELECT id, global_trial_index,
                task_type, stimulus_payload, correct_answer,
                is_manipulated_feedback,
                preset_feedback_direction, preset_feedback_points,
                planned_balance_after
         FROM stage_game_trials
         WHERE session_id = ?
         ORDER BY global_trial_index`,
      )
      .all(session_id);

    const completed = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM stage_game_responses WHERE session_id = ?",
      )
      .get(session_id) as { cnt: number };

    return NextResponse.json({
      initialized: false,
      trials,
      completed_trials: completed.cnt,
      current_balance: session.resource_balance,
      group: session.group_label,
    });
  }

  // First time: generate trials.
  const group = session.group_label as Group;
  const config = RESOURCE_TASK_CONFIG[group];

  // Set initial balance if not already set.
  if (session.resource_balance === 0) {
    db.prepare("UPDATE experiment_sessions SET resource_balance = ? WHERE id = ?").run(
      config.initial_balance,
      session_id,
    );
  }

  const trials = generateStageGameTrials(session_id, group);

  const insert = db.prepare(`
    INSERT INTO stage_game_trials
      (id, session_id, block_index, trial_index, global_trial_index,
       task_type, stimulus_payload, correct_answer,
       is_manipulated_feedback,
       preset_feedback_direction, preset_feedback_points,
       planned_balance_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    for (const t of trials) {
      insert.run(
        t.id,
        t.session_id,
        0, // block_index — continuous task, no blocks
        t.global_trial_index, // trial_index = global (continuous)
        t.global_trial_index,
        t.task_type,
        JSON.stringify(t.stimulus_payload),
        t.correct_answer,
        t.is_manipulated_feedback,
        t.preset_feedback_direction ?? "none",
        t.preset_feedback_points ?? 0,
        t.planned_balance_after ?? 0,
        now,
      );
    }
  });
  transaction();

  logEvent(session_id, session.participant_id, "stage_game_trials_initialized", {
    total_trials: trials.length,
    group,
    initial_balance: config.initial_balance,
  });

  return NextResponse.json({
    initialized: true,
    trials: trials.map((t) => ({
      id: t.id,
      global_trial_index: t.global_trial_index,
      task_type: t.task_type,
      stimulus_payload: t.stimulus_payload,
      correct_answer: t.correct_answer,
      is_manipulated_feedback: t.is_manipulated_feedback,
      preset_feedback_direction: t.preset_feedback_direction,
      preset_feedback_points: t.preset_feedback_points,
      planned_balance_after: t.planned_balance_after,
    })),
    completed_trials: 0,
    current_balance: config.initial_balance,
    group: session.group_label,
  });
}
