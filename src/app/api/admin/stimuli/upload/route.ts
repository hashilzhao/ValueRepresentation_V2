import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const STIMULI_DIR = path.join(process.cwd(), "storage", "stimuli");

const CATEGORY_DEFAULTS: Record<string, { complexity_level: string; regularity_level: string }> = {
  A: { complexity_level: "low_medium", regularity_level: "regular" },
  B: { complexity_level: "low_medium", regularity_level: "irregular" },
  C: { complexity_level: "medium_high", regularity_level: "regular" },
  D: { complexity_level: "medium_high", regularity_level: "irregular" },
};

/** Parse filename: B17.png → { base: "B17", version: 1 }; B17_v2.png → { base: "B17", version: 2 } */
function parseFilename(filename: string): { base: string; version: number } | null {
  const name = path.basename(filename, ".png");
  const match = name.match(/^([A-D]\d+)(?:_v(\d+))?$/i);
  if (!match) return null;
  const base = (match[1] ?? "").toUpperCase();
  const version = match[2] ? parseInt(match[2], 10) : 1;
  return { base, version };
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  const db = getDb();
  const results: { filename: string; stim_id: string; status: string }[] = [];

  if (!fs.existsSync(STIMULI_DIR)) {
    fs.mkdirSync(STIMULI_DIR, { recursive: true });
  }

  for (const file of files) {
    const originalName = file.name;
    const parsed = parseFilename(originalName);

    if (!parsed) {
      results.push({ filename: originalName, stim_id: "—", status: "skipped: invalid filename pattern (use A1–D99 or A1_v2–D99_vN)" });
      continue;
    }

    const { base, version } = parsed;
    const category = base.charAt(0).toUpperCase();
    if (!CATEGORY_DEFAULTS[category]) {
      results.push({ filename: originalName, stim_id: base, status: "skipped: unknown category" });
      continue;
    }

    const existingBase = db.prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?").get(base) as { id: string } | undefined;

    // _v2/_v3 require existing base stimulus.
    if (version > 1 && !existingBase) {
      results.push({ filename: originalName, stim_id: base, status: "rejected: base stimulus does not exist; create base first" });
      continue;
    }

    // Check file doesn't already exist on disk.
    const destPath = path.join(STIMULI_DIR, originalName);
    if (fs.existsSync(destPath)) {
      results.push({ filename: originalName, stim_id: base, status: "rejected: file already exists on disk" });
      continue;
    }

    // Check no duplicate version in stimulus_versions.
    const existingVer = db.prepare("SELECT COUNT(*) AS cnt FROM stimulus_versions WHERE stim_id = ? AND version_number = ?").get(base, version) as { cnt: number };
    if (existingVer.cnt > 0) {
      results.push({ filename: originalName, stim_id: base, status: `rejected: version ${version} already exists` });
      continue;
    }

    // Write file.
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buf);

    let w: number | null = null;
    let h: number | null = null;
    try {
      if (buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52) {
        w = buf.readUInt32BE(16);
        h = buf.readUInt32BE(20);
      }
    } catch { /* skip */ }

    const now = new Date().toISOString();
    const imageUrl = `/stimuli/${originalName}`;

    if (version === 1 && !existingBase) {
      // New base stimulus — create stimulus_pool row + version 1.
      const defaults = CATEGORY_DEFAULTS[category];
      db.prepare(`
        INSERT INTO stimulus_pool
          (id, stim_id, storage_path, image_url, visual_category, complexity_level, regularity_level,
           semantic_risk, usable, stimulus_version, current_version, original_filename,
           width_px, height_px, file_size_bytes, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'low', 1, 1, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), base, `study1/${originalName}`, imageUrl, category, defaults.complexity_level, defaults.regularity_level, originalName, w, h, buf.length, null, now, now);
    } else if (version === 1 && existingBase) {
      // Version 1 already exists — this is a re-upload of base. Reject for safety.
      results.push({ filename: originalName, stim_id: base, status: "rejected: base already exists; use _v2 suffix for new version" });
      // Clean up the written file.
      try { fs.unlinkSync(destPath); } catch { }
      continue;
    } else {
      // version > 1 — update existing base.
      // 1. Insert stimulus_versions row.
      db.prepare(`
        INSERT INTO stimulus_versions
          (id, stim_id, version_number, image_url, file_path, original_filename, is_current, width_px, height_px, file_size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), base, version, imageUrl, `storage/stimuli/${originalName}`, originalName, w, h, buf.length, now);

      // 2. Set all previous versions is_current=0, new version is_current=1.
      db.prepare("UPDATE stimulus_versions SET is_current = 0 WHERE stim_id = ?").run(base);
      db.prepare("UPDATE stimulus_versions SET is_current = 1 WHERE stim_id = ? AND version_number = ?").run(base, version);

      // 3. Update stimulus_pool.
      db.prepare("UPDATE stimulus_pool SET image_url = ?, current_version = ?, updated_at = ? WHERE stim_id = ?").run(imageUrl, version, now, base);
    }

    // Always create stimulus_versions row for version 1 if it doesn't exist (for new base stimuli).
    if (version === 1 && !existingBase) {
      db.prepare(`
        INSERT OR IGNORE INTO stimulus_versions
          (id, stim_id, version_number, image_url, file_path, original_filename, is_current, width_px, height_px, file_size_bytes, created_at)
        VALUES (?, ?, 1, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), base, imageUrl, `storage/stimuli/${originalName}`, originalName, w, h, buf.length, now);
    }

    results.push({ filename: originalName, stim_id: base, status: version > 1 ? `updated to v${version}` : "created" });
  }

  return NextResponse.json({ results });
}
