import { getDb } from "@/lib/db";
import StimulusGrid from "./StimulusGrid";

interface StimulusRow {
  id: string;
  stim_id: string;
  storage_path: string;
  image_url: string;
  visual_category: string;
  complexity_level: string;
  regularity_level: string;
  semantic_risk: string;
  usable: number;
  stimulus_version: number;
  current_version: number | null;
  retired_at: string | null;
  retired_reason: string | null;
  original_filename: string;
  width_px: number | null;
  height_px: number | null;
  file_size_bytes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type Filter = "active" | "retired" | "all";

export default async function AdminStimuliPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const activeFilter: Filter = filterParam === "retired" ? "retired" : filterParam === "all" ? "all" : "active";

  const db = getDb();
  const allRows = db
    .prepare(`SELECT * FROM stimulus_pool ORDER BY visual_category, stim_id`)
    .all() as StimulusRow[];

  const activeRows = allRows.filter((r) => r.usable === 1 && r.retired_at === null);
  const retiredRows = allRows.filter((r) => r.usable === 0 || r.retired_at !== null);

  let displayedRows: StimulusRow[];
  if (activeFilter === "retired") displayedRows = retiredRows;
  else if (activeFilter === "all") displayedRows = allRows;
  else displayedRows = activeRows;

  const byCategory: Record<string, StimulusRow[]> = {};
  for (const r of displayedRows) {
    (byCategory[r.visual_category] ??= []).push(r);
  }

  const tabClass = (f: Filter) =>
    `px-4 py-2 text-sm font-medium rounded-t transition ${
      activeFilter === f
        ? "bg-white text-gray-900 border border-b-white border-gray-200"
        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">
        Stimulus Management
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {allRows.length} stimuli in pool · {activeRows.length} 使用中 · {retiredRows.length} 已停用
      </p>

      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        After formal data collection begins, do not overwrite or delete
        existing stimulus files. To replace a stimulus, upload a new version
        (e.g. B17_v2.png). Old sessions keep their original image URLs.
        Uploaded files must use the _vN suffix for replacements.
      </div>

      {/* Filter tabs */}
      <div className="mt-6 flex gap-0 border-b border-gray-200">
        <a href="/admin/stimuli?filter=active" className={tabClass("active")}>
          使用中 · {activeRows.length}
        </a>
        <a href="/admin/stimuli?filter=retired" className={tabClass("retired")}>
          垃圾桶 · {retiredRows.length}
        </a>
        <a href="/admin/stimuli?filter=all" className={tabClass("all")}>
          全部 · {allRows.length}
        </a>
      </div>

      {/* Upload section — only show on active/all views */}
      {activeFilter !== "retired" && (
        <div className="mt-4 rounded border border-dashed border-gray-300 bg-gray-50 px-6 py-4">
          <h2 className="font-medium text-gray-900">Upload Stimuli</h2>
          <p className="mt-1 text-xs text-gray-500">
            Accepts A1–D99 (new base) or A1_v2–D99_vN (version replacement).
            Versioned uploads replace only future sessions; old sessions keep their assigned version.
          </p>
          <UploadForm />
        </div>
      )}

      {/* Retired view header */}
      {activeFilter === "retired" && (
        <div className="mt-4">
          {retiredRows.length === 0 ? (
            <div className="rounded border border-gray-200 bg-gray-50 px-6 py-8 text-center">
              <p className="text-sm text-gray-400">当前没有已停用的刺激材料。</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              已停用刺激材料 — 这些刺激不会被未来被试抽到。旧数据和旧图片不会被删除。
            </p>
          )}
        </div>
      )}

      {/* Category sections */}
      {(["A", "B", "C", "D"] as const).map((cat) => {
        const catRows = byCategory[cat];
        if (!catRows || catRows.length === 0) return null;
        return (
          <div key={cat} className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">
              Category {cat}
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({catRows.length} images)
              </span>
            </h2>
            <StimulusGrid rows={catRows} showRetired={activeFilter === "retired"} />
          </div>
        );
      })}
    </div>
  );
}

/** Client upload form. */
function UploadForm() {
  return (
    <form
      action="/api/admin/stimuli/upload"
      method="POST"
      encType="multipart/form-data"
      className="mt-3 flex items-center gap-3"
    >
      <input
        type="file"
        name="files"
        multiple
        accept="image/png"
        className="text-sm text-gray-600 file:mr-3 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:py-1 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
      />
      <button
        type="submit"
        className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Upload
      </button>
    </form>
  );
}
