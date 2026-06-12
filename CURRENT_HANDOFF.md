# CURRENT_HANDOFF.md — Study 1 Experiment Web App

Updated: 2026-05-27 (stimulus replacement)
Project root: `/Users/zhongxin/Desktop/study1`

**Stimulus set**: 69 images from `实验材料V1/` (A=16, B=19, C=18, D=16). Filenames: `A1_V1.png` format. Old 80-image set backed up to `storage/stimuli_legacy_backup_20260527_235016/` and `public/stimuli_legacy_backup_20260527_235016/`.

---

## 1. Current App Status

Study 1 is a **pre-pilot Chinese-language psychology experiment** with a fully implemented 10-stage participant flow. Participants are randomly assigned to scarcity or abundance groups, complete a Resource Task (perceptual trials with preset resource feedback), rank 25 abstract stimuli via pairwise comparison, receive external values (5/10/15/20/25) on hidden sets, make 144 formal two-option choices, and complete post-experiment checks. All trial-level data is logged to SQLite. Admin dashboard, session audit, CSV export, stimulus versioning, and soft-retire infrastructure are all implemented. The app runs locally at `http://localhost:3000`.

**DB is currently empty (0 participants)** — cleaned by user before pilot.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | better-sqlite3 → `study1.db` (WAL mode) |
| Auth | JWT (jose) + bcryptjs, cookie-based |
| Images | `storage/stimuli/` + `public/stimuli/` (69 PNG files, A=16 B=19 C=18 D=16) |

### Commands

```bash
cd /Users/zhongxin/Desktop/study1
npm run dev       # → http://localhost:3000
npm run build     # production build
npm run seed-stimuli  # re-seed stimulus_pool (auto-runs if pool empty)
```

### Environment (`.env.local`)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Admin JWT signing |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login |
| `PARTICIPANT_ENTRY_PASSWORD` | Participant gate password (server-side) |
| `PARTICIPANT_ACCESS_SECRET` | JWT secret for participant access cookie |
| `NEXT_PUBLIC_DEV_TEST_MODE` | Commented out — full mode is default |

### URLs

| Role | URL | Auth |
|---|---|---|
| Admin login | `/login` | `admin@study1.local` (see .env.local) |
| Admin dashboard | `/admin` | JWT cookie |
| Participant entry | `/start` | Password gate → registration form |
| Experiment | `/experiment?code=X&session=Y` | Public |

---

## 3. Implemented Participant Flow

### Canonical stage order (`src/lib/stages.ts`)

| # | Stage key | Participant title | UI Component | Status |
|---|---|---|---|---|
| 1 | `baseline_questionnaire` | 任务操作说明 | PracticeTrials → BaselinePractice | DONE |
| 2 | `relative_resource_feedback` | 任务信息 | ExperimentControls + feedback text | DONE |
| 3 | `scarcity_manipulation` | 资源账户任务 | StageGameTask + mini block checks | DONE |
| 4 | `study1_liking_ranking` | 视觉偏好任务 | PreferenceTask (pairwise F/J) | DONE |
| 5 | `study1_liking_validation` | 视觉偏好确认 | ValidationTask (pairwise F/J) | DONE |
| 6 | `study1_value_assignment` | 价值点数说明 | ValueInstructionTask (MCQ) | DONE |
| 7 | `study1_formal_choice` | 图像选择任务 | FormalChoiceTask (F/J + value labels) | DONE |
| 8 | `manipulation_check` | 任务体验问卷 | TaskSurvey (14 Chinese Likert) | DONE |
| 9 | `post_experiment_check` | 实验后问题 | PostExperimentCheck | DONE |
| 10 | `complete` | Complete | Thank-you page | DONE |

### Entry gate
- `/start` → `EntryPasswordGate` component → password check via `POST /api/participants/verify-entry-password` → `participant_access` JWT cookie → registration form
- Registration API (`POST /api/participants/register`) requires valid `participant_access` cookie (403 if missing)

---

## 4. Admin Dashboard

| Page | Route | Features |
|---|---|---|
| Dashboard | `/admin` | Participant counts, group counts, MC group-level summary |
| Participants | `/admin/participants` | Table with code, group, stage, status, delete |
| Sessions | `/admin/sessions` | Progress, balance, accuracy, RT, MC means, delete |
| Stimuli | `/admin/stimuli` | 69 thumbnails, upload, edit metadata, 使用中/垃圾桶/全部 tabs, v1 badges, retire/restore |
| Study 1 | `/admin/study1` | Per-session assignment list → click to detail |
| Session detail | `/admin/study1/[id]` | 5×5 matrix, calibration, validation, formal choice tables, diagnostics |
| Audit | `/admin/audit` | ✅/❌ per-check, gate status, rank direction check, legacy warnings |
| Results | `/admin/results` | Group-level + per-participant metrics, CSV export buttons |
| CSV export | `/api/admin/export?type=...` | choice_responses, participant_summary, stimulus_value_map, data_dictionary |

---

## 5. Data Models

### 26 database tables (`study1.db`)

**Core**: `participants`, `experiment_sessions`, `event_logs`

**Stimulus**: `stimulus_pool` (69), `stimulus_versions` (69 v1), `subject_selected_stimuli` (25/session), `subject_set_assignment` (25/session, 5 sets × 5)

**Stage-game**: `stage_game_trials` (90/session), `stage_game_responses` (response, accuracy, rt_ms, missed_response, timeout, preset_feedback_direction, preset_feedback_points, balance_before, balance_after), `block_manipulation_checks` (4 Likert per block)

**Calibration**: `calibration_trials` (80/session), `calibration_responses` (response_side, chosen_stim_id, rt_ms, timeout, consistent), `liking_map` (25/session — final_liking_rank 1-5, win_count_within_set, tie_flag), `calibration_quality`

**Validation**: `liking_validation_trials` (45/session), `liking_validation_responses`, `liking_validation_quality` (different_rank_consistency_rate, validation_passed, needs_rerank)

**Value**: `value_assignment` (5 rows, external_value 5/10/15/20/25), `stimulus_value_map` (25/session), `value_comprehension_checks`

**Formal choice**: `formal_trials` (144/session — trial_type, delta_liking, delta_value, high_liking_side, high_value_side, etc.), `choice_responses` (chosen_stim_id, rt_ms, timeout, chose_high_liking, chose_high_value, chose_congruent_advantage)

**End**: `manipulation_check_responses` (14 items, 1-7), `manipulation_check_summary`, `post_experiment_checks`

---

## 6. Study 1 Trial Logic

### Resource Task (`scarcity_manipulation`)
- 3 blocks × 30 trials = 90 (full mode). Task types: dot_comparison, shape_matching, dot_estimation.
- Scarcity group: balance ~4–12, threshold 10. Abundance group: balance ~80–130, threshold 10.
- Feedback is **preset** (pre-generated, not based on real accuracy).
- **Timeout rule (fixed 2026-05-27)**: timeout/missed response → always loss (2 pts deducted), accuracy=0, response=null, rt_ms=null. Balance can go negative — no clamping to 0.
- Mini block checks after each block: 4 Likert items (1-7).
- RT: `performance.now()` + `requestAnimationFrame()`. Timeout: 3000ms.

### Liking Ranking (`study1_liking_ranking`)
- Pairwise F/J calibration. Phase 1: 50 within-set pairs. Phase 2: 30 cross-set pairs.
- Rank inference: win-count within each set → rank 1-5. **Rank 1 = least liked, rank 5 = most liked**.
- Timeout: 180000ms. RT: `performance.now()` + `requestAnimationFrame()`.

### Liking Validation (`study1_liking_validation`)
- 30 different_rank + 15 same_rank = 45 pairwise comparisons.
- Quality gate: if `different_rank_consistency_rate < 85%` → blocks value assignment.

### Value Assignment (`study1_value_assignment`)
- Rotating Latin-square: 5/10/15/20/25 per set. Comprehension MCQ (correct answer: B).

### Formal Choice (`study1_formal_choice`)
- 144 trials: 48 conflict, 32 congruent, 32 liking_only, 32 value_only.
- Two images + external value labels. F/J response.
- RT: `performance.now()` + `requestAnimationFrame()`. Timeout: 180000ms.
- Records: chose_high_liking, chose_high_value, chose_congruent_advantage.

---

## 7. Trial-Level Fields Recorded

| Task | Fields Recorded |
|---|---|
| Stage-game | response, accuracy, rt_ms, missed_response, timeout, preset_feedback_direction, preset_feedback_points, balance_before, balance_after |
| Calibration | response_side, chosen_stim_id, rt_ms, timeout, consistent |
| Validation | response_side, chosen_stim_id, rt_ms, timeout, consistent_with_ranking |
| Formal choice | response_side, chosen_stim_id, chosen_liking_rank, chosen_external_value, rt_ms, timeout, chose_high_liking, chose_high_value, chose_congruent_advantage |

---

## 8. Known Bugs & Unfinished Details

| # | Description | Priority | Location |
|---|---|---|---|
| 1 | Landing page English ("Admin Login", "Participant Entrance") | LOW | `src/app/page.tsx` |
| 2 | PreferenceTask/FormalChoiceTask/ValidationTask have minor English labels ("Preparing…", "All trials complete.") | LOW | Components |
| 3 | Stage titles "Final Questions", "Complete" still English | LOW | `src/lib/stages.ts` |
| 4 | `public/stimuli/` is a copy — uploaded files need manual sync | MEDIUM | Filesystem |
| 5 | Stimulus versioning (B17_v2.png) never tested with real replacement image | LOW | upload API |
| 6 | DB currently empty (0 participants) — cleaned during stimulus replacement | INFO | — |

---

## 9. Recent Changes

| Date | Change | Files |
|---|---|---|
| 2026-05-27 | **Timeout feedback fix**: timeout/no-response always deducts 2 pts (loss). Balance allowed negative. Server-side defense-in-depth. | `StageGameTask.tsx`, `stage-game/response.ts` |
| 2026-05-23 | Participant UI readability upgrade: larger text, larger images (320px), black-bordered panels, wider containers | 5 component files |
| 2026-05-23 | Practice trials visual upgrade: larger dot panels, black borders, F/J key styling | `PracticeTrials.tsx` |
| 2026-05-20 | Chinese translation: StageGameTask, experiment page, registration form, practice trials | Multiple files |
| 2026-05-20 | Participant entry password gate | `verify-entry-password/route.ts`, `EntryPasswordGate.tsx`, register API |
| 2026-05-19 | Rank direction fix (rank 5 = most liked) | `calibration-generator.ts` |
| 2026-05-19 | Stimulus versioning + soft-retire infrastructure | DB, upload API, admin stimuli page |

---

## 10. Highest-Priority Next Fixes

1. **Translate remaining English labels** (landing page, stage titles "Final Questions"/"Complete", component "Preparing…" text) — LOW effort, high polish
2. **Symlink or sync `public/stimuli/`** so uploaded replacement images are served — MEDIUM, needed before any replacement upload
3. **Full browser E2E test** with fresh participant through all 10 stages — verify no stuck states
4. **Verify CSV exports** include all fields needed for R/Python analysis after one completed session
5. **Backup `study1.db`** before pilot data collection

---

## Safety Notes

- Participants must never see: scarcity, abundance, group, condition, manipulation, set_id, visual_category, liking_rank, trial_type, delta_liking, delta_value.
- External value points = reward/exchange value, not price or cost.
- Formal choice shows image + value label, not liking rank.
- Stage-game timeout always deducts points. Balance can go negative.
- CSV export preserves trial-level data.
- DB auto-seeds stimuli on first `getDb()` call if pool is empty (69 images). Auto-backfills `stimulus_versions` v1.
- Old 80-image set backed up to `storage/stimuli_legacy_backup_20260527_235016/` and `public/stimuli_legacy_backup_20260527_235016/`.
