"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  /** API endpoint to call, e.g. "/api/admin/delete-participant" */
  endpoint: string;
  /** JSON body to send */
  body: Record<string, string>;
  /** Label for the confirm prompt */
  confirmLabel: string;
}

export default function DeleteButton({ endpoint, body, confirmLabel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete ${confirmLabel}? This cannot be undone.`)) return;

    setLoading(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Delete failed.");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-40"
    >
      {loading ? "..." : "Delete"}
    </button>
  );
}
