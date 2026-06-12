import crypto from "crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";

const SUSPICION_KEYWORDS = [
  "预设", "程序控制", "假的", "假反馈", "虚假", "伪造",
  "操纵", "人为控制", "不是真的", "故意", "欺骗",
  "scarcity", "abundance", "manipulation", "fake", "faked",
  "资源匮乏", "资源充裕", "分组",
];

function checkSuspicion(freeText: string, suspicionRating: number): boolean {
  if (suspicionRating >= 6) return true;
  const lower = freeText.toLowerCase();
  return SUSPICION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export async function POST(request: Request) {
  const body = await request.json();
  const { session_id } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id required." }, { status: 400 });
  }

  const db = getDb();
  const session = db
    .prepare("SELECT id, participant_id, current_stage FROM experiment_sessions WHERE id = ?")
    .get(session_id) as { id: string; participant_id: string; current_stage: string } | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const purposeText = body.perceived_study_purpose_text ?? "";
  const unusualText = body.unusual_or_unrealistic_text ?? "";
  const suspicionRating = body.preset_feedback_suspicion ?? 4;
  const suspicionFlag = checkSuspicion(purposeText + " " + unusualText, suspicionRating);

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO post_experiment_checks
      (id, session_id, participant_id,
       performance_feedback_belief, preset_feedback_suspicion,
       resource_task_influence_belief, perceived_study_purpose_text,
       main_choice_strategy, unusual_or_unrealistic_text,
       suspicion_flag, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    crypto.randomUUID(),
    session_id, session.participant_id,
    body.performance_feedback_belief,
    body.preset_feedback_suspicion,
    body.resource_task_influence_belief,
    purposeText || null,
    body.main_choice_strategy || null,
    unusualText || null,
    suspicionFlag ? 1 : 0,
    now,
  );

  logEvent(session_id, session.participant_id, "post_experiment_check_completed", {
    suspicion_flag: suspicionFlag,
  });

  // Complete session.
  db.prepare(
    "UPDATE experiment_sessions SET current_stage = 'complete', status = 'completed', completed_at = ? WHERE id = ?",
  ).run(now, session_id);

  logEvent(session_id, session.participant_id, "session.completed", {});

  return NextResponse.json({
    success: true,
    completed: true,
    suspicion_flag: suspicionFlag,
  });
}
