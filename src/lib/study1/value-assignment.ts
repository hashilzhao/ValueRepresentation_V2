import crypto from "crypto";
import { getDb } from "@/lib/db";

const VALUES = [5, 10, 15, 20, 25] as const;

/**
 * Rotating Latin-square-like balanced assignment across sessions.
 * session 1: set_1=5, set_2=10, set_3=15, set_4=20, set_5=25
 * session 2: set_1=10, set_2=15, set_3=20, set_4=25, set_5=5
 * etc.
 */
export function assignExternalValues(sessionId: string): {
  patternIndex: number;
  assignments: { set_id: string; external_value: number }[];
} {
  const db = getDb();

  // Count how many value assignments have been made so far.
  const row = db
    .prepare("SELECT COUNT(DISTINCT session_id) AS cnt FROM value_assignment")
    .get();
  const patternIndex = (row as { cnt: number }).cnt; // 0-based

  const setIds = ["set_1", "set_2", "set_3", "set_4", "set_5"];
  const assignments = setIds.map((setId, i) => ({
    set_id: setId,
    external_value: VALUES[(patternIndex + i) % VALUES.length],
  }));

  return { patternIndex, assignments };
}

/**
 * Build the full stimulus_value_map from value_assignment + liking_map.
 * Idempotent: returns existing map if already created.
 */
export function buildStimulusValueMap(
  sessionId: string,
  participantId: string,
): void {
  const db = getDb();

  const existing = db
    .prepare("SELECT COUNT(*) AS cnt FROM stimulus_value_map WHERE session_id = ?")
    .get(sessionId) as { cnt: number };

  if (existing.cnt > 0) return;

  // Get value per set.
  const va = db
    .prepare("SELECT set_id, external_value FROM value_assignment WHERE session_id = ?")
    .all(sessionId) as { set_id: string; external_value: number }[];

  const valueMap = new Map(va.map((v) => [v.set_id, v.external_value]));

  // Get liking map entries with elo_score and image URLs.
  const lm = db
    .prepare(
      `SELECT lm.set_id, lm.stim_id, lm.stimulus_pool_id, lm.final_liking_rank,
              lm.elo_score, ssa.image_url
       FROM liking_map lm
       JOIN subject_set_assignment ssa ON ssa.session_id = lm.session_id AND ssa.stim_id = lm.stim_id
       WHERE lm.session_id = ?`,
    )
    .all(sessionId) as {
    set_id: string;
    stim_id: string;
    stimulus_pool_id: string;
    final_liking_rank: number;
    elo_score: number | null;
    image_url: string;
  }[];

  const insert = db.prepare(`
    INSERT INTO stimulus_value_map
      (id, session_id, participant_id, set_id, stim_id, stimulus_pool_id,
       final_liking_rank, external_value, image_url, elo_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    for (const row of lm) {
      insert.run(
        crypto.randomUUID(),
        sessionId,
        participantId,
        row.set_id,
        row.stim_id,
        row.stimulus_pool_id,
        row.final_liking_rank,
        valueMap.get(row.set_id) ?? 0,
        row.image_url,
        row.elo_score ?? null,
        now,
        now,
      );
    }
  });
  txn();
}

/** Save a comprehension check attempt. */
export function saveValueComprehensionAttempt(
  sessionId: string,
  participantId: string,
  selectedAnswer: string,
  correct: boolean,
  attempt: number,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO value_comprehension_checks
      (id, session_id, participant_id, attempt, selected_answer, correct, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    sessionId,
    participantId,
    attempt,
    selectedAnswer,
    correct ? 1 : 0,
    new Date().toISOString(),
  );
}

/** Check if a session was flagged for value misunderstanding. */
export function getComprehensionFlag(
  sessionId: string,
): { flagged: boolean; attempts: number } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT attempt, correct FROM value_comprehension_checks
       WHERE session_id = ? ORDER BY attempt`,
    )
    .all(sessionId) as { attempt: number; correct: number }[];

  const attempts = rows.length;
  const allWrong = rows.length >= 2 && rows.every((r) => r.correct === 0);
  return { flagged: allWrong, attempts };
}

/** Get the existing value assignment + stimulus_value_map for a session. */
export function getValueAssignmentForSession(sessionId: string): {
  valueAssignment: { set_id: string; external_value: number }[];
  stimulusMap: {
    set_id: string;
    stim_id: string;
    image_url: string;
    final_liking_rank: number;
    external_value: number;
  }[];
  comprehensionFlagged: boolean;
  comprehensionAttempts: number;
} {
  const db = getDb();

  return {
    valueAssignment: db
      .prepare("SELECT set_id, external_value FROM value_assignment WHERE session_id = ? ORDER BY set_id")
      .all(sessionId) as { set_id: string; external_value: number }[],
    stimulusMap: db
      .prepare("SELECT set_id, stim_id, final_liking_rank, external_value FROM stimulus_value_map WHERE session_id = ? ORDER BY set_id, final_liking_rank")
      .all(sessionId) as any[],
    comprehensionFlagged: getComprehensionFlag(sessionId).flagged,
    comprehensionAttempts: getComprehensionFlag(sessionId).attempts,
  };
}
