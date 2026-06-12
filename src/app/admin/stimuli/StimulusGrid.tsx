"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";

interface StimulusRow {
  stim_id: string;
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
  width_px: number | null;
  height_px: number | null;
  notes: string | null;
}

export default function StimulusGrid({ rows, showRetired }: { rows: StimulusRow[]; showRetired?: boolean }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-gray-400">No stimuli in this category.</p>;
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {rows.map((row) => (
        <StimulusCard key={row.stim_id} row={row} showRetired={showRetired} />
      ))}
    </div>
  );
}

function StimulusCard({ row, showRetired }: { row: StimulusRow; showRetired?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [semanticRisk, setSemanticRisk] = useState(row.semantic_risk);
  const [usable, setUsable] = useState(row.usable === 1);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [showRetire, setShowRetire] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/stimuli/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stim_id: row.stim_id,
        semantic_risk: semanticRisk,
        usable,
        notes: notes || null,
        retired_reason: !usable ? retireReason || null : null,
      }),
    });
    setSaving(false);
    setEditing(false);
    setShowRetire(false);
    router.refresh();
  }

  async function handleRetire() {
    setUsable(false);
    await fetch("/api/admin/stimuli/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stim_id: row.stim_id,
        usable: false,
        retired_reason: retireReason || null,
      }),
    });
    setSaving(false);
    setShowRetire(false);
    router.refresh();
  }

  async function handleRestore() {
    setUsable(true);
    await fetch("/api/admin/stimuli/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stim_id: row.stim_id, usable: true }),
    });
    router.refresh();
  }

  return (
    <div
      className={`rounded border bg-white overflow-hidden ${
        usable ? "border-gray-200" : "border-red-200 opacity-60"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-gray-100">
        <Image
          src={row.image_url}
          alt={row.stim_id}
          fill
          className="object-contain"
          unoptimized
          sizes="120px"
        />
        <span className="absolute top-1 right-1 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
          v{row.current_version ?? row.stimulus_version}
        </span>
        {!usable && (
          <span className="absolute top-1 left-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            RETIRED
          </span>
        )}
      </div>

      {/* Info */}
      <div className="px-2 py-1.5 space-y-0.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono font-semibold text-gray-900">{row.stim_id}</span>
          <span className="text-gray-400">{row.visual_category}</span>
        </div>
        <div className="text-gray-500">
          {row.complexity_level} · {row.regularity_level}
        </div>
        <div className="text-gray-400">
          {row.width_px}×{row.height_px}
          {row.semantic_risk !== "low" && (
            <span className="ml-1 text-amber-600">risk:{row.semantic_risk}</span>
          )}
        </div>

        {/* Retired detail view */}
        {showRetired && row.retired_at && (
          <div className="border-t border-red-100 pt-1 mt-1 text-[10px]">
            <div className="text-red-600 font-medium">已停用</div>
            <div className="text-gray-400">停用时间: {row.retired_at.slice(0, 10)}</div>
            {row.retired_reason && <div className="text-gray-500">原因: {row.retired_reason}</div>}
          </div>
        )}

        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="mt-1 text-gray-400 hover:text-gray-900"
          >
            Edit
          </button>
        )}

        {editing && (
          <div className="mt-1 space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="text-gray-500">Risk</span>
              <select value={semanticRisk} onChange={(e) => setSemanticRisk(e.target.value)} className="rounded border border-gray-200 px-1 py-0 text-xs">
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
              </select>
            </label>
            <label className="flex items-center justify-between">
              <span className="text-gray-500">Usable</span>
              <input type="checkbox" checked={usable} onChange={(e) => setUsable(e.target.checked)} />
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes…" rows={2} className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs" />
            <div className="flex gap-1">
              <button onClick={handleSave} disabled={saving} className="rounded bg-gray-900 px-2 py-0.5 text-xs text-white hover:bg-gray-800">{saving ? "…" : "Save"}</button>
              <button onClick={() => setEditing(false)} className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500">Cancel</button>
            </div>
          </div>
        )}

        {/* Retire / Restore */}
        {!editing && usable && (
          <button onClick={() => setShowRetire(!showRetire)} className="mt-1 text-xs text-red-500 hover:text-red-700">移入垃圾桶</button>
        )}
        {!editing && !usable && (
          <button onClick={handleRestore} className="mt-1 text-xs text-green-600 hover:text-green-800">恢复使用</button>
        )}
        {showRetire && (
          <div className="mt-1 space-y-1">
            <input value={retireReason} onChange={(e) => setRetireReason(e.target.value)} placeholder="退役原因（可选）" className="w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs" />
            <p className="text-[10px] text-gray-400">移入垃圾桶只会让未来被试不再抽到该刺激；旧数据和旧图片不会被删除。</p>
            <div className="flex gap-1">
              <button onClick={handleRetire} className="rounded bg-red-600 px-2 py-0.5 text-xs text-white">确认退役</button>
              <button onClick={() => setShowRetire(false)} className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
