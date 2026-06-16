import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { STAGES } from "@/lib/stages";
import type { Group } from "@/lib/stages";
import crypto from "crypto";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.PARTICIPANT_ACCESS_SECRET || "study1-participant-access-secret",
);

/** Deterministic group assignment based on participant code.
 *  Codes must start with "P" followed by digits (e.g., P001, P002).
 *  Odd number → scarcity, even number → abundance. */
function assignGroup(participantCode: string): Group {
  const match = participantCode.match(/^P(\d+)$/i);
  if (!match) throw new Error("Invalid participant code format");
  const num = parseInt(match[1], 10);
  return num % 2 === 1 ? "scarcity" : "abundance";
}

export async function POST(request: Request) {
  // Verify participant access cookie.
  const cookieStore = await cookies();
  const token = cookieStore.get("participant_access")?.value;
  if (!token) {
    return NextResponse.json(
      { error: "请先完成实验进入验证。" },
      { status: 403 },
    );
  }
  try {
    await jwtVerify(token, ACCESS_SECRET);
  } catch {
    return NextResponse.json(
      { error: "请先完成实验进入验证。" },
      { status: 403 },
    );
  }

  const { participant_code, name, birth_date, gender, grade, major, contact } = await request.json();

  if (!participant_code || !name || !birth_date || !gender) {
    return NextResponse.json(
      { error: "请填写所有必填信息（被试编号、姓名、出生日期、性别）。" },
      { status: 400 },
    );
  }

  if (!/^P\d+$/i.test(participant_code)) {
    return NextResponse.json(
      { error: "被试编号格式无效。请使用 P+数字 格式（如 P001）。" },
      { status: 400 },
    );
  }

  if (gender !== "male" && gender !== "female") {
    return NextResponse.json(
      { error: "性别选择无效。" },
      { status: 400 },
    );
  }

  // Validate birth_date format YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
    return NextResponse.json(
      { error: "出生日期格式无效，请使用 YYYY-MM-DD 格式。" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Check for duplicate code.
  const existing = db
    .prepare("SELECT id FROM participants WHERE participant_code = ?")
    .get(participant_code);
  if (existing) {
    return NextResponse.json(
      { error: "被试编号已存在，请使用其他编号或通过「继续实验」进入。" },
      { status: 409 },
    );
  }

  const participantId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const group = assignGroup(participant_code);
  const initialStage = STAGES[0]; // baseline_questionnaire

  const insertParticipant = db.prepare(`
    INSERT INTO participants (id, participant_code, name, birth_date, gender, grade, major, contact, consented, consent_timestamp, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'active', ?)
  `);

  const insertSession = db.prepare(`
    INSERT INTO experiment_sessions (id, participant_id, group_label, current_stage, status, started_at, created_at)
    VALUES (?, ?, ?, ?, 'in_progress', ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertParticipant.run(
      participantId, participant_code, name, birth_date, gender,
      grade ?? "", major ?? "", contact ?? "",
      now, now,
    );
    insertSession.run(sessionId, participantId, group, initialStage, now, now);
    logEvent(sessionId, participantId, "participant.registered", {
      name,
      birth_date,
      gender,
      grade: grade ?? "",
      major: major ?? "",
      contact: contact ?? "",
      group,
      initial_stage: initialStage,
    });
  });

  transaction();

  return NextResponse.json({
    participant_id: participantId,
    participant_code,
    session_id: sessionId,
    group,
    current_stage: initialStage,
  });
}
