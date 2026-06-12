import { getDb } from "@/lib/db";

export interface StageGameProgress {
  total_trials: number;
  completed_trials: number;
  current_balance: number;
  accuracy: number | null;
  mean_rt_ms: number | null;
  missed_count: number;
}

/**
 * Calculate progress for a session's stage-game (continuous 90-trial task).
 * Used by the admin dashboard and resume logic.
 */
export function calculateStageGameProgress(
  sessionId: string,
): StageGameProgress {
  const db = getDb();

  const trialCount = db
    .prepare("SELECT COUNT(*) AS cnt FROM stage_game_trials WHERE session_id = ?")
    .get(sessionId) as { cnt: number };

  const responseStats = db
    .prepare(
      `SELECT COUNT(*) AS completed,
              AVG(CASE WHEN accuracy = 1 THEN 1.0 ELSE 0.0 END) AS acc,
              AVG(rt_ms) AS avg_rt,
              SUM(missed_response) AS missed
       FROM stage_game_responses
       WHERE session_id = ?`,
    )
    .get(sessionId) as {
    completed: number;
    acc: number | null;
    avg_rt: number | null;
    missed: number;
  };

  const balance = db
    .prepare("SELECT resource_balance FROM experiment_sessions WHERE id = ?")
    .get(sessionId) as { resource_balance: number } | undefined;

  return {
    total_trials: trialCount.cnt,
    completed_trials: responseStats.completed,
    current_balance: balance?.resource_balance ?? 0,
    accuracy: responseStats.acc,
    mean_rt_ms: responseStats.avg_rt,
    missed_count: responseStats.missed,
  };
}
