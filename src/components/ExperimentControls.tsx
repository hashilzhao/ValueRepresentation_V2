"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

interface AdvanceEvent {
  event_type: string;
  event_data?: Record<string, unknown>;
}

interface Props {
  sessionId: string;
  participantCode: string;
  completed: boolean;
  advanceEvent: AdvanceEvent | null;
}

export default function ExperimentControls({
  sessionId,
  participantCode,
  completed,
  advanceEvent,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Safety: if loading gets stuck for >5s, re-enable the button.
  useEffect(() => {
    if (!loading) return;
    loadingRef.current = true;
    const t = setTimeout(() => {
      if (loadingRef.current) {
        setLoading(false);
        setError("Request timed out. Please try again.");
      }
    }, 5000);
    return () => { loadingRef.current = false; clearTimeout(t); };
  }, [loading]);

  function startLoading() {
    loadingRef.current = true;
    setLoading(true);
  }

  function stopLoading() {
    loadingRef.current = false;
    setLoading(false);
  }

  async function handleContinue() {
    if (loading) return;
    startLoading();
    setError(null);

    const body: Record<string, unknown> = { session_id: sessionId };
    if (advanceEvent) {
      body.event_type = advanceEvent.event_type;
      body.event_data = advanceEvent.event_data;
    }

    try {
      const res = await fetch("/api/sessions/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to advance.");
        stopLoading();
        return;
      }

      const data = await res.json();

      if (data.completed) {
        router.push(`/complete?code=${encodeURIComponent(participantCode)}`);
      } else {
        // Use window.location to force a full page reload.
        // router.push to the same route keeps the component mounted
        // with loading=true, which is the root cause of the stuck button.
        window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
      }
    } catch {
      setError("Network error. Please try again.");
      stopLoading();
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!completed && (
        <button
          onClick={handleContinue}
          disabled={loading}
          className="w-full rounded bg-gray-900 py-4 text-xl font-bold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "请稍候…" : "继续"}
        </button>
      )}

      {completed && (
        <div className="text-center text-sm text-green-700 bg-green-50 rounded px-4 py-3">
          实验已完成，感谢你的参与。
        </div>
      )}
    </div>
  );
}
