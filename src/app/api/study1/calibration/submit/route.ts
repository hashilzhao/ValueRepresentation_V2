import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { submitCalibrationResponse } from "@/lib/study1/calibration-orchestrator";
import { CalibrationOrchestrator } from "@/lib/study1/calibration-orchestrator";
import type { CalibrationResponse, CalibrationPhase } from "@/lib/study1/calibration-types";

export async function POST(request: Request) {
  const body = await request.json();

  const input: CalibrationResponse = {
    session_id: body.session_id,
    participant_id: body.participant_id,
    trial_id: body.trial_id,
    phase: body.phase,
    left_stim_id: body.left_stim_id,
    right_stim_id: body.right_stim_id,
    response_side: body.response_side ?? null,
    chosen_stim_id: body.chosen_stim_id ?? null,
    response_method: body.response_method ?? "keyboard",
    rt_ms: body.rt_ms ?? null,
    timeout: body.timeout ?? false,
    consistent: body.consistent ?? null,
  };

  // Save the response.
  const { phaseCompleted, totalInPhase, doneInPhase } = submitCalibrationResponse(input);

  if (!phaseCompleted) {
    // Mid-phase — return progress.
    const allTotal = (getDb().prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ?"
    ).get(input.session_id) as { cnt: number }).cnt;
    const allDone = (getDb().prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ?"
    ).get(input.session_id) as { cnt: number }).cnt;

    return NextResponse.json({
      success: true,
      completed_trials: allDone,
      total_trials: Math.max(allTotal, allDone + 1),
    });
  }

  // Phase completed — use orchestrator for transition.
  const orchestrator = new CalibrationOrchestrator(input.session_id, input.participant_id);
  const transition = orchestrator.handlePhaseCompleted(phaseCompleted as CalibrationPhase);

  if (transition.next_phase === "complete") {
    // All calibration phases complete — finalize.
    const { nextStage, stability } = orchestrator.finalize();

    return NextResponse.json({
      success: true,
      phase: "complete",
      advance_to: nextStage,
      stability_grade: stability.stability_grade,
    });
  }

  // Phase transition with next phase generated.
  const db = getDb();
  const allTotal = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ?"
  ).get(input.session_id) as { cnt: number }).cnt;
  const allDone = (db.prepare(
    "SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ?"
  ).get(input.session_id) as { cnt: number }).cnt;

  return NextResponse.json({
    success: true,
    phase_completed: phaseCompleted,
    next_phase: transition.next_phase,
    next_phase_trials: transition.next_phase_trials,
    completed_trials: allDone,
    total_trials: allTotal,
  });
}
