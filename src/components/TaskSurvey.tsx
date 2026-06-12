"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface McItemData {
  item_id: number;
  item_text: string;
}

interface Props {
  sessionId: string;
  participantCode: string;
  items: McItemData[];
}

const SCALE_LABELS: Record<number, string> = {
  1: "非常不同意",
  2: "不同意",
  3: "有点不同意",
  4: "不确定",
  5: "有点同意",
  6: "同意",
  7: "非常同意",
};

export default function TaskSurvey({
  sessionId,
  participantCode,
  items,
}: Props) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = items.every((it) => responses[it.item_id] != null);

  function handleSelect(itemId: number, value: number) {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit() {
    if (!allAnswered || loading) return;
    setLoading(true);
    setError(null);

    const payload = items.map((it) => ({
      item_id: it.item_id,
      response_value: responses[it.item_id],
    }));

    const res = await fetch("/api/manipulation-check/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, responses: payload }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Submission failed.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    router.push(
      `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`,
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {items.map((item, idx) => (
        <div
          key={item.item_id}
          className="rounded border border-gray-100 bg-white px-4 py-3"
        >
          <p className="text-lg text-gray-900">
            <span className="text-gray-400 mr-2">{idx + 1}.</span>
            {item.item_text}
          </p>
          <div className="mt-2 flex items-center justify-between gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((val) => (
              <label
                key={val}
                className={`flex cursor-pointer flex-col items-center rounded px-2 py-1 text-xs transition
                  ${responses[item.item_id] === val
                    ? "bg-gray-900 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
              >
                <input
                  type="radio"
                  name={`item-${item.item_id}`}
                  value={val}
                  checked={responses[item.item_id] === val}
                  onChange={() => handleSelect(item.item_id, val)}
                  className="sr-only"
                />
                {val}
              </label>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>{SCALE_LABELS[1]}</span>
            <span>{SCALE_LABELS[7]}</span>
          </div>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || loading}
        className="w-full rounded bg-gray-900 py-4 text-xl font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading
          ? "Submitting…"
          : !allAnswered
            ? `Please answer all questions (${Object.keys(responses).length}/${items.length})`
            : "Continue"}
      </button>
    </div>
  );
}
