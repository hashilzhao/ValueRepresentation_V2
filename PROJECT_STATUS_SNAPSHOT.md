# PROJECT_STATUS_SNAPSHOT.md — Study 1 V2

**Snapshot date**: 2026-06-06
**Project root**: `/Users/zhongxin/Desktop/study1_V2`

---

## Quick Status Summary

| Item | Status |
|---|---|
| App runs locally | ✅ `npm run dev` → `http://localhost:3000` |
| Database | ✅ SQLite, 26 tables, WAL mode, 0 participants (empty) |
| 10-stage participant flow | ✅ All stages implemented |
| Admin dashboard | ✅ 8 pages (Dashboard, Participants, Sessions, Stimuli, Study1, Audit, Results) |
| CSV export | ✅ 4 types (choice_responses, participant_summary, stimulus_value_map, data_dictionary) |
| Stimulus pool | ✅ 69 images (A=16, B=19, C=18, D=16) |
| Stimulus versioning | ✅ Implemented (never tested with real replacement) |
| Participant blinding | ✅ Multiple rounds of leak-checking applied |
| DEV_TEST_MODE | ✅ Commented out (full mode active) |
| Participant entry gate | ✅ Password gate + registration form |
| Balanced group assignment | ✅ Active session count tracking |
| Data collection ready | ⚠️ Needs full E2E walkthrough before pilot |

---

## File Count Summary

| Category | Files | Total Lines |
|---|---|---|
| Core library (lib/) | 16 | ~2,200 |
| React components | 14 | ~2,400 |
| Admin pages | 9 | ~1,900 |
| API routes | 21 | ~1,500 |
| App pages | 7 | ~600 |
| Config/root files | 10 | ~200 |
| **Total** | **~77 source files** | **~8,700 lines** |

---

## Dependency Health

All dependencies in `package.json` are installed (`node_modules/` exists).

Potentially unused:
- `@supabase/ssr` and `@supabase/supabase-js` — project switched to better-sqlite3; these may be removable
- `supabase/` directory with old migration file — kept for reference

---

## Recent Change History

| Date | Change |
|---|---|
| 2026-05-28 | Last server run (from `.next/` cache timestamp) |
| 2026-05-27 | Stimulus replacement: 80 images → 69 images (from 实验材料V1/), filenames updated to `_V1` suffix |
| 2026-05-27 | Timeout feedback fix: timeout → always loss (2 pts), balance can go negative |
| 2026-05-23 | Participant UI readability upgrade: larger text, larger images (320px), black borders, wider containers |
| 2026-05-23 | Practice trials visual upgrade: larger dot panels, F/J key styling |
| 2026-05-20 | Chinese translation: StageGameTask, experiment page, registration form, practice trials |
| 2026-05-20 | Participant entry password gate added |
| 2026-05-19 | Rank direction fix (rank 5 = most liked) |
| 2026-05-19 | Stimulus versioning + soft-retire infrastructure |
| 2026-05-19 | DB backup created (`backups/study1_before_stimulus_versioning_20260519_153358.db`) |
| 2026-05-17 | Seed script and stimulus management added |
| 2026-05-16 | Project initialized (Next.js 16, better-sqlite3) |

---

## Remaining English Text (Not Yet Translated)

| Location | Text |
|---|---|
| `src/app/page.tsx` | "Study 1", "Psychology Experiment Research Platform", "Admin Login", "Participant Entrance" |
| `src/lib/stages.ts:42-43` | "Final Questions" (post_experiment_check), "Complete" |
| `src/app/experiment/page.tsx` | "Loading the next part of the study…", "Missing participant code or session ID." |
| `src/app/login/page.tsx` | All text (entire admin login page is English) |
| Components | "Preparing…", "All trials complete.", placeholder text |
| `src/app/complete/page.tsx` | Thank-you text (need to verify) |

---

## Backup and Recovery

| Resource | Path |
|---|---|
| Current DB | `study1.db` (0 participants) |
| Pre-versioning backup | `backups/study1_before_stimulus_versioning_20260519_153358.db` |
| Old stimulus set | `storage/stimuli_legacy_backup_20260527_235016/` |
| Old stimulus (public) | `public/stimuli_legacy_backup_20260527_235016/` |
| Git repo | `.git/` exists, check `git log` for commit history |

---

## Handoff Document Inventory

| File | Status |
|---|---|
| `HANDOFF_CURRENT.md` | **NEW** — Authoritative handoff for next session |
| `PROJECT_STATUS_SNAPSHOT.md` | **NEW** — This file |
| `TODO_NEXT_CHANGES.md` | **NEW** — Pending changes tracker |
| `CURRENT_HANDOFF.md` | OLD — has wrong project path (`study1`), references 69 images |
| `HANDOFF.md` | OLD — detailed but references old 80-image set |
| `README.md` | Default Next.js boilerplate — never customized |
| `AGENTS.md` | Auto-generated Next.js note |
| `CLAUDE.md` | Points to `@AGENTS.md` |
