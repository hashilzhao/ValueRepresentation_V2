"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResumeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResume(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmed = code.trim();
    if (!trimmed) {
      setError("请输入被试编号。");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/participants/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_code: trimmed }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "查找失败。");
      setLoading(false);
      return;
    }

    const { participant_code, session_id } = await res.json();
    router.push(
      `/experiment?code=${encodeURIComponent(participant_code)}&session=${session_id}`,
    );
  }

  return (
    <form onSubmit={handleResume} className="space-y-3">
      <div className="text-center">
        <h2 className="text-sm font-medium text-gray-700">继续实验</h2>
        <p className="text-xs text-gray-400">
          输入已有的被试编号继续之前的实验。
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {error}
        </div>
      )}

      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="输入被试编号，例如 P001"
        className="block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "查找中…" : "继续实验"}
      </button>
    </form>
  );
}
