import { getDb } from "@/lib/db";
import { MC_ITEMS } from "./items";

export interface ConstructMeans {
  resource_insufficiency_mean: number | null;
  resource_confidence_mean: number | null;
  stress_negative_affect_mean: number | null;
  task_engagement_mean: number | null;
}

/**
 * Compute construct means from saved manipulation_check_responses.
 * Returns null for constructs with no responses.
 */
export function computeConstructMeans(
  sessionId: string,
): ConstructMeans {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT construct, AVG(response_value) AS mean_val
       FROM manipulation_check_responses
       WHERE session_id = ?
       GROUP BY construct`,
    )
    .all(sessionId) as { construct: string; mean_val: number }[];

  const means: ConstructMeans = {
    resource_insufficiency_mean: null,
    resource_confidence_mean: null,
    stress_negative_affect_mean: null,
    task_engagement_mean: null,
  };

  for (const row of rows) {
    const key = `${row.construct}_mean` as keyof ConstructMeans;
    means[key] = Math.round(row.mean_val * 100) / 100; // round to 2 decimals
  }

  return means;
}

/**
 * Save the computed means into manipulation_check_summary for fast admin lookup.
 */
export function saveConstructMeans(
  sessionId: string,
  means: ConstructMeans,
) {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO manipulation_check_summary
       (session_id, resource_insufficiency_mean, resource_confidence_mean,
        stress_negative_affect_mean, task_engagement_mean)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    means.resource_insufficiency_mean,
    means.resource_confidence_mean,
    means.stress_negative_affect_mean,
    means.task_engagement_mean,
  );
}
