"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STRATEGY_OPTIONS = [
  { key: "A", text: "我主要根据自己更喜欢哪张图形" },
  { key: "B", text: "我主要根据图形旁边的价值点数" },
  { key: "C", text: "我会同时考虑喜爱程度和价值点数" },
  { key: "D", text: "我基本随机选择" },
  { key: "E", text: "其他" },
];

interface Props {
  sessionId: string;
  participantCode: string;
}

export default function PostExperimentCheck({ sessionId, participantCode }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q1, setQ1] = useState(4);
  const [q2, setQ2] = useState(4);
  const [q3, setQ3] = useState(4);
  const [q4, setQ4] = useState("");
  const [q5, setQ5] = useState("");
  const [q6, setQ6] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q5) { setError("Please answer question 5."); return; }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/study1/post-experiment-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        performance_feedback_belief: q1,
        preset_feedback_suspicion: q2,
        resource_task_influence_belief: q3,
        perceived_study_purpose_text: q4,
        main_choice_strategy: q5,
        unusual_or_unrealistic_text: q6,
      }),
    });

    if (!res.ok) {
      setError("Submission failed. Please try again.");
      setLoading(false);
      return;
    }

    router.push(`/complete?code=${encodeURIComponent(participantCode)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Q1 */}
      <LikertItem
        num={1}
        question="你觉得前面的资源点数反馈在多大程度上反映了你的真实任务表现？"
        value={q1}
        onChange={setQ1}
        anchorLow="完全没有反映"
        anchorHigh="完全反映"
      />

      {/* Q2 */}
      <LikertItem
        num={2}
        question="你是否怀疑前面的资源点数变化是由程序预设的？"
        value={q2}
        onChange={setQ2}
        anchorLow="完全没有怀疑"
        anchorHigh="完全怀疑"
      />

      {/* Q3 */}
      <LikertItem
        num={3}
        question="你是否认为前面的资源任务影响了你后面图像选择任务中的判断？"
        value={q3}
        onChange={setQ3}
        anchorLow="完全没有影响"
        anchorHigh="非常明显影响"
      />

      {/* Q4 — free text */}
      <div className="rounded border border-gray-100 bg-white px-4 py-3">
        <p className="text-lg text-gray-900">
          <span className="text-gray-400 mr-1">4.</span>
          你觉得本研究真正想考察什么？
        </p>
        <textarea
          value={q4}
          onChange={(e) => setQ4(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded border border-gray-200 px-4 py-3 text-lg"
          placeholder="请简要写下你的猜测…"
        />
      </div>

      {/* Q5 — single choice */}
      <div className="rounded border border-gray-100 bg-white px-4 py-3">
        <p className="text-lg text-gray-900">
          <span className="text-gray-400 mr-1">5.</span>
          在图像选择任务中，你主要根据什么做选择？
        </p>
        <div className="mt-2 space-y-1.5">
          {STRATEGY_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-base transition
                ${q5 === opt.key ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"}`}
            >
              <input
                type="radio"
                name="strategy"
                value={opt.key}
                checked={q5 === opt.key}
                onChange={() => setQ5(opt.key)}
                className="sr-only"
              />
              <span className="text-xs font-mono text-gray-400">{opt.key}.</span>
              <span className="text-gray-700">{opt.text}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Q6 — free text */}
      <div className="rounded border border-gray-100 bg-white px-4 py-3">
        <p className="text-lg text-gray-900">
          <span className="text-gray-400 mr-1">6.</span>
          你在实验过程中有没有发现任何让你觉得奇怪或不真实的地方？
        </p>
        <textarea
          value={q6}
          onChange={(e) => setQ6(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded border border-gray-200 px-4 py-3 text-lg"
          placeholder="如果有，请描述…"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-gray-900 py-4 text-xl font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

function LikertItem({
  num,
  question,
  value,
  onChange,
  anchorLow,
  anchorHigh,
}: {
  num: number;
  question: string;
  value: number;
  onChange: (v: number) => void;
  anchorLow: string;
  anchorHigh: string;
}) {
  return (
    <div className="rounded border border-gray-100 bg-white px-4 py-3">
      <p className="text-lg text-gray-900">
        <span className="text-gray-400 mr-1">{num}.</span>
        {question}
      </p>
      <div className="mt-2 flex items-center justify-between gap-1">
        {[1, 2, 3, 4, 5, 6, 7].map((val) => (
          <label
            key={val}
            className={`cursor-pointer rounded px-2 py-1 text-xs transition
              ${value === val ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
          >
            <input
              type="radio"
              name={`q${num}`}
              value={val}
              checked={value === val}
              onChange={() => onChange(val)}
              className="sr-only"
            />
            {val}
          </label>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{anchorLow}</span>
        <span>{anchorHigh}</span>
      </div>
    </div>
  );
}
