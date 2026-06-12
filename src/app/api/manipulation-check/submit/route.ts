import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { MC_ITEMS } from "@/lib/manipulation-check/items";
import {
  computeConstructMeans,
  saveConstructMeans,
} from "@/lib/manipulation-check/scoring";
import { nextStage } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import crypto from "crypto";

export async function POST(request: Request) {
  const { session_id, responses } = await request.json();

  if (!session_id || !responses || !Array.isArray(responses)) {
    return NextResponse.json(
      { error: "session_id and responses[] are required." },
      { status: 400 },
    );
  }

  // All 14 items required.
  if (responses.length !== 14) {
    return NextResponse.json(
      { error: `Expected 14 responses, got ${responses.length}.` },
      { status: 400 },
    );
  }

  const db = getDb();

  const session = db
    .prepare(
      `SELECT id, participant_id, current_stage, status
       FROM experiment_sessions WHERE id = ?`,
    )
    .get(session_id) as
    | { id: string; participant_id: string; current_stage: string; status: string }
    | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  if (session.status !== "in_progress") {
    return NextResponse.json(
      { error: "Session is not in progress." },
      { status: 400 },
    );
  }

  // Validate each response.
  const itemMap = new Map(MC_ITEMS.map((it) => [it.item_id, it]));
  for (const r of responses) {
    const item = itemMap.get(r.item_id);
    if (!item) {
      return NextResponse.json(
        { error: `Unknown item_id: ${r.item_id}.` },
        { status: 400 },
      );
    }
    const val = r.response_value;
    if (typeof val !== "number" || val < 1 || val > 7 || !Number.isInteger(val)) {
      return NextResponse.json(
        { error: `Invalid response_value for item ${r.item_id}: ${val}. Must be integer 1–7.` },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO manipulation_check_responses
      (id, session_id, participant_id, item_id, construct, item_text,
       response_value, reverse_scored, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const r of responses) {
      const item = itemMap.get(r.item_id)!;
      insert.run(
        crypto.randomUUID(),
        session_id,
        session.participant_id,
        item.item_id,
        item.construct,
        item.item_text,
        r.response_value,
        item.reverse_scored ? 1 : 0,
        now,
      );
    }

    // Compute and save construct means.
    const means = computeConstructMeans(session_id);
    saveConstructMeans(session_id, means);

    logEvent(session_id, session.participant_id, "manipulation_check_completed", {
      ...means,
      item_count: responses.length,
    });
  });

  transaction();

  // Advance stage.
  const current = session.current_stage as Stage;
  const next = nextStage(current);
  if (next) {
    db.prepare(
      `UPDATE experiment_sessions SET current_stage = ?, status = 'in_progress' WHERE id = ?`,
    ).run(next, session_id);

    logEvent(session_id, session.participant_id, "stage.advanced", {
      from: current,
      to: next,
    });
  }

  return NextResponse.json({
    success: true,
    current_stage: next ?? current,
  });
}
