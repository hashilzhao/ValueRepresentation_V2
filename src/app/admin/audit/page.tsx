import { getDb } from "@/lib/db";
import Link from "next/link";

const DEV = process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true";

export default function AuditPage() {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.id, p.participant_code, s.group_label, s.current_stage, s.status
    FROM experiment_sessions s JOIN participants p ON p.id = s.participant_id
    ORDER BY s.started_at DESC
  `).all() as { id: string; participant_code: string; group_label: string; current_stage: string; status: string }[];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Session Integrity Audit</h1>
      <p className="mt-1 text-sm text-gray-500">{sessions.length} sessions found. Full mode: {DEV ? "❌ DEV_TEST_MODE" : "✅ FULL MODE"}</p>

      {sessions.length === 0 && <p className="mt-4 text-sm text-gray-400">No sessions to audit.</p>}

      {sessions.map((ses) => (
        <SessionAudit key={ses.id} sessionId={ses.id} code={ses.participant_code} group={ses.group_label} stage={ses.current_stage} status={ses.status} />
      ))}
    </div>
  );
}

function check(label: string, ok: boolean, detail?: string) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span>{ok ? "✅" : "❌"}</span>
      <span className="text-gray-600">{label}</span>
      {detail ? <span className="text-gray-400">({detail})</span> : null}
    </div>
  );
}

function SessionAudit({ sessionId, code, group, stage, status }: { sessionId: string; code: string; group: string; stage: string; status: string }) {
  const db = getDb();

  const sgTrials = (db.prepare("SELECT COUNT(*) AS cnt FROM stage_game_trials WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const sgExpected = DEV ? 12 : 90; // 72 dot_comparison + 18 shape_matching
  const selected = (db.prepare("SELECT COUNT(*) AS cnt FROM subject_selected_stimuli WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const setAssignment = (db.prepare("SELECT COUNT(*) AS cnt FROM subject_set_assignment WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;

  // Check each set has all 4 categories.
  let setCatOk = true;
  const setCatDetail: string[] = [];
  const sets = db.prepare("SELECT DISTINCT set_id FROM subject_set_assignment WHERE session_id=?").all(sessionId) as { set_id: string }[];
  for (const s of sets) {
    const cats = db.prepare("SELECT visual_category FROM subject_set_assignment WHERE session_id=? AND set_id=?", ).all(sessionId, s.set_id) as { visual_category: string }[];
    const catSet = new Set(cats.map((c) => c.visual_category));
    if (catSet.size < 4) { setCatOk = false; setCatDetail.push(`${s.set_id}:${catSet.size}/4`); }
  }

  const calTrials = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const calWithin = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id=? AND phase='within_set'").get(sessionId) as { cnt: number }).cnt;
  const calCross = calTrials - calWithin;
  const calResp = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const calExpected = DEV ? 16 : 80;
  const calWithinExpected = DEV ? 10 : 50;

  const likingMap = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_map WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  let ranksOk = true;
  let ranksDetail = "";
  if (likingMap === 25) {
    const setRanks = db.prepare("SELECT set_id, COUNT(*) AS cnt, MIN(final_liking_rank) AS rmin, MAX(final_liking_rank) AS rmax FROM liking_map WHERE session_id=? GROUP BY set_id").all(sessionId) as { set_id: string; cnt: number; rmin: number; rmax: number }[];
    for (const r of setRanks) {
      if (r.cnt !== 5 || r.rmin !== 1 || r.rmax !== 5) { ranksOk = false; ranksDetail += `${r.set_id}:${r.cnt}/${r.rmin}-${r.rmax} `; }
    }
  }

  const valTrials = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_trials WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const valResp = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const valQuality = db.prepare("SELECT validation_passed, needs_rerank, different_rank_consistency_rate FROM liking_validation_quality WHERE session_id=?").get(sessionId) as { validation_passed: number; needs_rerank: number; different_rank_consistency_rate: number | null } | undefined;

  const vaCount = (db.prepare("SELECT COUNT(*) AS cnt FROM value_assignment WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const vaValues = db.prepare("SELECT external_value FROM value_assignment WHERE session_id=? ORDER BY set_id").all(sessionId) as { external_value: number }[];
  const vaOk = vaCount === 5 && new Set(vaValues.map((v) => v.external_value)).size === 5;

  const svmCount = (db.prepare("SELECT COUNT(*) AS cnt FROM stimulus_value_map WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const ftCount = (db.prepare("SELECT COUNT(*) AS cnt FROM formal_trials WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;
  const ftExpected = DEV ? 20 : 162;
  const ftTypes = db.prepare("SELECT trial_type, COUNT(*) AS cnt FROM formal_trials WHERE session_id=? GROUP BY trial_type").all(sessionId) as { trial_type: string; cnt: number }[];
  const ftTypeOk = DEV ? ftCount > 0 : (ftTypes.find((t) => t.trial_type === "conflict")?.cnt === 66 && ftTypes.find((t) => t.trial_type === "congruent")?.cnt === 32);

  const crCount = (db.prepare("SELECT COUNT(*) AS cnt FROM choice_responses WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;

  // Rank direction sanity check: rank 5 should have more wins than rank 1.
  const rankWins = db.prepare("SELECT final_liking_rank, AVG(win_count_within_set) AS avg_wins FROM liking_map WHERE session_id=? GROUP BY final_liking_rank ORDER BY final_liking_rank").all(sessionId) as { final_liking_rank: number; avg_wins: number }[];
  const rank1Wins = rankWins.find((r) => r.final_liking_rank === 1)?.avg_wins ?? 0;
  const rank5Wins = rankWins.find((r) => r.final_liking_rank === 5)?.avg_wins ?? 0;
  const rankDirectionOk = rank5Wins >= rank1Wins;

  // Timeout rates
  const calTimeouts = (db.prepare("SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id=? AND timeout=1").get(sessionId) as { cnt: number }).cnt;
  const calToRate = calTrials > 0 ? calTimeouts / calTrials : null;
  const valTimeouts = (db.prepare("SELECT COUNT(*) AS cnt FROM liking_validation_responses WHERE session_id=? AND timeout=1").get(sessionId) as { cnt: number }).cnt;
  const valToRate = valTrials > 0 ? valTimeouts / valTrials : null;

  // Tie flags
  const tieCount = (db.prepare("SELECT SUM(tie_flag) AS cnt FROM liking_map WHERE session_id=?").get(sessionId) as { cnt: number }).cnt;

  // Gate status
  const gateReasons: string[] = [];
  if (likingMap !== 25) gateReasons.push("incomplete_liking_map");
  else if (!ranksOk) gateReasons.push("invalid_rank_distribution");
  if (!valQuality) gateReasons.push("validation_failed");
  else if (!valQuality.validation_passed) gateReasons.push("validation_failed");
  else if (valQuality.needs_rerank) gateReasons.push("needs_rerank");
  if (calToRate !== null && calToRate > 0.20) gateReasons.push("high_calibration_timeout_rate");
  if (valToRate !== null && valToRate > 0.20) gateReasons.push("high_validation_timeout_rate");
  const gateOk = gateReasons.length === 0;

  return (
    <div className="mt-4 rounded border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/admin/study1/${sessionId}`} className="font-semibold text-gray-900 hover:underline">{code}</Link>
        <span className="text-xs text-gray-500 capitalize">{group}</span>
        <span className="text-xs text-gray-400">{stage}</span>
        <span className={`text-xs ${status === "completed" ? "text-green-700" : "text-blue-700"}`}>{status}</span>
        {!rankDirectionOk && <span className="text-xs text-red-600">❌ RANK DIR REVERSED</span>}
        {tieCount > 0 && <span className="text-xs text-amber-600">⚠ {tieCount} ties</span>}
        {calToRate !== null && calToRate > 0.20 && <span className="text-xs text-amber-600">⚠ cal TO:{(calToRate*100).toFixed(0)}%</span>}
        {!rankDirectionOk && <span className="text-xs text-red-600">⚠ LEGACY: reversed-rank session — rerun from scratch</span>}
        {valQuality && valQuality.different_rank_consistency_rate !== null && (valQuality.different_rank_consistency_rate as number) < 0.10 && <span className="text-xs text-red-600">⚠ LEGACY: validation ~0% — likely reversed-rank</span>}
        {!gateOk && <span className="text-xs text-red-600">BLOCKED: {gateReasons.join(", ")}</span>}
        {gateOk && vaCount > 0 && <span className="text-xs text-green-700">✅ All gates passed</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
        {check("Stage-game trials", sgTrials === sgExpected, `${sgTrials}/${sgExpected}`)}
        {check("Selected stimuli", selected === 25, `${selected}/25`)}
        {check("Set assignment", setAssignment === 25 && sets.length === 5, `${setAssignment} in ${sets.length} sets`)}
        {check("Each set has A/B/C/D", setCatOk, setCatDetail.join(", ") || "1/1/1/2")}
        {check("Calibration trials", calTrials >= calExpected, `${calTrials} (w/in:${calWithin} cross:${calCross})`)}
        {check("Cal responses", calResp >= calWithin, `${calResp}/${calTrials} TO:${calToRate !== null ? (calToRate*100).toFixed(0)+"%" : "?"}`)}
        {check("Liking map", likingMap === 25, `${likingMap}/25 ties:${tieCount}`)}
        {check("Ranks 1-5 per set", ranksOk, ranksDetail || undefined)}
        {check("Validation trials", valTrials >= (DEV ? 4 : 30), `${valTrials} (resp:${valResp})`)}
        {check("Val quality", valQuality != null, valQuality ? `passed:${valQuality.validation_passed} rerank:${valQuality.needs_rerank} cons:${valQuality.different_rank_consistency_rate != null ? (valQuality.different_rank_consistency_rate*100).toFixed(0)+"%" : "?"}` : "missing")}
        {check("Rank direction (R5≥R1 wins)", rankDirectionOk, `R1 avg:${rank1Wins.toFixed(1)} R5 avg:${rank5Wins.toFixed(1)}`)}
        {check(`Val TO rate`, valToRate !== null && valToRate <= 0.20, valToRate !== null ? `${(valToRate*100).toFixed(0)}%` : "?")}
        {check("Value assignment", vaOk, vaValues.map((v) => v.external_value).join(","))}
        {check("Stimulus value map", svmCount === 25, `${svmCount}/25`)}
        {check("Formal trials", ftCount === ftExpected, `${ftCount}/${ftExpected}`)}
        {check("Formal types", ftTypeOk, ftTypes.map((t) => `${t.trial_type}:${t.cnt}`).join(" "))}
        {check("Choice responses", crCount >= 1, `${crCount}/${ftCount}`)}
      </div>
    </div>
  );
}
