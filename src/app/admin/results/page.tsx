import { getDb } from "@/lib/db";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────

interface GroupStats {
  n: number;
  mean_rt_ms: number | null;
  timeout_rate: number | null;
  congruent_adv_rate: number | null;
  conflict_hv_rate: number | null;
  conflict_hl_rate: number | null;
  high_value_rate: number | null;
  high_liking_rate: number | null;
  tradeoff_index: number | null;
}

interface ParticipantRow {
  participant_code: string;
  session_id: string;
  group: string;
  completed_at: string | null;
  ri_mean: number | null;
  rc_mean: number | null;
  sna_mean: number | null;
  te_mean: number | null;
  sg_accuracy: number | null;
  sg_rt: number | null;
  sg_missed_rate: number | null;
  cal_within_cons: number | null;
  cal_anchor_cons: number | null;
  cal_timeout_rate: number | null;
  cal_mean_rt: number | null;
  val_comp_flag: number;
  suspicion_flag: number;
  fc_total: number;
  fc_timeout_rate: number | null;
  fc_mean_rt: number | null;
  congruent_adv_rate: number | null;
  conflict_hv_rate: number | null;
  conflict_hl_rate: number | null;
  high_value_rate: number | null;
  high_liking_rate: number | null;
  tradeoff_index: number | null;
}

// ─── Query helpers ─────────────────────────────────────────

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)}%`;
}

function ms(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v)}`;
}

// ─── Page ──────────────────────────────────────────────────

export default function ResultsPage() {
  const db = getDb();

  // Completion counts
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM experiment_sessions) AS total,
        (SELECT COUNT(*) FROM experiment_sessions WHERE status='completed') AS completed,
        (SELECT COUNT(*) FROM experiment_sessions WHERE status='in_progress') AS in_progress,
        (SELECT COUNT(*) FROM experiment_sessions WHERE status='excluded') AS excluded`,
    )
    .get() as { total: number; completed: number; in_progress: number; excluded: number };

  const hasData = counts.completed > 0;

  // Group-level stats
  function groupStats(group: string): GroupStats {
    const n = db
      .prepare("SELECT COUNT(*) AS cnt FROM experiment_sessions WHERE group_label=? AND status='completed'")
      .get(group) as { cnt: number };
    if (n.cnt === 0) return { n: 0, mean_rt_ms: null, timeout_rate: null, congruent_adv_rate: null, conflict_hv_rate: null, conflict_hl_rate: null, high_value_rate: null, high_liking_rate: null, tradeoff_index: null };

    const fc = db
      .prepare(
        `SELECT
          AVG(CASE WHEN cr.timeout=0 THEN cr.rt_ms END) AS mean_rt,
          AVG(cr.timeout*1.0)*100 AS timeout_rate,
          AVG(CASE WHEN cr.trial_type='congruent' AND cr.timeout=0 THEN cr.chose_congruent_advantage*1.0 END)*100 AS congru_rate,
          AVG(CASE WHEN cr.trial_type='conflict' AND cr.timeout=0 THEN cr.chose_high_value*1.0 END)*100 AS conflict_hv,
          AVG(CASE WHEN cr.trial_type='conflict' AND cr.timeout=0 THEN cr.chose_high_liking*1.0 END)*100 AS conflict_hl
        FROM choice_responses cr
        JOIN experiment_sessions s ON s.id=cr.session_id
        WHERE s.group_label=? AND s.status='completed'`,
      )
      .get(group) as {
      mean_rt: number | null; timeout_rate: number | null; congru_rate: number | null;
      conflict_hv: number | null; conflict_hl: number | null;
    };

    const hv = db
      .prepare(
        `SELECT AVG(CASE WHEN cr.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100 AS hv_rate
         FROM choice_responses cr JOIN experiment_sessions s ON s.id=cr.session_id
         WHERE s.group_label=? AND cr.chose_high_value IS NOT NULL AND cr.timeout=0`,
      )
      .get(group) as { hv_rate: number | null };
    const hl = db
      .prepare(
        `SELECT AVG(CASE WHEN cr.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100 AS hl_rate
         FROM choice_responses cr JOIN experiment_sessions s ON s.id=cr.session_id
         WHERE s.group_label=? AND cr.chose_high_liking IS NOT NULL AND cr.timeout=0`,
      )
      .get(group) as { hl_rate: number | null };

    return {
      n: n.cnt, mean_rt_ms: fc.mean_rt, timeout_rate: fc.timeout_rate,
      congruent_adv_rate: fc.congru_rate, conflict_hv_rate: fc.conflict_hv,
      conflict_hl_rate: fc.conflict_hl, high_value_rate: hv.hv_rate,
      high_liking_rate: hl.hl_rate,
      tradeoff_index: fc.conflict_hv != null && fc.conflict_hl != null
        ? fc.conflict_hv - fc.conflict_hl : null,
    };
  }

  const scarcity = groupStats("scarcity");
  const abundance = groupStats("abundance");

  // Per-participant rows
  const rows = db
    .prepare(
      `SELECT
        p.participant_code, s.id AS session_id, s.group_label AS "group", s.completed_at,
        mcs.resource_insufficiency_mean AS ri_mean,
        mcs.resource_confidence_mean AS rc_mean,
        mcs.stress_negative_affect_mean AS sna_mean,
        mcs.task_engagement_mean AS te_mean,
        (SELECT ROUND(AVG(CASE WHEN sg.accuracy=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM stage_game_responses sg WHERE sg.session_id=s.id) AS sg_accuracy,
        (SELECT ROUND(AVG(sg.rt_ms),0) FROM stage_game_responses sg WHERE sg.session_id=s.id) AS sg_rt,
        (SELECT ROUND(SUM(sg.missed_response)*100.0/MAX(1,COUNT(*)),1) FROM stage_game_responses sg WHERE sg.session_id=s.id) AS sg_missed_rate,
        cq.within_set_consistency AS cal_within_cons,
        cq.cross_set_anchor_consistency AS cal_anchor_cons,
        cq.timeout_rate AS cal_timeout_rate,
        cq.mean_rt_ms AS cal_mean_rt,
        COALESCE((SELECT CASE WHEN SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END)>0 THEN 0 ELSE 1 END FROM value_comprehension_checks WHERE session_id=s.id),0) AS val_comp_flag,
        COALESCE(pec.suspicion_flag,0) AS suspicion_flag,
        (SELECT COUNT(*) FROM choice_responses cr WHERE cr.session_id=s.id) AS fc_total,
        (SELECT ROUND(SUM(cr.timeout)*100.0/MAX(1,COUNT(*)),1) FROM choice_responses cr WHERE cr.session_id=s.id) AS fc_timeout_rate,
        (SELECT ROUND(AVG(cr.rt_ms),0) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.timeout=0) AS fc_mean_rt,
        (SELECT ROUND(AVG(CASE WHEN cr.chose_congruent_advantage=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.trial_type='congruent' AND cr.timeout=0) AS congruent_adv_rate,
        (SELECT ROUND(AVG(CASE WHEN cr.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.trial_type='conflict' AND cr.timeout=0) AS conflict_hv_rate,
        (SELECT ROUND(AVG(CASE WHEN cr.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.trial_type='conflict' AND cr.timeout=0) AS conflict_hl_rate,
        (SELECT ROUND(AVG(CASE WHEN cr.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.chose_high_value IS NOT NULL AND cr.timeout=0) AS high_value_rate,
        (SELECT ROUND(AVG(CASE WHEN cr.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100,1) FROM choice_responses cr WHERE cr.session_id=s.id AND cr.chose_high_liking IS NOT NULL AND cr.timeout=0) AS high_liking_rate,
        (SELECT ROUND((hv.conflict_hv - hl.conflict_hl),1) FROM
          (SELECT AVG(CASE WHEN cr2.chose_high_value=1 THEN 1.0 ELSE 0.0 END)*100 AS conflict_hv FROM choice_responses cr2 WHERE cr2.session_id=s.id AND cr2.trial_type='conflict' AND cr2.timeout=0) hv,
          (SELECT AVG(CASE WHEN cr2.chose_high_liking=1 THEN 1.0 ELSE 0.0 END)*100 AS conflict_hl FROM choice_responses cr2 WHERE cr2.session_id=s.id AND cr2.trial_type='conflict' AND cr2.timeout=0) hl
        ) AS tradeoff_index
      FROM experiment_sessions s
      JOIN participants p ON p.id = s.participant_id
      LEFT JOIN manipulation_check_summary mcs ON mcs.session_id = s.id
      LEFT JOIN calibration_quality cq ON cq.session_id = s.id
      LEFT JOIN post_experiment_checks pec ON pec.session_id = s.id
      WHERE s.status = 'completed'
      ORDER BY p.participant_code`,
    )
    .all() as ParticipantRow[];

  // ─── Render ──────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">
        Study 1 Behavioral Metrics
      </h1>

      {/* Export buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/api/admin/export?type=choice_responses"
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Export choice_responses.csv
        </a>
        <a
          href="/api/admin/export?type=participant_summary"
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Export participant_summary.csv
        </a>
        <a
          href="/api/admin/export?type=stimulus_value_map"
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Export stimulus_value_map.csv
        </a>
      </div>

      {/* Completion overview */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Total" value={counts.total} />
        <StatBox label="Completed" value={counts.completed} color="text-green-700" />
        <StatBox label="In Progress" value={counts.in_progress} color="text-blue-700" />
        <StatBox label="Excluded" value={counts.excluded} color="text-red-700" />
      </div>

      {/* Group-level summary */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Group-Level Summary</h2>
      {!hasData && <p className="mt-2 text-sm text-gray-400">No completed sessions yet.</p>}
      {hasData && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-medium text-gray-600">Group</th>
                <th className="py-2 pr-4 font-medium text-gray-600">n</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Mean RT (ms)</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Timeout %</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Congruent Adv %</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Conflict HV %</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Conflict HL %</th>
                <th className="py-2 pr-4 font-medium text-gray-600">HV Rate %</th>
                <th className="py-2 pr-4 font-medium text-gray-600">HL Rate %</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Tradeoff Idx</th>
              </tr>
            </thead>
            <tbody>
              {[scarcity, abundance].map((g, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium capitalize">
                    {i === 0 ? "scarcity" : "abundance"}
                  </td>
                  <td className="py-2 pr-4">{g.n}</td>
                  <td className="py-2 pr-4">{ms(g.mean_rt_ms)}</td>
                  <td className="py-2 pr-4">{pct(g.timeout_rate)}</td>
                  <td className="py-2 pr-4">{pct(g.congruent_adv_rate)}</td>
                  <td className="py-2 pr-4">{pct(g.conflict_hv_rate)}</td>
                  <td className="py-2 pr-4">{pct(g.conflict_hl_rate)}</td>
                  <td className="py-2 pr-4">{pct(g.high_value_rate)}</td>
                  <td className="py-2 pr-4">{pct(g.high_liking_rate)}</td>
                  <td className="py-2 pr-4">
                    {g.tradeoff_index != null ? g.tradeoff_index.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-participant table */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">
        Per-Participant Metrics
      </h2>
      {rows.length === 0 && (
        <p className="mt-2 text-sm text-gray-400">No completed participants yet.</p>
      )}
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1.5 pr-3 font-medium text-gray-600">Code</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">Grp</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">RI</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">RC</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">SG Acc</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">Cal W-in</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">Cal Anch</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">VC</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">Susp</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">FC Done</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">TO%</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">RT</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">C Adv%</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">C HV%</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">C HL%</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">TI</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const flags: string[] = [];
                if (r.suspicion_flag) flags.push("SUSP");
                if (r.val_comp_flag) flags.push("VAL");
                const toRate = numberOrNull(r.fc_timeout_rate);
                if (toRate !== null && toRate > 15) flags.push("TO");
                if (r.fc_total < 144 && r.fc_total > 0) flags.push("MISS");
                const ca = numberOrNull(r.congruent_adv_rate);
                if (ca !== null && ca < 50) flags.push("LOW-CA");
                const wc = numberOrNull(r.cal_within_cons);
                if (wc !== null && wc < 0.5) flags.push("CAL");

                return (
                  <tr key={r.participant_code} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1 pr-3 font-medium">{r.participant_code}</td>
                    <td className="py-1 pr-3 capitalize">{r.group}</td>
                    <td className="py-1 pr-3">{r.ri_mean?.toFixed(1) ?? "—"}</td>
                    <td className="py-1 pr-3">{r.rc_mean?.toFixed(1) ?? "—"}</td>
                    <td className="py-1 pr-3">{pct(r.sg_accuracy)}</td>
                    <td className="py-1 pr-3">{r.cal_within_cons != null ? (r.cal_within_cons * 100).toFixed(0) : "—"}</td>
                    <td className="py-1 pr-3">{r.cal_anchor_cons != null ? (r.cal_anchor_cons * 100).toFixed(0) : "—"}</td>
                    <td className="py-1 pr-3">{r.val_comp_flag ? "❌" : "✓"}</td>
                    <td className="py-1 pr-3">{r.suspicion_flag ? "⚠" : "—"}</td>
                    <td className="py-1 pr-3">{r.fc_total}</td>
                    <td className="py-1 pr-3">{pct(toRate)}</td>
                    <td className="py-1 pr-3">{ms(numberOrNull(r.fc_mean_rt))}</td>
                    <td className="py-1 pr-3">{pct(ca)}</td>
                    <td className="py-1 pr-3">{pct(numberOrNull(r.conflict_hv_rate))}</td>
                    <td className="py-1 pr-3">{pct(numberOrNull(r.conflict_hl_rate))}</td>
                    <td className="py-1 pr-3">{r.tradeoff_index != null ? r.tradeoff_index.toFixed(1) : "—"}</td>
                    <td className="py-1 pr-3">
                      {flags.map((f, i) => (
                        <span key={i} className="mr-1 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-medium text-gray-600">{f}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Model-based placeholders */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Model-Based Metrics</h2>
      <p className="mt-1 text-sm text-gray-400">
        These parameters require formal model fitting in R or Python after CSV export.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modelMetrics.map((m) => (
          <div key={m.name} className="rounded border border-gray-200 bg-gray-50 px-4 py-3 opacity-60">
            <div className="text-sm font-medium text-gray-500">{m.name}</div>
            <div className="mt-0.5 text-xs text-gray-400">{m.definition}</div>
            <div className="mt-1.5 inline-block rounded bg-gray-200 px-2 py-0.5 text-[10px] text-gray-500">
              Export required
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4 text-center">
      <div className={`text-2xl font-semibold ${color ?? "text-gray-900"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

const modelMetrics = [
  {
    name: "beta_L (liking weight)",
    definition:
      "SV = beta_L × Liking + beta_V × Value. Estimated from formal choice data via logistic/softmax modeling.",
  },
  {
    name: "beta_V (value weight)",
    definition:
      "SV = beta_L × Liking + beta_V × Value. Estimated from formal choice data via logistic/softmax modeling.",
  },
  {
    name: "beta_V / beta_L (relative weight)",
    definition: "Computed after beta_L and beta_V are fitted.",
  },
  {
    name: "Value compensation rate",
    definition: "External value difference compensating one unit of liking difference.",
  },
  {
    name: "Softmax tau",
    definition: "Choice consistency / decision noise parameter.",
  },
  {
    name: "RT by trial type",
    definition: "Required: formal choice RT + trial_type from choice_responses CSV.",
  },
];
