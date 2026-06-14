import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  const db = getDb();

  switch (type) {
    case "choice_responses":
      return exportCSV(db, "study1_choice_responses.csv", choiceResponsesSQL());
    case "participant_summary":
      return exportCSV(db, "study1_participant_summary.csv", participantSummarySQL());
    case "stimulus_value_map":
    case "calibration_responses":
      return exportCSV(db, "study1_calibration_responses.csv", calibrationResponsesSQL());
    case "stimulus_elo":
      return exportCSV(db, "study1_stimulus_elo.csv", stimulusEloSQL());
    case "calibration_stability":
      return exportCSV(db, "study1_calibration_stability.csv", calibrationStabilitySQL());
      return exportCSV(db, "study1_stimulus_value_map.csv", stimulusValueMapSQL());
    case "data_dictionary":
      return dictionaryExport();
    default:
      return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
  }
}

function exportCSV(db: ReturnType<typeof getDb>, filename: string, sql: string) {
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  if (rows.length === 0) {
    return new NextResponse("No data.", { status: 200, headers: { "Content-Type": "text/csv" } });
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function choiceResponsesSQL() {
  return `SELECT p.participant_code, cr.session_id, s.group_label AS "group",
    cr.trial_index, cr.trial_type,
    cr.left_stim_id, cr.right_stim_id,
    cr.left_liking_rank, cr.right_liking_rank,
    cr.left_external_value, cr.right_external_value,
    cr.delta_liking AS delta_liking_right_minus_left,
    cr.delta_value AS delta_value_right_minus_left,
    cr.response_side,
    CASE WHEN cr.response_side = 'right' THEN 1 WHEN cr.response_side = 'left' THEN 0 ELSE NULL END AS choice_right,
    cr.chosen_stim_id,
    cr.chosen_liking_rank, cr.chosen_external_value,
    cr.chose_high_liking, cr.chose_high_value, cr.chose_congruent_advantage,
    cr.chose_high_liking_low_value, cr.chose_low_liking_high_value,
    cr.rt_ms, cr.timeout, cr.created_at,
    ft.item_pair_key,
    ft.repeated_pair_flag,
    ft.repeat_index,
    ft.original_pair_key
  FROM choice_responses cr
  JOIN experiment_sessions s ON s.id = cr.session_id
  JOIN participants p ON p.id = cr.participant_id
  LEFT JOIN formal_trials ft ON ft.id = cr.formal_trial_id
  ORDER BY p.participant_code, cr.trial_index`;
}

function participantSummarySQL() {
  return `SELECT
    p.participant_code, s.id AS session_id, s.group_label AS "group",
    p.age, p.gender, p.major, s.completed_at,
    (SELECT ROUND(AVG(CASE WHEN sg.accuracy=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM stage_game_responses sg WHERE sg.session_id=s.id) AS stage_game_accuracy_pct,
    (SELECT ROUND(AVG(sg.rt_ms),0) FROM stage_game_responses sg WHERE sg.session_id=s.id) AS stage_game_mean_rt_ms,
    (SELECT ROUND(SUM(sg.missed_response)*100.0/MAX(1,COUNT(*)),1) FROM stage_game_responses sg WHERE sg.session_id=s.id) AS stage_game_missed_rate_pct,
    mcs.resource_insufficiency_mean, mcs.resource_confidence_mean,
    mcs.stress_negative_affect_mean, mcs.task_engagement_mean,
    cq.within_set_consistency, cq.cross_set_anchor_consistency,
    cq.cross_set_near_rank_consistency, cq.cross_set_same_rank_bias_flag,
    cq.timeout_rate AS calibration_timeout_rate, cq.mean_rt_ms AS calibration_mean_rt_ms,
    cs.stability_grade,
    cs.cycle_consistency_rate, cs.test_retest_agreement,
    cs.cross_level_kendall_w, cs.elo_model_rmse,
    (SELECT COUNT(*) FROM calibration_trials ct2 WHERE ct2.session_id=s.id) AS calibration_total_trials,
    (SELECT COUNT(*) FROM calibration_responses cr3 WHERE cr3.session_id=s.id) AS calibration_total_responses,
    (SELECT ROUND(AVG(se.elo_score),0) FROM stimulus_elo se WHERE se.session_id=s.id) AS avg_elo_score,
    (SELECT ROUND(AVG(se.elo_volatility),0) FROM stimulus_elo se WHERE se.session_id=s.id) AS avg_elo_volatility,
    (SELECT SUM(se.comparisons_count) FROM stimulus_elo se WHERE se.session_id=s.id) AS total_elo_comparisons,
    (SELECT CASE WHEN SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END)>0 THEN 0 ELSE 1 END FROM value_comprehension_checks vcc WHERE vcc.session_id=s.id) AS value_comprehension_flag,
    pec.suspicion_flag,
    (SELECT ROUND(SUM(cr.timeout)*100.0/MAX(1,COUNT(*)),1) FROM choice_responses cr WHERE cr.session_id=s.id) AS formal_choice_timeout_rate,
    (SELECT ROUND(AVG(cr.rt_ms),0) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.timeout=0) AS formal_choice_mean_rt_ms,
    (SELECT ROUND(AVG(CASE WHEN cr.chose_congruent_advantage=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.trial_type='congruent' AND cr.timeout=0) AS congruent_adv_choice_rate,
    (SELECT ROUND(AVG(CASE WHEN cr.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.trial_type='conflict' AND cr.timeout=0) AS conflict_high_value_choice_rate,
    (SELECT ROUND(AVG(CASE WHEN cr.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.trial_type='conflict' AND cr.timeout=0) AS conflict_high_liking_choice_rate,
    (SELECT ROUND(AVG(CASE WHEN cr.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.chose_high_value IS NOT NULL AND cr.timeout=0) AS high_value_choice_rate,
    (SELECT ROUND(AVG(CASE WHEN cr.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.chose_high_liking IS NOT NULL AND cr.timeout=0) AS high_liking_choice_rate,
    (SELECT ROUND((hv.conflict_hv - hl.conflict_hl),1) FROM
      (SELECT AVG(CASE WHEN cr2.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100 AS conflict_hv FROM choice_responses cr2 WHERE cr2.session_id=s.id AND cr2.trial_type='conflict' AND cr2.timeout=0) hv,
      (SELECT AVG(CASE WHEN cr2.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100 AS conflict_hl FROM choice_responses cr2 WHERE cr2.session_id=s.id AND cr2.trial_type='conflict' AND cr2.timeout=0) hl
    ) AS tradeoff_index
  FROM experiment_sessions s
  JOIN participants p ON p.id = s.participant_id
  LEFT JOIN manipulation_check_summary mcs ON mcs.session_id = s.id
  LEFT JOIN calibration_quality cq ON cq.session_id = s.id
      LEFT JOIN calibration_stability cs ON cs.session_id = s.id
  LEFT JOIN post_experiment_checks pec ON pec.session_id = s.id
  WHERE s.status = 'completed'
  ORDER BY p.participant_code`;
}

function dictionaryExport() {
  const dict = [
    "field,type,description",
    "participant_code,TEXT,Participant identifier (self-entered)",
    "session_id,UUID,Unique session identifier",
    "group,TEXT,Internal group assignment (scarcity or abundance) — ADMIN ONLY",
    "trial_index,INTEGER,0-based trial order within the session",
    "trial_type,TEXT,liking_only | value_only | congruent | conflict",
    "left_stim_id,TEXT,Stimulus identifier on the left",
    "right_stim_id,TEXT,Stimulus identifier on the right",
    "left_liking_rank,INTEGER,Final liking rank of left stimulus (1-5 within set)",
    "right_liking_rank,INTEGER,Final liking rank of right stimulus (1-5 within set)",
    "left_external_value,INTEGER,External value of left stimulus (5|10|15|20|25)",
    "right_external_value,INTEGER,External value of right stimulus (5|10|15|20|25)",
    "delta_liking_right_minus_left,INTEGER,Right minus left liking rank difference",
    "delta_value_right_minus_left,INTEGER,Right minus left external value difference",
    "response_side,TEXT,left | right | null (timeout)",
    "choice_right,INTEGER,1=chose right 0=chose left NULL=timeout",
    "chosen_stim_id,TEXT,Stimulus identifier the participant chose",
    "chosen_liking_rank,INTEGER,Liking rank of the chosen stimulus",
    "chosen_external_value,INTEGER,External value of the chosen stimulus",
    "chose_high_liking,INTEGER,1=chose higher liking 0=chose lower liking NULL=N/A",
    "chose_high_value,INTEGER,1=chose higher value 0=chose lower value NULL=N/A",
    "chose_congruent_advantage,INTEGER,1=chose dominant option in congruent trial NULL=not congruent",
    "rt_ms,REAL,Reaction time in milliseconds from screen onset to first valid F/J keypress",
    "timeout,INTEGER,1=no response within time limit",
    "created_at,TEXT,ISO 8601 timestamp of response",
    "item_pair_key,TEXT,Normalized pair identifier (stim IDs sorted alphabetically, joined by |). Repeated across rows = same pair re-appeared.",
    "repeated_pair_flag,INTEGER,1=this trial re-uses a pair that already appeared earlier in the session",
    "repeat_index,INTEGER,1-based index indicating which occurrence of this pair this trial is (1=first repeat 2=second repeat etc.). NULL if not a repeat.",
    "original_pair_key,TEXT,The item_pair_key value of the first occurrence of this repeated pair. NULL if not a repeat.",
    "",
    "# Study 1 formal choice data dictionary",
    "# Model: ChoiceRight ~ Group x DeltaLiking + Group x DeltaValue + TrialType",
    "# Group is only in admin/export, never shown to participants",
  ].join("\n");
  return new NextResponse(dict, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="study1_data_dictionary.csv"' },
  });
}

function stimulusValueMapSQL() {
  return `SELECT p.participant_code, svm.session_id, s.group_label AS "group",
    svm.set_id, svm.stim_id,
    svm.final_liking_rank, svm.external_value,
    svm.elo_score AS elo,
    se.elo_score AS elo_live, se.elo_volatility AS elo_sigma,
    se.comparisons_count AS elo_n,
    svm.image_url
  FROM stimulus_value_map svm
  JOIN experiment_sessions s ON s.id = svm.session_id
  JOIN participants p ON p.id = svm.participant_id
  LEFT JOIN stimulus_elo se ON se.session_id = svm.session_id AND se.stim_id = svm.stim_id
  ORDER BY p.participant_code, svm.set_id, svm.final_liking_rank`;
}

function calibrationResponsesSQL() {
  return `SELECT p.participant_code, cr.session_id, s.group_label AS "group",
    cr.trial_id, ct.phase, ct.trial_index,
    ct.left_stim_id, ct.right_stim_id,
    ct.left_set_id, ct.right_set_id,
    ct.left_preliminary_rank, ct.right_preliminary_rank,
    ct.expected_choice, ct.boundary_type,
    cr.response_side, cr.chosen_stim_id,
    cr.consistent, cr.rt_ms, cr.timeout, cr.response_method,
    cr.created_at
  FROM calibration_responses cr
  JOIN calibration_trials ct ON ct.id = cr.trial_id
  JOIN experiment_sessions s ON s.id = cr.session_id
  JOIN participants p ON p.id = cr.participant_id
  ORDER BY p.participant_code, s.id, ct.trial_index`;
}

function stimulusEloSQL() {
  return `SELECT p.participant_code, se.session_id, s.group_label AS "group",
    se.set_id, se.stim_id,
    se.elo_score, se.elo_volatility, se.comparisons_count,
    se.calibration_attempt_index,
    cso.original_liking_rank, cso.calibrated_liking_rank,
    cso.shift_direction, cso.shift_rate, cso.shift_confidence,
    wss.original_within_rank, wss.final_stable_rank,
    wss.adjacent_retest_result, wss.adjacent_consistency, wss.ambiguity_flag
  FROM stimulus_elo se
  JOIN experiment_sessions s ON s.id = se.session_id
  JOIN participants p ON p.id = se.participant_id
  LEFT JOIN cross_set_orthogonalized cso
    ON cso.session_id = se.session_id
    AND cso.stim_id = se.stim_id
    AND cso.calibration_attempt_index = se.calibration_attempt_index
  LEFT JOIN within_set_stable wss
    ON wss.session_id = se.session_id
    AND wss.stim_id = se.stim_id
    AND wss.calibration_attempt_index = se.calibration_attempt_index
  ORDER BY p.participant_code, se.set_id, se.elo_score DESC`;
}

function calibrationStabilitySQL() {
  return `SELECT p.participant_code, cs.session_id, s.group_label AS "group",
    cs.cycle_consistency_rate, cs.test_retest_agreement,
    cs.cross_level_kendall_w, cs.elo_model_rmse, cs.timeout_rate,
    cs.stability_grade, cs.low_confidence_sets,
    cs.adaptive_supplement_count, cs.calibration_attempt_index
  FROM calibration_stability cs
  JOIN experiment_sessions s ON s.id = cs.session_id
  JOIN participants p ON p.id = cs.participant_id
  ORDER BY p.participant_code, cs.calibration_attempt_index`;
}
