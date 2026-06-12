import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const { participant_code } = await request.json();

  if (!participant_code) {
    return NextResponse.json(
      { error: "participant_code is required." },
      { status: 400 },
    );
  }

  const db = getDb();

  const participant = db
    .prepare("SELECT id FROM participants WHERE participant_code = ?")
    .get(participant_code) as { id: string } | undefined;

  if (!participant) {
    return NextResponse.json(
      { error: "未找到该被试编号，请检查后重试。" },
      { status: 404 },
    );
  }

  // Find the most recent in-progress session for this participant.
  const session = db
    .prepare(
      `SELECT id FROM experiment_sessions
       WHERE participant_id = ? AND status = 'in_progress'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(participant.id) as { id: string } | undefined;

  if (!session) {
    return NextResponse.json(
      { error: "该被试没有进行中的实验会话，可能需要重新注册。" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    participant_code,
    session_id: session.id,
  });
}
