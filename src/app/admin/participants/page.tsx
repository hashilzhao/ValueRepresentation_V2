import { getDb } from "@/lib/db";
import { STAGE_LABELS } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import DeleteButton from "@/components/DeleteButton";

interface ParticipantRow {
  participant_code: string;
  name: string;
  birth_date: string;
  gender: string;
  grade: string;
  major: string;
  contact: string;
  status: string;
  group_label: string;
  current_stage: string;
  session_status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export default function ParticipantsPage() {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT p.participant_code, p.name, p.birth_date, p.gender, p.grade, p.major, p.contact, p.status,
              s.group_label, s.current_stage, s.status AS session_status,
              s.started_at, s.completed_at, p.created_at
       FROM participants p
       LEFT JOIN experiment_sessions s ON s.participant_id = p.id
       ORDER BY p.created_at DESC`,
    )
    .all() as ParticipantRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Participants</h1>
      <p className="mt-1 text-sm text-gray-500">
        {rows.length} participant{rows.length !== 1 ? "s" : ""} registered.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-2 font-medium text-gray-600">Code</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Name</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Birth</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Gender</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Grade</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Major</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Contact</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Group</th>
              <th className="py-2 pr-2 font-medium text-gray-600">Stage</th>
              <th className="py-2 pr-4 font-medium text-gray-600">
                Session Status
              </th>
              <th className="py-2 pr-4 font-medium text-gray-600">Started</th>
              <th className="py-2 pr-4 font-medium text-gray-600">
                Completed
              </th>
              <th className="py-2 pr-4 font-medium text-gray-600" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-gray-400">
                  No participants yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const stage = row.current_stage as Stage;
                return (
                  <tr key={row.participant_code} className="border-b border-gray-100">
                    <td className="py-2 pr-2 font-medium">{row.participant_code}</td>
                    <td className="py-2 pr-2 text-xs">{row.name}</td>
                    <td className="py-2 pr-2 text-xs">{row.birth_date}</td>
                    <td className="py-2 pr-2 text-xs">{row.gender === "male" ? "男" : row.gender === "female" ? "女" : row.gender}</td>
                    <td className="py-2 pr-2 text-xs">{row.grade || "—"}</td>
                    <td className="py-2 pr-2 text-xs">{row.major || "—"}</td>
                    <td className="py-2 pr-2 text-xs">{row.contact || "—"}</td>
                    <td className="py-2 pr-2 capitalize text-xs">{row.group_label ?? "—"}</td>
                    <td className="py-2 pr-2 text-xs">
                      {stage ? (STAGE_LABELS[stage] ?? stage) : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          row.session_status === "completed"
                            ? "text-green-700"
                            : row.session_status === "in_progress"
                              ? "text-blue-700"
                              : row.session_status === "excluded"
                                ? "text-red-700"
                                : "text-gray-400"
                        }
                      >
                        {row.session_status ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">
                      {row.started_at
                        ? new Date(row.started_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">
                      {row.completed_at
                        ? new Date(row.completed_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <DeleteButton
                        endpoint="/api/admin/delete-participant"
                        body={{ participant_code: row.participant_code }}
                        confirmLabel={`participant ${row.participant_code}`}
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
