import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { stim_id, semantic_risk, usable, notes, complexity_level, regularity_level, retired_reason } =
    await request.json();

  if (!stim_id) {
    return NextResponse.json({ error: "stim_id is required." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const current = db.prepare("SELECT usable FROM stimulus_pool WHERE stim_id = ?").get(stim_id) as { usable: number } | undefined;

  if (!current) {
    return NextResponse.json({ error: "Stimulus not found." }, { status: 404 });
  }

  // Only update provided fields.
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | number | null)[] = [now];

  if (semantic_risk !== undefined) {
    sets.push("semantic_risk = ?");
    vals.push(semantic_risk);
  }
  if (usable !== undefined) {
    const newUsable = usable ? 1 : 0;
    sets.push("usable = ?");
    vals.push(newUsable);
    // Soft-retire: set retired_at when moving 1→0.
    if (current.usable === 1 && newUsable === 0) {
      sets.push("retired_at = ?");
      vals.push(now);
      if (retired_reason) { sets.push("retired_reason = ?"); vals.push(retired_reason); }
    }
    // Restore: clear retired fields when moving 0→1.
    if (current.usable === 0 && newUsable === 1) {
      sets.push("retired_at = NULL");
      sets.push("retired_reason = NULL");
    }
  }
  if (notes !== undefined) {
    sets.push("notes = ?");
    vals.push(notes);
  }
  if (complexity_level !== undefined) {
    sets.push("complexity_level = ?");
    vals.push(complexity_level);
  }
  if (regularity_level !== undefined) {
    sets.push("regularity_level = ?");
    vals.push(regularity_level);
  }

  vals.push(stim_id);

  db.prepare(
    `UPDATE stimulus_pool SET ${sets.join(", ")} WHERE stim_id = ?`,
  ).run(...vals);

  return NextResponse.json({ success: true });
}
