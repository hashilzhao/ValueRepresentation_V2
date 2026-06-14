/** Ordered experiment stages. Each is a stable machine-readable slug. */

export const STAGES = [
  "baseline_questionnaire",       // 0. 视觉偏好任务操作说明与练习
  "study1_liking_ranking",        // 1. 视觉偏好任务
  "study1_liking_validation",     // 2. 视觉偏好确认
  "relative_resource_feedback",   // 3. 任务信息
  "resource_task_practice",       // 4. 资源账户任务操作说明与练习
  "scarcity_manipulation",        // 5. 资源账户任务
  "manipulation_check",           // 6. 任务体验问卷
  "study1_value_assignment",      // 7. 价值说明与图像选择练习
  "study1_formal_choice",         // 8. 图像选择任务
  "post_experiment_check",        // 9. 实验后问题
  "complete",                     // 10. 实验完成
] as const;

export type Stage = (typeof STAGES)[number];

/** Technical labels — shown in admin dashboard only. */
export const STAGE_LABELS: Record<Stage, string> = {
  baseline_questionnaire: "Baseline (Image Preference Practice)",
  relative_resource_feedback: "Relative Resource Feedback",
  resource_task_practice: "Resource Task Practice",
  scarcity_manipulation: "Scarcity Manipulation",
  study1_liking_ranking: "Liking Ranking",
  study1_liking_validation: "Liking Validation",
  study1_value_assignment: "Value Assignment + Practice",
  study1_formal_choice: "Formal Choice",
  manipulation_check: "Manipulation Check",
  post_experiment_check: "Post-Experiment Check",
  complete: "Complete",
};

/** Neutral labels — shown to participants. Never expose internal stage or group names. */
export const PARTICIPANT_STAGE_TITLES: Record<Stage, string> = {
  baseline_questionnaire: "任务操作说明",
  relative_resource_feedback: "任务信息",
  resource_task_practice: "任务操作说明",
  scarcity_manipulation: "资源账户任务",
  manipulation_check: "任务体验问卷",
  study1_liking_ranking: "视觉偏好任务",
  study1_liking_validation: "视觉偏好确认",
  study1_value_assignment: "任务操作说明",
  study1_formal_choice: "图像选择任务",
  post_experiment_check: "实验后问题",
  complete: "实验完成",
};

/** Return the stage that follows the given one, or null if at the end. */
export function nextStage(current: Stage): Stage | null {
  const idx = STAGES.indexOf(current);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

/** Return the index of a stage (0-based). */
export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export type Group = "scarcity" | "abundance";

// Feedback text shown to participants during relative_resource_feedback.
// Internal group name is never displayed to the participant.
export const FEEDBACK_TEXT: Record<Group, string> = {
  scarcity:
    "上一阶段已完成。接下来，你将先完成资源账户任务的练习，然后进入正式任务。\n\n系统已为你生成本轮任务的初始资源账户：10 点。\n\n本任务设有进入后续环节的账户要求：账户余额需要达到 10 点。若任务未达成，将受到惩罚，扣除一定额度的被试费。\n\n在接下来的任务中，你可能获得或失去资源点数。请你留意当前账户余额，并尽量保持账户点数达到后续任务要求。\n\n当前资源点数会进入你的实验账户，并可能影响最终奖励。",
  abundance:
    "上一阶段已完成。接下来，你将先完成资源账户任务的练习，然后进入正式任务。\n\n系统已为你生成本轮任务的初始资源账户：100 点。\n\n本任务设有进入后续环节的账户要求：账户余额需要达到 10 点。若任务未达成，将受到惩罚，扣除一定额度的被试费。\n\n在接下来的任务中，你可能获得或失去资源点数。你当前拥有较充足的账户空间，但仍需要认真完成任务并留意账户变化。\n\n当前资源点数会进入你的实验账户，并可能影响最终奖励。",
};
