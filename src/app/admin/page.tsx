import { getDb } from "@/lib/db";
import StatCard from "@/components/StatCard";

interface McGroupRow {
  group_label: string;
  ri_mean: number | null;
  rc_mean: number | null;
  sna_mean: number | null;
  te_mean: number | null;
  n: number;
}

export default function AdminDashboard() {
  const db = getDb();

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM participants) AS total,
         (SELECT COUNT(*) FROM experiment_sessions WHERE status = 'in_progress') AS in_progress,
         (SELECT COUNT(*) FROM experiment_sessions WHERE status = 'completed') AS completed,
         (SELECT COUNT(*) FROM experiment_sessions WHERE status = 'excluded') AS excluded`,
    )
    .get() as {
    total: number;
    in_progress: number;
    completed: number;
    excluded: number;
  };

  const groups = db
    .prepare(
      `SELECT group_label, COUNT(*) as cnt
       FROM experiment_sessions
       GROUP BY group_label`,
    )
    .all() as { group_label: string; cnt: number }[];

  const scarcity =
    groups.find((r) => r.group_label === "scarcity")?.cnt ?? 0;
  const abundance =
    groups.find((r) => r.group_label === "abundance")?.cnt ?? 0;

  // Group-level manipulation check summary.
  const mcRows = db
    .prepare(
      `SELECT s.group_label,
              AVG(mcs.resource_insufficiency_mean) AS ri_mean,
              AVG(mcs.resource_confidence_mean) AS rc_mean,
              AVG(mcs.stress_negative_affect_mean) AS sna_mean,
              AVG(mcs.task_engagement_mean) AS te_mean,
              COUNT(*) AS n
       FROM manipulation_check_summary mcs
       JOIN experiment_sessions s ON s.id = mcs.session_id
       GROUP BY s.group_label
       ORDER BY s.group_label`,
    )
    .all() as McGroupRow[];

  const hasMc = mcRows.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Overview of the study progress.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Participants" value={counts.total} />
        <StatCard title="In Progress" value={counts.in_progress} />
        <StatCard title="Completed" value={counts.completed} />
        <StatCard title="Excluded" value={counts.excluded} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-6">
          <div className="text-sm text-gray-500">Scarcity Group</div>
          <div className="text-2xl font-semibold text-gray-900">
            {scarcity}
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-6">
          <div className="text-sm text-gray-500">Abundance Group</div>
          <div className="text-2xl font-semibold text-gray-900">
            {abundance}
          </div>
        </div>
      </div>

      {/* Manipulation Check Group-Level Summary */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Manipulation Check Summary
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Group-level construct means from completed manipulation check
          responses.
        </p>

        {!hasMc && (
          <p className="mt-3 text-sm text-gray-400">
            No manipulation check data yet.
          </p>
        )}

        {hasMc && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium text-gray-600">
                    Group
                  </th>
                  <th className="py-2 pr-4 font-medium text-gray-600">n</th>
                  <th className="py-2 pr-4 font-medium text-gray-600">
                    Resource Insufficiency
                  </th>
                  <th className="py-2 pr-4 font-medium text-gray-600">
                    Resource Confidence
                  </th>
                  <th className="py-2 pr-4 font-medium text-gray-600">
                    Stress / Negative Affect
                  </th>
                  <th className="py-2 pr-4 font-medium text-gray-600">
                    Task Engagement
                  </th>
                </tr>
              </thead>
              <tbody>
                {mcRows.map((r) => (
                  <tr key={r.group_label} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium capitalize">
                      {r.group_label}
                    </td>
                    <td className="py-2 pr-4">{r.n}</td>
                    <td className="py-2 pr-4">
                      {r.ri_mean?.toFixed(2) ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {r.rc_mean?.toFixed(2) ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {r.sna_mean?.toFixed(2) ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {r.te_mean?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
