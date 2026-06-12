import { getDb } from "@/lib/db";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const STIMULI_DIR = path.join(process.cwd(), "storage", "stimuli");

/** Category → default complexity and regularity. */
const CATEGORY_DEFAULTS: Record<
  string,
  { complexity_level: string; regularity_level: string }
> = {
  A: { complexity_level: "low_medium", regularity_level: "regular" },
  B: { complexity_level: "low_medium", regularity_level: "irregular" },
  C: { complexity_level: "medium_high", regularity_level: "regular" },
  D: { complexity_level: "medium_high", regularity_level: "irregular" },
};

export interface SeedResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

/** Scan storage/stimuli/ and upsert into stimulus_pool. */
export function seedStimulusPool(): SeedResult {
  const db = getDb();
  const result: SeedResult = { inserted: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(STIMULI_DIR)) {
    result.errors.push(`Directory not found: ${STIMULI_DIR}`);
    return result;
  }

  const files = fs.readdirSync(STIMULI_DIR).filter((f) => f.endsWith(".png"));

  const insert = db.prepare(`
    INSERT OR REPLACE INTO stimulus_pool
      (id, stim_id, storage_path, image_url, visual_category,
       complexity_level, regularity_level,
       semantic_risk, usable, stimulus_version,
       original_filename, width_px, height_px, file_size_bytes,
       notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'low', 1, 1, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const filename of files) {
      const stimId = path.basename(filename, ".png"); // A1, B2, etc.
      const category = stimId.charAt(0).toUpperCase();

      if (!CATEGORY_DEFAULTS[category]) {
        result.errors.push(`Unknown category for: ${filename}`);
        continue;
      }

      const defaults = CATEGORY_DEFAULTS[category];
      const filePath = path.join(STIMULI_DIR, filename);
      const stat = fs.statSync(filePath);
      const imageUrl = `/stimuli/${filename}`;
      const storagePath = `study1/${filename}`;

      // Try to get image dimensions.
      let w: number | null = null;
      let h: number | null = null;
      try {
        const dims = getPngDimensions(filePath);
        w = dims.width;
        h = dims.height;
      } catch { /* skip dimensions */ }

      const existing = db
        .prepare("SELECT id FROM stimulus_pool WHERE stim_id = ?")
        .get(stimId) as { id: string } | undefined;

      insert.run(
        existing?.id ?? crypto.randomUUID(),
        stimId,
        storagePath,
        imageUrl,
        category,
        defaults.complexity_level,
        defaults.regularity_level,
        filename,
        w,
        h,
        stat.size,
        null,
        now,
        now,
      );
      result.inserted++;
    }
  });

  transaction();
  return result;
}

/** Read PNG width/height from IHDR chunk without a full image library. */
function getPngDimensions(
  filePath: string,
): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  // IHDR starts at byte 16 (after 8-byte signature + 4-byte length + 4-byte "IHDR")
  if (buf[12] !== 0x49 || buf[13] !== 0x48 || buf[14] !== 0x44 || buf[15] !== 0x52) {
    throw new Error("Not a valid PNG");
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}
