/** Run from project root: npx tsx scripts/seed-stimuli.ts */
import { seedStimulusPool } from "../src/lib/stimulus-seed";

console.log("Seeding stimulus_pool from storage/stimuli/ ...");
const result = seedStimulusPool();
console.log(`Inserted: ${result.inserted}`);
console.log(`Skipped: ${result.skipped}`);
if (result.errors.length > 0) {
  console.log("Errors:");
  result.errors.forEach((e) => console.log(`  - ${e}`));
}
console.log("Done.");
process.exit(0);
