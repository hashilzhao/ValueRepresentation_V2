"use client";

import { useState } from "react";

interface Props {
  children: React.ReactNode;
}

export default function EntryPasswordGate({ children }: Props) {
  const [granted, setGranted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setChecking(true);
    setError("");

    try {
      const res = await fetch("/api/participants/verify-entry-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "密码不正确，请联系主试。");
        setChecking(false);
        return;
      }

      setGranted(true);
    } catch {
      setError("网络错误，请重试。");
      setChecking(false);
    }
  }

  if (granted) return <>{children}</>;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            实验进入验证
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            请由主试输入实验进入密码。密码验证通过后，系统将进入被试信息登记页面。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入实验进入密码"
            className="block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            autoFocus
          />

          <button
            type="submit"
            disabled={checking}
            className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {checking ? "验证中…" : "进入实验"}
          </button>
        </form>
      </div>
    </main>
  );
}
