import { getDb } from "@/lib/db";
import Link from "next/link";
import Image from "next/image";

interface Props {
  searchParams: Promise<{ session?: string }>;
}

export default async function Study1AssignmentPage({ searchParams }: Props) {
  const { session } = await searchParams;
  const db = getDb();

  // If no session specified, show list of sessions with assignments.
  if (!session) {
    const sessions = db
      .prepare(
        `SELECT s.id, p.participant_code, s.group_label,
                (SELECT COUNT(*) FROM subject_selected_stimuli WHERE session_id = s.id) AS stim_count
         FROM experiment_sessions s
         JOIN participants p ON p.id = s.participant_id
         WHERE EXISTS (SELECT 1 FROM subject_selected_stimuli WHERE session_id = s.id)
         ORDER BY s.started_at DESC`,
      )
      .all() as { id: string; participant_code: string; group_label: string; stim_count: number }[];

    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Study 1 Stimulus Assignments
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} with
          assignments.
        </p>
        {sessions.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">
            No Study 1 assignments yet.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/admin/study1?session=${s.id}`}
                className="block rounded border border-gray-200 px-4 py-2 hover:bg-gray-50"
              >
                <span className="font-medium">{s.participant_code}</span>
                <span className="ml-3 text-gray-500 capitalize">{s.group_label}</span>
                <span className="ml-3 text-gray-400">
                  {s.stim_count} stimuli selected
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Session detail view.
  const sesRow = db
    .prepare(
      `SELECT s.id, p.participant_code, s.group_label, s.random_seed
       FROM experiment_sessions s
       JOIN participants p ON p.id = s.participant_id
       WHERE s.id = ?`,
    )
    .get(session) as
    | { id: string; participant_code: string; group_label: string; random_seed: number | null }
    | undefined;

  if (!sesRow) {
    return <p className="text-sm text-gray-500">Session not found.</p>;
  }

  const selected = db
    .prepare(
      `SELECT * FROM subject_selected_stimuli
       WHERE session_id = ? ORDER BY selection_order`,
    )
    .all(session) as SelectedRow[];

  const sets = db
    .prepare(
      `SELECT * FROM subject_set_assignment
       WHERE session_id = ? ORDER BY set_id, position_in_set`,
    )
    .all(session) as SetRow[];

  const catDist: Record<string, number> = {};
  for (const s of selected) {
    catDist[s.visual_category] = (catDist[s.visual_category] ?? 0) + 1;
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href="/admin/study1"
          className="text-sm text-gray-400 hover:text-gray-900"
        >
          ← Assignments
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">
          {sesRow.participant_code}
        </h1>
        <span className="text-sm text-gray-500 capitalize">
          {sesRow.group_label}
        </span>
        <span className="text-sm text-gray-400">
          seed: {sesRow.random_seed}
        </span>
        {process.env.NEXT_PUBLIC_DEV_TEST_MODE === "true" && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            DEV_TEST_MODE — data not valid for Study 1 analysis
          </span>
        )}
      </div>

      {/* Balance summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["A", "B", "C", "D"].map((cat) => (
          <div key={cat} className="rounded border border-gray-200 bg-white px-3 py-2 text-center">
            <div className="text-xs text-gray-400">Category {cat}</div>
            <div className="text-lg font-semibold text-gray-900">
              {catDist[cat] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {/* Diagnostics */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
        {[
          ["Selected", "SELECT count(*) FROM subject_selected_stimuli WHERE session_id=?"],
          ["Cal trials", "SELECT count(*) FROM calibration_trials WHERE session_id=?"],
          ["Cal responses", "SELECT count(*) FROM calibration_responses WHERE session_id=?"],
          ["Liking map", "SELECT count(*) FROM liking_map WHERE session_id=?"],
          ["Value map", "SELECT count(*) FROM stimulus_value_map WHERE session_id=?"],
          ["Formal trials", "SELECT count(*) FROM formal_trials WHERE session_id=?"],
          ["Choice resp", "SELECT count(*) FROM choice_responses WHERE session_id=?"],
          ["Block checks", "SELECT count(*) FROM block_manipulation_checks WHERE session_id=?"],
        ].map(([label, sql]) => {
          const cnt = db.prepare(sql).get(session) as { cnt?: number; [k: string]: unknown };
          const val = Object.values(cnt as Record<string, unknown>)[0] ?? 0;
          return (
            <div key={label} className="rounded border border-gray-100 px-2 py-1">
              <span className="text-gray-400">{label}</span>{" "}
              <span className="font-medium text-gray-700">{String(val)}</span>
            </div>
          );
        })}
      </div>

      {/* Selected 25 */}
      <h2 className="mt-6 text-lg font-semibold text-gray-900">
        Selected Stimuli ({selected.length})
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {selected.map((s) => (
          <div
            key={s.stim_id}
            className="flex items-center gap-2 rounded border border-gray-100 bg-white px-2 py-1 text-xs"
          >
            <Image
              src={s.image_url}
              alt={s.stim_id}
              width={32}
              height={32}
              unoptimized
              className="rounded"
            />
            <span className="font-mono font-medium">{s.stim_id}</span>
            <span className="text-gray-400">{s.visual_category}</span>
          </div>
        ))}
      </div>

      {/* 5 Hidden Sets */}
      <h2 className="mt-6 text-lg font-semibold text-gray-900">
        Hidden Sets
      </h2>
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {["set_1", "set_2", "set_3", "set_4", "set_5"].map((setId) => {
          const setItems = sets.filter((s) => s.set_id === setId);
          const setCats: Record<string, number> = {};
          for (const s of setItems) {
            setCats[s.visual_category] = (setCats[s.visual_category] ?? 0) + 1;
          }
          return (
            <div
              key={setId}
              className="rounded border border-gray-200 bg-white p-3"
            >
              <div className="text-sm font-medium text-gray-900">
                {setId.replace("_", " ")}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {Object.entries(setCats)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" ")}
              </div>
              <div className="mt-2 space-y-1">
                {setItems.map((item, i) => (
                  <div
                    key={item.stim_id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="text-gray-300 w-4">{i + 1}.</span>
                    <Image
                      src={item.image_url}
                      alt={item.stim_id}
                      width={24}
                      height={24}
                      unoptimized
                      className="rounded"
                    />
                    <span className="font-mono font-medium">{item.stim_id}</span>
                    <span className="text-gray-400">{item.visual_category}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SelectedRow {
  stim_id: string;
  image_url: string;
  visual_category: string;
  complexity_level: string;
  regularity_level: string;
  semantic_risk: string;
  selection_order: number;
}

interface SetRow {
  set_id: string;
  stim_id: string;
  image_url: string;
  visual_category: string;
  complexity_level: string;
  regularity_level: string;
  semantic_risk: string;
  position_in_set: number;
}
