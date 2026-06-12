import crypto from "crypto";
import { getDb } from "@/lib/db";
import { PARTICIPANT_STAGE_TITLES, FEEDBACK_TEXT } from "@/lib/stages";
import type { Stage, Group } from "@/lib/stages";
import ExperimentControls from "@/components/ExperimentControls";
import StageGameTask from "@/components/StageGameTask";
import TaskSurvey from "@/components/TaskSurvey";
import PreferenceTask from "@/components/PreferenceTask";
import BaselinePracticeComponent from "@/components/BaselinePractice";
import ValidationTask from "@/components/ValidationTask";
import ValueAssignmentWithPractice from "@/components/ValueAssignmentWithPractice";
import FormalChoiceTask from "@/components/FormalChoiceTask";
import PostExperimentCheck from "@/components/PostExperimentCheck";
import { MC_ITEMS } from "@/lib/manipulation-check/items";
import { CalibrationOrchestrator } from "@/lib/study1/calibration-orchestrator";
import Link from "next/link";

interface ExperimentPageProps {
  searchParams: Promise<{ code?: string; session?: string }>;
}

interface SessionRow {
  id: string;
  participant_id: string;
  group_label: string;
  current_stage: string;
  status: string;
  participant_code: string;
}

export default async function ExperimentPage({
  searchParams,
}: ExperimentPageProps) {
  const { code, session } = await searchParams;

  if (!code || !session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-500">
          缺少被试编号或会话 ID。
        </p>
        <Link
          href="/start"
          className="mt-4 text-sm text-gray-900 underline"
        >
          前往被试入口
        </Link>
      </main>
    );
  }

  const db = getDb();

  const row = db
    .prepare(
      `SELECT s.id, s.participant_id, s.group_label, s.current_stage, s.status,
              p.participant_code
       FROM experiment_sessions s
       JOIN participants p ON p.id = s.participant_id
       WHERE s.id = ? AND p.participant_code = ?`,
    )
    .get(session, code) as SessionRow | undefined;

  if (!row) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-500">
          未找到该被试的会话记录。
        </p>
        <Link
          href="/start"
          className="mt-4 text-sm text-gray-900 underline"
        >
          前往被试入口
        </Link>
      </main>
    );
  }

  let stage = row.current_stage as Stage;
  const calibrationStages: Stage[] = ["study1_liking_ranking", "study1_liking_validation", "study1_value_assignment", "study1_formal_choice"];

  // Stage consistency guard: if past calibration but calibration incomplete, auto-reset.
  if (calibrationStages.includes(stage)) {
    const calTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;
    const calDone = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;
    const hasOrtho = (db.prepare("SELECT COUNT(*) AS cnt FROM cross_set_orthogonalized WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;

    if (stage !== "study1_liking_ranking" && hasOrtho === 0) {
      // Calibration was never completed — reset to liking_ranking.
      db.prepare("UPDATE experiment_sessions SET current_stage = ? WHERE id = ?").run("study1_liking_ranking", row.id);
      stage = "study1_liking_ranking";
    }
  }

  const completed = row.status === "completed" || stage === "complete";
  const title = PARTICIPANT_STAGE_TITLES[stage] ?? stage;

  // Stage-specific content — never exposes internal group or stage names.
  const stageContent = getStageContent(stage, row.group_label as Group);

  // Extra event data sent when advancing (stage-specific logging).
  const advanceEvent = getAdvanceEvent(stage, row.group_label as Group);

  // Stage 0 — Visual preference task practice (image pairs, F/J keys).
  if (stage === "baseline_questionnaire" && !completed) {
    const practiceImages = db
      .prepare(
        "SELECT image_url, stim_id FROM stimulus_pool WHERE usable = 1 ORDER BY visual_category LIMIT 4",
      )
      .all() as { image_url: string; stim_id: string }[];

    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <div className="mt-6">
            <BaselinePracticeComponent
              sessionId={row.id}
              participantCode={row.participant_code}
              practiceType="image_preference"
              practiceImages={practiceImages.map((img) => ({
                image_url: img.image_url,
                label: img.stim_id,
              }))}
            />
          </div>
        </div>
      </main>
    );
  }

  // Study 1 formal choice task.
  if (stage === "study1_formal_choice" && !completed) {
    // Ensure formal_trials are generated.
    let ftCount = 0;
    const ftExisting = db
      .prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id = ?")
      .get(row.id) as { cnt: number };
    ftCount = ftExisting.cnt;
    if (ftCount === 0) {
      const { generateFormalChoiceTrials } = await import(
        "@/lib/study1/formal-trial-generator"
      );
      generateFormalChoiceTrials(row.id, row.participant_id);
      ftCount = (db.prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;
    }

    const ftTrials = db
      .prepare(
        `SELECT id, trial_index, trial_type,
                left_stim_id, right_stim_id,
                left_image_url, right_image_url,
                left_liking_rank, right_liking_rank,
                left_external_value, right_external_value,
                delta_liking, delta_value
         FROM formal_trials WHERE session_id = ?
         ORDER BY trial_index`,
      )
      .all(row.id) as {
      id: string; trial_index: number; trial_type: string;
      left_stim_id: string; right_stim_id: string;
      left_image_url: string; right_image_url: string;
      left_liking_rank: number; right_liking_rank: number;
      left_external_value: number; right_external_value: number;
      delta_liking: number; delta_value: number;
    }[];

    const ftDone = db
      .prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id = ?")
      .get(row.id) as { cnt: number };

    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <p className="mt-2 text-center text-base leading-relaxed text-gray-700 max-w-3xl mx-auto">
            接下来你会看到两张抽象图形。每张图形旁边会显示一个价值点数。价值点数表示该图形在任务中的兑换价值（收益价值），不是价格，选择图形不会消耗你的资源点数。本任务共包含 176 个试次，请保持专注。
          </p>
          <p className="mt-2 text-center text-xl font-bold leading-relaxed text-gray-900 max-w-3xl mx-auto">
            ⚠ 请综合你对图形的喜爱程度和图形旁边显示的价值点数，选择你更愿意获得的一个。请认真作答，保持一致的判断标准。
          </p>
          <div className="mt-6">
            <FormalChoiceTask
              sessionId={row.id}
              participantCode={row.participant_code}
              participantId={row.participant_id}
              allTrials={ftTrials}
              completedCount={ftDone.cnt}
            />
          </div>
        </div>
      </main>
    );
  }

  // Post-experiment check.
  if (stage === "post_experiment_check" && !completed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-gray-500">
            请根据你在整个实验过程中的真实感受回答以下问题。答案没有对错之分，你的回答仅用于研究质量控制，不会影响你的实验结果。
          </p>
          <div className="mt-6">
            <PostExperimentCheck
              sessionId={row.id}
              participantCode={row.participant_code}
            />
          </div>
        </div>
      </main>
    );
  }

  // Study 1 value assignment + comprehension check.
  if (stage === "study1_value_assignment" && !completed) {
    // Quality gate: check prerequisites before allowing value assignment.
    const gateReasons: string[] = [];
    const lmCount = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_map WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;
    if (lmCount !== 25) gateReasons.push("incomplete_liking_map");

    // V2: cross-set orthogonalization may create gaps/duplicates per set.
    // Only check that every set still has 5 stimuli — rank distributions may vary.

    const vq = db.prepare("SELECT validation_passed, needs_rerank FROM liking_validation_quality WHERE session_id = ?").get(row.id) as { validation_passed: number; needs_rerank: number } | undefined;
    if (!vq) gateReasons.push("validation_failed");
    else if (!vq.validation_passed || vq.needs_rerank) {
      gateReasons.push(vq.validation_passed ? "needs_rerank" : "validation_failed");
    }

    // Timeout rate checks
    const calTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;
    const calTimeouts = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ? AND timeout = 1").get(row.id) as { cnt: number }).cnt;
    const calToRate = calTotal > 0 ? calTimeouts / calTotal : 0;
    if (calToRate > 0.20) gateReasons.push("high_calibration_timeout_rate");

    const valTotal = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_trials WHERE session_id = ?").get(row.id) as { cnt: number }).cnt;
    const valTimeouts = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id = ? AND timeout = 1").get(row.id) as { cnt: number }).cnt;
    const valToRate = valTotal > 0 ? valTimeouts / valTotal : 0;
    if (valToRate > 0.20) gateReasons.push("high_validation_timeout_rate");

    if (gateReasons.length > 0) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-lg text-center space-y-4">
            <h1 className="text-xl font-semibold text-gray-900">本部分还需要实验员确认</h1>
            <p className="text-sm text-gray-500">请联系实验员。</p>
            {/* Invisible to participant: admin audit shows reasons */}
          </div>
        </main>
      );
    }

    // Ensure value assignment is initialized on first load.
    const vaExisting = db
      .prepare("SELECT COUNT(*) AS cnt FROM value_assignment WHERE session_id = ?")
      .get(row.id) as { cnt: number };
    if (vaExisting.cnt === 0) {
      const { assignExternalValues, buildStimulusValueMap } = await import(
        "@/lib/study1/value-assignment"
      );
      const { patternIndex, assignments } = assignExternalValues(row.id);
      const vaInsert = db.prepare(`
        INSERT INTO value_assignment
          (id, session_id, participant_id, set_id, external_value, assignment_pattern_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      db.transaction(() => {
        for (const a of assignments) {
          vaInsert.run(
            crypto.randomUUID(), row.id, row.participant_id,
            a.set_id, a.external_value, patternIndex, now, now,
          );
        }
      })();
      buildStimulusValueMap(row.id, row.participant_id);
    }

    const svm = db
      .prepare(
        `SELECT set_id, stim_id, final_liking_rank, external_value
         FROM stimulus_value_map WHERE session_id = ?
         ORDER BY set_id, final_liking_rank`,
      )
      .all(row.id) as {
      set_id: string; stim_id: string; final_liking_rank: number; external_value: number;
    }[];

    // Load practice images for formal choice practice.
    const fcPracticeImages = db
      .prepare(
        "SELECT image_url, stim_id FROM stimulus_pool WHERE usable = 1 ORDER BY visual_category LIMIT 4",
      )
      .all() as { image_url: string; stim_id: string }[];

    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <div className="mt-6">
            <ValueAssignmentWithPractice
              sessionId={row.id}
              participantCode={row.participant_code}
              valueMap={svm}
              practiceImages={fcPracticeImages.map((img) => ({
                image_url: img.image_url,
                label: img.stim_id,
              }))}
            />
          </div>
        </div>
      </main>
    );
  }

  // Study 1 pairwise liking calibration — inferred ranks from forced-choice pairs.
  if (stage === "study1_liking_ranking" && !completed) {
    // Ensure calibration phases are generated server-side before querying.
    ensureCalibrationPhases(row.id, row.participant_id);

    const calTrials = db
      .prepare(
        `SELECT id, phase, trial_index,
                left_stim_id, right_stim_id,
                left_set_id, right_set_id,
                left_preliminary_rank, right_preliminary_rank,
                expected_choice, left_image_url, right_image_url
         FROM calibration_trials
         WHERE session_id = ?
         ORDER BY trial_index`,
      )
      .all(row.id) as {
      id: string; phase: string; trial_index: number;
      left_stim_id: string; right_stim_id: string;
      left_set_id: string; right_set_id: string;
      left_preliminary_rank: number | null; right_preliminary_rank: number | null;
      expected_choice: string | null; left_image_url: string; right_image_url: string;
    }[];

    const calCompleted = db
      .prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ?")
      .get(row.id) as { cnt: number };

    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <p className="mt-2 text-center text-base leading-relaxed text-gray-700 max-w-3xl mx-auto">
            你将看到一系列由两个抽象图形组成的选择题。请根据你的主观喜爱程度，选择你更喜欢的图形。
          </p>
          <p className="mt-1 text-center text-sm leading-relaxed text-gray-500 max-w-3xl mx-auto">
            本任务没有客观正确答案，但请认真作答，并尽量保持一致的判断标准。后续任务会根据你的选择来匹配图形，如果前后选择差异过大，系统可能需要你重新完成一轮简短确认。请按照第一感觉选择，不需要过度思考，也不需要刻意记住每一道题。
          </p>
          <div className="mt-6">
            <PreferenceTask
              sessionId={row.id}
              participantCode={row.participant_code}
              participantId={row.participant_id}
              allTrials={calTrials}
              completedCount={calCompleted.cnt}
            />
          </div>
        </div>
      </main>
    );
  }

  // Study 1 liking validation — pairwise comparisons against existing ranks.
  if (stage === "study1_liking_validation" && !completed) {
    const valTrials = db
      .prepare("SELECT * FROM liking_validation_trials WHERE session_id = ? ORDER BY trial_index")
      .all(row.id) as {
      id: string; validation_type: string; trial_index: number;
      left_stim_id: string; right_stim_id: string; left_image_url: string; right_image_url: string;
      left_set_id: string; right_set_id: string; left_liking_rank: number; right_liking_rank: number;
      expected_choice: string | null;
    }[];

    const valDone = db
      .prepare("SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id = ?")
      .get(row.id) as { cnt: number };

    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">{title}</h1>
          <p className="mt-2 text-center text-lg text-gray-700">
            请根据你的主观喜爱程度，选择你更喜欢的图形。
          </p>
          <div className="mt-6">
            <ValidationTask
              sessionId={row.id}
              participantCode={row.participant_code}
              participantId={row.participant_id}
              allTrials={valTrials}
              completedCount={valDone.cnt}
            />
          </div>
        </div>
      </main>
    );
  }

  // The manipulation check renders its own form.
  if (stage === "manipulation_check" && !completed) {
    // Only pass item text + id to the client — never expose construct names.
    const participantItems = MC_ITEMS.map((it) => ({
      item_id: it.item_id,
      item_text: it.item_text,
    }));
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-gray-600">
            请根据你在上一项任务中的真实感受回答以下问题。答案没有对错之分，请按照第一直觉作答。
          </p>
          <div className="mt-6">
            <TaskSurvey
              sessionId={row.id}
              participantCode={row.participant_code}
              items={participantItems}
            />
          </div>
        </div>
      </main>
    );
  }

  // Stage 4 — Resource task practice (dot comparison + shape matching).
  if (stage === "resource_task_practice" && !completed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-5xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <div className="mt-6">
            <BaselinePracticeComponent
              sessionId={row.id}
              participantCode={row.participant_code}
              practiceType="resource_task"
            />
          </div>
        </div>
      </main>
    );
  }

  // The stage-game is a self-contained client component.
  if (stage === "scarcity_manipulation" && !completed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-6xl">
          <h1 className="text-3xl font-bold text-gray-900 text-center">
            {title}
          </h1>
          <div className="mt-8">
            <StageGameTask
              sessionId={row.id}
              participantCode={row.participant_code}
              participantId={row.participant_id}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 text-center">
          {title}
        </h1>

        {stageContent && (
          <div className="mt-8 space-y-6 text-xl leading-relaxed text-gray-800">
            {stageContent}
          </div>
        )}

        {!stageContent && !completed && (
          <p className="mt-6 text-center text-lg text-gray-400">
            正在加载下一阶段…
          </p>
        )}

        <div className="mt-10">
          <ExperimentControls
            sessionId={row.id}
            participantCode={row.participant_code}
            completed={completed}
            advanceEvent={advanceEvent}
          />
        </div>
      </div>

      {/*
        TODO: Insert real experiment stage UIs here.
        Each stage should:
        - Get content from getStageContent() above
        - Be rendered with neutral wording (no internal labels)
        - Call POST /api/sessions/advance via ExperimentControls
        - All participant actions logged via advance API's event_type
      */}
    </main>
  );
}

/** Return stage-specific content. Never exposes internal labels to participants. */
function getStageContent(stage: Stage, group: Group) {
  switch (stage) {
    case "relative_resource_feedback":
      return (
        <>
          <p>{FEEDBACK_TEXT[group]}</p>
        </>
      );

    default:
      return null;
  }
}

/**
 * Ensure calibration phases are generated for the session.
 * Called server-side on every page load for the study1_liking_ranking stage.
 * Uses CalibrationOrchestrator — the single source of truth for phase progression.
 */
function ensureCalibrationPhases(sessionId: string, participantId: string) {
  const orchestrator = new CalibrationOrchestrator(sessionId, participantId);
  orchestrator.ensurePhases();
}

/** Return the stage-specific event type to log when the participant advances.
 *  The advance API adds the session group server-side — never pass group info
 *  from the client (it would leak into the HTML RSC payload). */
function getAdvanceEvent(
  stage: Stage,
  _group: Group,
): { event_type: string; event_data?: Record<string, unknown> } | null {
  switch (stage) {
    case "relative_resource_feedback":
      return {
        event_type: "relative_resource_feedback_completed",
        // feedback_version is added server-side by the advance API.
      };

    // TODO: add stage-specific events for other stages.

    default:
      return null;
  }
}

