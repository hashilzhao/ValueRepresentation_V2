"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageChoicePractice from "./ImageChoicePractice";

interface PracticeImage {
  image_url: string;
  label: string;
}

interface Props {
  sessionId: string;
  participantCode: string;
  valueMap: {
    set_id: string;
    stim_id: string;
    final_liking_rank: number;
    external_value: number;
  }[];
  practiceImages: PracticeImage[];
}

const OPTIONS = [
  { key: "A", text: "选择这个图形需要消耗的资源点数" },
  { key: "B", text: "这个图形在任务中的兑换价值（收益价值）" },
  { key: "C", text: "这个图形有多好看" },
];

export default function ValueAssignmentWithPractice({
  sessionId,
  participantCode,
  valueMap,
  practiceImages,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"practice" | "comprehension">("practice");

  // ── Comprehension check state ──────────────────────────────
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    hint?: string;
    attempts: number;
  } | null>(null);
  const [done, setDone] = useState(false);

  function handlePracticeComplete() {
    setPhase("comprehension");
  }

  async function handleComprehensionSubmit() {
    if (!selected || loading) return;
    setLoading(true);

    const res = await fetch("/api/study1/comprehension-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, selected_answer: selected }),
    });
    const data = await res.json();

    setResult({ correct: data.correct, hint: data.hint, attempts: data.attempts });
    setLoading(false);

    if (data.done) {
      setDone(true);
      setTimeout(() => {
        router.push(
          `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`,
        );
      }, 1200);
    } else {
      setSelected(null);
    }
  }

  // ── Practice phase ─────────────────────────────────────────
  if (phase === "practice") {
    return (
      <div className="space-y-6">
        <p className="text-lg font-bold leading-relaxed text-gray-900">
          ⚠ 接下来的任务中，每个图形旁边会显示一个价值点数。价值点数表示该图形在任务中的兑换价值（收益价值）。点数越高，表示该图形的收益价值越高，不是你需要付出的成本或价格，选择图形也不会消耗你的资源点数。
        </p>
        <ImageChoicePractice
          images={practiceImages}
          showValues={true}
          onComplete={handlePracticeComplete}
        />
      </div>
    );
  }

  // ── Comprehension check phase ──────────────────────────────
  if (done) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-green-700">
          {result?.correct
            ? "回答正确！价值点数表示图形的兑换价值（收益价值），不是价格。"
            : "理解有误，但你可以继续任务。请注意：价值点数表示的是图形的兑换价值，不是你需要付出的成本或价格。"}
        </p>
        <p className="text-xs text-gray-400">正在前往下一阶段…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-gray-900">请确认你已理解价值点数的含义：</h3>

      {/* Result feedback */}
      {result && !result.correct && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>回答不正确。{result.hint}</p>
          <p className="mt-1 text-xs text-amber-600">
            还剩 {2 - result.attempts} 次尝试机会。
          </p>
        </div>
      )}

      {/* Question */}
      <div className="rounded border border-gray-200 bg-white px-4 py-4">
        <p className="text-xl font-bold text-gray-900">
          图形旁边的价值点数表示什么？
        </p>
        <div className="mt-3 space-y-2">
          {OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 text-sm transition
                ${selected === opt.key
                  ? "border-gray-900 bg-gray-50"
                  : "border-gray-200 hover:border-gray-400"
                }`}
            >
              <input
                type="radio"
                name="comprehension"
                value={opt.key}
                checked={selected === opt.key}
                onChange={() => setSelected(opt.key)}
                className="sr-only"
              />
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-xs font-mono text-gray-500">
                {opt.key}
              </span>
              <span className="text-gray-700">{opt.text}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleComprehensionSubmit}
        disabled={!selected || loading}
        className="w-full rounded bg-gray-900 py-4 text-xl font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "提交中…" : "提交确认"}
      </button>
    </div>
  );
}
