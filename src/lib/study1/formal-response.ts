import crypto from "crypto";
import { getDb } from "@/lib/db";

interface ChoiceInput {
  sessionId: string;
  participantId: string;
  formalTrialId: string;
  trialIndex: number;
  trialType: string;
  leftStimId: string;
  rightStimId: string;
  leftLikingRank: number;
  rightLikingRank: number;
  leftExternalValue: number;
  rightExternalValue: number;
  deltaLiking: number;
  deltaValue: number;
  responseSide: string | null;
  chosenStimId: string | null;
  responseMethod: string | null;
  rtMs: number | null;
  timeout: boolean;
}

export function saveChoiceResponse(input: ChoiceInput): void {
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM choice_responses WHERE session_id = ? AND formal_trial_id = ?")
    .get(input.sessionId, input.formalTrialId);
  if (existing) return;

  // High liking: chose the side with higher calibrated_liking_rank.
  const choseHighLiking =
    input.responseSide === null ? null :
    input.leftLikingRank === input.rightLikingRank ? null :
    input.chosenStimId === (input.leftLikingRank > input.rightLikingRank ? input.leftStimId : input.rightStimId) ? 1 : 0;

  // High value: chose the side with higher external_value.
  const choseHighValue =
    input.responseSide === null ? null :
    input.leftExternalValue === input.rightExternalValue ? null :
    input.chosenStimId === (input.leftExternalValue > input.rightExternalValue ? input.leftStimId : input.rightStimId) ? 1 : 0;

  // Congruent advantage: chose the side with BOTH higher liking AND higher value.
  let choseCongruentAdv: number | null = null;
  if (input.trialType === "congruent" && input.responseSide !== null) {
    const hlSide = input.leftLikingRank > input.rightLikingRank ? "left" : "right";
    const hvSide = input.leftExternalValue > input.rightExternalValue ? "left" : "right";
    if (hlSide === hvSide) {
      choseCongruentAdv = input.responseSide === hlSide ? 1 : 0;
    }
  }

  // Conflict-specific: high-liking-low-value vs low-liking-high-value.
  let choseHighLikingLowValue: number | null = null;
  let choseLowLikingHighValue: number | null = null;
  if (input.trialType === "conflict" && input.responseSide !== null) {
    const hlSide = input.leftLikingRank > input.rightLikingRank ? "left" : "right";
    const hvSide = input.leftExternalValue > input.rightExternalValue ? "left" : "right";
    choseHighLikingLowValue = input.responseSide === hlSide ? 1 : 0;
    choseLowLikingHighValue = input.responseSide === hvSide ? 1 : 0;
  }

  const chosenLikingRank =
    input.responseSide === "left" ? input.leftLikingRank :
    input.responseSide === "right" ? input.rightLikingRank : null;
  const chosenExternalValue =
    input.responseSide === "left" ? input.leftExternalValue :
    input.responseSide === "right" ? input.rightExternalValue : null;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO choice_responses
      (id, session_id, participant_id, formal_trial_id, trial_index, trial_type,
       left_stim_id, right_stim_id, left_liking_rank, right_liking_rank,
       left_external_value, right_external_value, delta_liking, delta_value,
       response_side, chosen_stim_id, chosen_liking_rank, chosen_external_value,
       response_method, rt_ms, timeout,
       chose_high_liking, chose_high_value, chose_congruent_advantage,
       chose_high_liking_low_value, chose_low_liking_high_value,
       created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    crypto.randomUUID(), input.sessionId, input.participantId,
    input.formalTrialId, input.trialIndex, input.trialType,
    input.leftStimId, input.rightStimId,
    input.leftLikingRank, input.rightLikingRank,
    input.leftExternalValue, input.rightExternalValue,
    input.deltaLiking, input.deltaValue,
    input.responseSide, input.chosenStimId,
    chosenLikingRank, chosenExternalValue,
    input.responseMethod, input.rtMs, input.timeout ? 1 : 0,
    choseHighLiking, choseHighValue, choseCongruentAdv,
    choseHighLikingLowValue, choseLowLikingHighValue,
    now,
  );
}

export function computeFormalChoiceProgress(sessionId: string): {
  total: number; completed: number; timeoutRate: number | null;
  meanRtMs: number | null; byType: Record<string, number>;
  conflictHighValueCount: number; conflictTotal: number;
  highLikingCount: number; highLikingTotal: number;
  congruentAdvCount: number; congruentTotal: number;
} {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
  const completed = (db.prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id = ?").get(sessionId) as { cnt: number }).cnt;
  const timeoutRow = (db.prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id = ? AND timeout = 1").get(sessionId) as { cnt: number }).cnt;
  const rtRow = (db.prepare("SELECT AVG(rt_ms) AS avg FROM choice_responses WHERE session_id = ? AND timeout = 0").get(sessionId) as { avg: number | null }).avg;
  const byType = db.prepare("SELECT trial_type, COUNT(*) AS cnt FROM choice_responses WHERE session_id = ? GROUP BY trial_type").all(sessionId) as { trial_type: string; cnt: number }[];
  const typeCounts: Record<string, number> = {};
  for (const r of byType) typeCounts[r.trial_type] = r.cnt;
  const conflictRow = db.prepare("SELECT COUNT(*) AS total, SUM(chose_high_value) AS hv FROM choice_responses WHERE session_id = ? AND trial_type = 'conflict' AND timeout = 0").get(sessionId) as { total: number; hv: number | null };
  const likingRow = db.prepare("SELECT COUNT(*) AS total, SUM(chose_high_liking) AS hl FROM choice_responses WHERE session_id = ? AND trial_type != 'value_only' AND timeout = 0").get(sessionId) as { total: number; hl: number | null };
  const congruRow = db.prepare("SELECT COUNT(*) AS total, SUM(chose_congruent_advantage) AS ca FROM choice_responses WHERE session_id = ? AND trial_type = 'congruent' AND timeout = 0").get(sessionId) as { total: number; ca: number | null };

  return {
    total, completed,
    timeoutRate: total > 0 ? timeoutRow / total : null,
    meanRtMs: rtRow,
    byType: typeCounts,
    conflictHighValueCount: conflictRow?.hv ?? 0,
    conflictTotal: conflictRow?.total ?? 0,
    highLikingCount: likingRow?.hl ?? 0,
    highLikingTotal: likingRow?.total ?? 0,
    congruentAdvCount: congruRow?.ca ?? 0,
    congruentTotal: congruRow?.total ?? 0,
  };
}
