import { getDb } from "@/lib/db";
import { STAGE_LABELS } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import Link from "next/link";
import DeleteButton from "@/components/DeleteButton";

interface SessionRow {
  id: string;
  participant_code: string;
  group_label: string;
  current_stage: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  resource_balance: number;
  trial_total: number | null;
  trial_completed: number | null;
  accuracy: number | null;
  mean_rt_ms: number | null;
  missed_count: number | null;
  ri_mean: number | null;
  rc_mean: number | null;
  sna_mean: number | null;
  te_mean: number | null;
}

export default function SessionsPage() {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.id, p.participant_code, s.group_label, s.current_stage,
              s.status, s.started_at, s.completed_at, s.resource_balance,
              (SELECT COUNT(*) FROM stage_game_trials t WHERE t.session_id = s.id) AS trial_total,
              (SELECT COUNT(*) FROM stage_game_responses r WHERE r.session_id = s.id) AS trial_completed,
              (SELECT CASE WHEN COUNT(*) > 0
                THEN CAST(SUM(CASE WHEN r2.accuracy = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*)
                ELSE NULL END
               FROM stage_game_responses r2 WHERE r2.session_id = s.id) AS accuracy,
              (SELECT AVG(rt_ms) FROM stage_game_responses r3 WHERE r3.session_id = s.id) AS mean_rt_ms,
              (SELECT SUM(missed_response) FROM stage_game_responses r4 WHERE r4.session_id = s.id) AS missed_count,
              mcs.resource_insufficiency_mean AS ri_mean,
              mcs.resource_confidence_mean AS rc_mean,
              mcs.stress_negative_affect_mean AS sna_mean,
              mcs.task_engagement_mean AS te_mean
       FROM experiment_sessions s
       JOIN participants p ON p.id = s.participant_id
       LEFT JOIN manipulation_check_summary mcs ON mcs.session_id = s.id
       ORDER BY s.started_at DESC`,
    )
    .all() as SessionRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Sessions</h1>
      <p className="mt-1 text-sm text-gray-500">
        {rows.length} session{rows.length !== 1 ? "s" : ""} recorded.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 font-medium text-gray-600">Code</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Group</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Stage</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Status</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Progress</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Balance</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Acc.</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Mean RT</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Missed</th>
              <th className="py-2 pr-4 font-medium text-gray-600">MC</th>
              <th className="py-2 pr-4 font-medium text-gray-600">Started</th>
              <th className="py-2 pr-4 font-medium text-gray-600" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-gray-400">
                  No sessions yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const stage = row.current_stage as Stage;
                const hasGame =
                  row.trial_total !== null && row.trial_total > 0;
                const hasMc = row.ri_mean !== null;
                return (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">
                      <Link href={`/admin/study1/${row.id}`} className="hover:underline">{row.participant_code}</Link>
                    </td>
                    <td className="py-2 pr-4 capitalize">
                      {row.group_label}
                    </td>
                    <td className="py-2 pr-4">
                      {STAGE_LABELS[stage] ?? stage}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          row.status === "completed"
                            ? "text-green-700"
                            : row.status === "in_progress"
                              ? "text-blue-700"
                              : row.status === "excluded"
                                ? "text-red-700"
                                : "text-gray-400"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {hasGame
                        ? `${row.trial_completed} / ${row.trial_total}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {hasGame ? row.resource_balance : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {row.accuracy !== null
                        ? `${(row.accuracy * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {row.mean_rt_ms !== null
                        ? `${row.mean_rt_ms.toFixed(0)} ms`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {row.missed_count !== null ? row.missed_count : "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs leading-relaxed">
                      {hasMc ? (
                        <span className="text-gray-700">
                          <span title="Resource Insufficiency">
                            RI&thinsp;{row.ri_mean!.toFixed(2)}
                          </span>
                          {" "}
                          <span title="Resource Confidence">
                            RC&thinsp;{row.rc_mean!.toFixed(2)}
                          </span>
                          <br />
                          <span title="Stress / Negative Affect">
                            S&thinsp;{row.sna_mean!.toFixed(2)}
                          </span>
                          {" "}
                          <span title="Task Engagement">
                            TE&thinsp;{row.te_mean!.toFixed(2)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">
                      {new Date(row.started_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <DeleteButton
                        endpoint="/api/admin/delete-session"
                        body={{ session_id: row.id }}
                        confirmLabel={`session for ${row.participant_code}`}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
