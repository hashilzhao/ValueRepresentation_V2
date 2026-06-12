/**
 * Event logging helpers for Study 1.
 *
 * Every important participant action should be logged via these functions.
 * event_logs is an immutable audit trail — never UPDATE or DELETE rows in it.
 */

import { getDb } from "@/lib/db";

export function logEvent(
  sessionId: string,
  participantId: string,
  eventType: string,
  eventData?: Record<string, unknown>,
) {
  const db = getDb();
  db.prepare(
    `INSERT INTO event_logs (session_id, participant_id, event_type, event_data)
     VALUES (?, ?, ?, ?)`,
  ).run(sessionId, participantId, eventType, eventData ? JSON.stringify(eventData) : null);
}

/**
 * TODO: Add more specific log helpers as the experiment grows:
 *
 * - logStageTransition(sessionId, participantId, from, to)
 * - logTrialResponse(sessionId, participantId, trialIndex, response, rt)
 * - logExclusion(sessionId, participantId, reason)
 */
