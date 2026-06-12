# HANDOFF_CURRENT.md — Study 1 V2 Experiment Web App

**Last updated**: 2026-06-06 (complete project scan for Claude Code handoff)
**Project root**: `/Users/zhongxin/Desktop/study1_V2`

> This is the primary handoff document for the next Claude Code session. It supersedes the older `CURRENT_HANDOFF.md` and `HANDOFF.md` (which reference the old `study1` path).

---

## 1. Project Overview

Study 1 V2 is a **pre-pilot Chinese-language psychology experiment** with a fully implemented 10-stage participant flow. Participants are randomly assigned to scarcity or abundance groups, complete a Resource Task (perceptual trials with preset resource feedback), rank 25 abstract stimuli via pairwise comparison, receive external values (5/10/15/20/25) on hidden sets, make 144 formal two-option choices (liking vs value trade-off), and complete post-experiment checks. All trial-level data is logged to a local SQLite database.

**Current DB status**: Empty (0 participants) — cleaned before pilot data collection.
**DEV_TEST_MODE**: Commented out in `.env.local` — ready for full experimental mode.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | better-sqlite3 → `study1.db` (WAL mode, local file in project root) |
| Auth | JWT (jose) + bcryptjs, cookie-based (admin + participant gate) |
| Images | 69 PNG files in `storage/stimuli/` + `public/stimuli/` (copies, not symlinked) |
| Deployment | Vercel-ready but currently local-only |

### Dependencies

```
next 16.2.6, react 19.2.4, react-dom 19.2.4
better-sqlite3 12.10.0
bcryptjs 3.0.3, jose 6.2.3
@supabase/ssr 0.10.3, @supabase/supabase-js 2.105.4
tailwindcss v4, typescript 5
```

---

## 3. How to Start Locally

```bash
cd /Users/zhongxin/Desktop/study1_V2
npm run dev       # → http://localhost:3000 (Turbopack)
npm run build     # production build
npm run seed-stimuli  # re-seed stimulus_pool from storage/stimuli/ (auto-runs if pool empty)
```

### Environment (`.env.local`)

| Variable | Value | Purpose |
|---|---|---|
| `JWT_SECRET` | `study1-local-dev-secret-change-in-production` | Admin JWT signing |
| `ADMIN_EMAIL` | `admin@study1.local` | Admin login email |
| `ADMIN_PASSWORD` | `zxzx123456` | Admin login password |
| `PARTICIPANT_ENTRY_PASSWORD` | `zxzx123456` | Participant gate password (server-side only) |
| `PARTICIPANT_ACCESS_SECRET` | `study1-participant-access-secret` | JWT secret for participant access cookie |
| `NEXT_PUBLIC_DEV_TEST_MODE` | Commented out (absent) | Full mode is current default; uncomment `=true` for smoke testing |

### Key URLs

| Role | URL | Auth |
|---|---|---|
| Landing page | `/` | Public |
| Admin login | `/login` | `admin@study1.local` / `zxzx123456` |
| Admin dashboard | `/admin` | JWT cookie |
| Participant entry | `/start` | Password gate (`zxzx123456`) → registration form |
| Experiment | `/experiment?code=X&session=Y` | Public (no auth) |
| Complete | `/complete` | Public |

---

## 4. Complete Experiment Flow (10 Stages)

### Canonical Stage Order

| # | Stage Key | Participant Title | UI Component | Description |
|---|---|---|---|---|
| 1 | `baseline_questionnaire` | 任务操作说明 | PracticeTrials → BaselinePractice | Practice trials (dot comparison, shape matching, dot estimation) |
| 2 | `relative_resource_feedback` | 任务信息 | ExperimentControls + feedback text | Shows scarcity (start: 10 pts) or abundance (start: 100 pts) feedback |
| 3 | `scarcity_manipulation` | 资源账户任务 | StageGameTask | 3 blocks × 30 trials = 90 perceptual trials, preset feedback, mini block checks |
| 4 | `study1_liking_ranking` | 视觉偏好任务 | PreferenceTask | Pairwise F/J comparison: Phase 1 (50 within-set) + Phase 2 (30 cross-set) = 80 total |
| 5 | `study1_liking_validation` | 视觉偏好确认 | ValidationTask | 30 different_rank + 15 same_rank = 45 pairwise validation trials |
| 6 | `study1_value_assignment` | 价值点数说明 | ValueInstructionTask | Rotating Latin-square assignment (5/10/15/20/25) + comprehension MCQ (correct: B) |
| 7 | `study1_formal_choice` | 图像选择任务 | FormalChoiceTask | 144 trials (48 conflict / 32 congruent / 32 liking_only / 32 value_only), F/J |
| 8 | `manipulation_check` | 任务体验问卷 | TaskSurvey | 14 Chinese Likert items (1-7), 4 constructs |
| 9 | `post_experiment_check` | Final Questions | PostExperimentCheck | Suspicion/deception check, free-text + MCQ |
| 10 | `complete` | Complete | Thank-you page | — |

### Stage Definitions

- Stage slugs are defined in `src/lib/stages.ts` — the `STAGES` array
- Participant-facing titles in `PARTICIPANT_STAGE_TITLES`
- Admin-facing labels in `STAGE_LABELS`
- Stage advancement via `POST /api/sessions/advance`

### Entry Gate Flow

1. Participant visits `/start`
2. `EntryPasswordGate` component prompts for password
3. `POST /api/participants/verify-entry-password` verifies against `PARTICIPANT_ENTRY_PASSWORD`
4. Server sets `participant_access` JWT cookie on success
5. Participant fills registration form (code, age, gender, major)
6. `POST /api/participants/register` creates participant + session, balanced group assignment
7. Returns `session_id` and redirects to `/experiment?code=X&session=Y`

---

## 5. Database

### Overview

- **File**: `study1.db` in project root
- **Engine**: SQLite via better-sqlite3, WAL mode
- **Schema**: 26 tables, all auto-created on first `getDb()` call in `src/lib/db/index.ts`
- **Migrations**: Via `ALTER TABLE ... ADD COLUMN` try/catch blocks in `initSchema()`
- **Backup**: One backup exists at `backups/study1_before_stimulus_versioning_20260519_153358.db`

### All 26 Tables

| # | Table | Purpose | Key Columns |
|---|---|---|---|
| 1 | `participants` | Self-registered participant info | `id`, `participant_code` (unique), `age`, `gender`, `major`, `consented`, `status` |
| 2 | `experiment_sessions` | One per participant, tracks stage progression | `id`, `participant_id` (FK), `group_label` (scarcity/abundance), `current_stage`, `status`, `resource_balance`, `random_seed` |
| 3 | `event_logs` | Immutable audit trail | `session_id` (FK), `participant_id` (FK), `event_type`, `event_data` (JSON) |
| 4 | `stimulus_pool` | Master pool of 69 stimuli | `stim_id` (e.g., A1), `visual_category` (A/B/C/D), `usable`, `stimulus_version`, `retired_at` |
| 5 | `stimulus_versions` | Version history per stimulus | `stim_id`, `version_number`, `image_url`, `is_current` |
| 6 | `subject_selected_stimuli` | 25 randomly sampled per session | `session_id` (FK), `stim_id`, `visual_category`, `selection_order` |
| 7 | `subject_set_assignment` | 5 hidden sets × 5 images per session | `session_id` (FK), `set_id` (set_1–set_5), `position_in_set` (1-5) |
| 8 | `stage_game_trials` | 90 pre-generated perceptual trials | `block_index`, `global_trial_index`, `task_type`, `preset_feedback_direction`, `preset_feedback_points` |
| 9 | `stage_game_responses` | One per trial response | `response`, `accuracy`, `rt_ms`, `missed_response`, `timeout`, `balance_before`, `balance_after` |
| 10 | `block_manipulation_checks` | 4 Likert items after each block | `block_index`, `resource_insufficient`, `resource_confident`, `stressed`, `engaged` |
| 11 | `calibration_trials` | Phase 1 (50 within-set) + Phase 2 (30 cross-set) pairs | `phase`, `left_stim_id`, `right_stim_id`, `expected_choice` |
| 12 | `calibration_responses` | One per pairwise response | `phase`, `response_side`, `chosen_stim_id`, `rt_ms`, `timeout`, `consistent` |
| 13 | `liking_map` | 25 entries per session | `set_id`, `stim_id`, `final_liking_rank` (1-5), `win_count_within_set`, `tie_flag` |
| 14 | `calibration_quality` | Session-level calibration metrics | `within_set_consistency`, `cross_set_anchor_consistency`, `timeout_rate`, `mean_rt_ms` |
| 15 | `liking_validation_trials` | 45 (30 diff + 15 same rank) validation pairs | `validation_type`, `left_stim_id`, `right_stim_id`, `expected_choice` |
| 16 | `liking_validation_responses` | One per validation response | `response_side`, `chosen_stim_id`, `rt_ms`, `timeout`, `consistent_with_ranking` |
| 17 | `liking_validation_quality` | Validation quality gate | `different_rank_consistency_rate`, `validation_passed`, `needs_rerank` |
| 18 | `value_assignment` | 5 rows per session | `set_id`, `external_value` (5/10/15/20/25), `assignment_pattern_index` |
| 19 | `stimulus_value_map` | 25 entries linking stimuli to values | `set_id`, `stim_id`, `final_liking_rank`, `external_value` |
| 20 | `value_comprehension_checks` | MCQ attempts | `attempt`, `selected_answer`, `correct` |
| 21 | `formal_trials` | 144 pre-generated choice trials | `trial_type`, `delta_liking`, `delta_value`, `high_liking_side`, `high_value_side` |
| 22 | `choice_responses` | One per formal choice response | `response_side`, `chosen_stim_id`, `rt_ms`, `timeout`, `chose_high_liking`, `chose_high_value`, `chose_congruent_advantage` |
| 23 | `manipulation_check_responses` | 14 Chinese Likert items | `item_id`, `construct`, `response_value` (1-7) |
| 24 | `manipulation_check_summary` | Construct means per session | `resource_insufficiency_mean`, `resource_confidence_mean`, `stress_negative_affect_mean`, `task_engagement_mean` |
| 25 | `post_experiment_checks` | Final suspicion/debrief | `suspicion_flag`, `perceived_study_purpose_text`, `main_choice_strategy` |
| 26 | `liking_rankings` | **Legacy** — created but unused in current flow | — |

---

## 6. Stimulus Management

### Current Stimulus Set

- **69 images** in `storage/stimuli/` and `public/stimuli/`
- Category distribution: A=16, B=19, C=18, D=16
- Filename format: `{Category}{Number}_V1.png` (e.g., `A1_V1.png`, `B17_V1.png`)
- Category A: 1-9, 11-16, 18, 20 (missing: 4, 10, 17, 19)
- Category B: 1-19 (all present)
- Category C: 1-9, 11, 13-20 (missing: 10, 12)
- Category D: 1-16 (all present)
- **Legacy backup**: Old 80-image set at `storage/stimuli_legacy_backup_20260527_235016/` and `public/stimuli_legacy_backup_20260527_235016/`

### Seeding

- Auto-seeds on first `getDb()` call if `stimulus_pool` is empty
- CLI: `npm run seed-stimuli` → `scripts/seed-stimuli.ts` → `src/lib/stimulus-seed.ts`
- Auto-backfills `stimulus_versions` table with v1 entries

### Sampling

- 25 stimuli randomly sampled per session from the 69-image pool
- Quota rotation: 4 patterns (A=7/B=6/C=6/D=6, A=6/B=7/C=6/D=6, etc.) by `subjectIndex % 4`
- Hidden sets: 5 sets × 5 images, each set must contain all 4 categories (1/1/1/2 structure)
- Soft-balance optimization: 500 random attempts, minimizing risk concentration and maximizing diversity

### Versioning

- Versioned replacement via upload: `{stim_id}_v{N}.png` (e.g., `B17_v2.png`)
- Old sessions keep their original image URLs
- `stimulus_versions` table tracks version history
- Soft-retire: set `usable=0` + `retired_at` + `retired_reason`; retired stimuli not sampled for new sessions but old data preserved
- **IMPORTANT**: `public/stimuli/` is a **copy**, not a symlink. Uploaded replacement files must be manually synced to both `storage/stimuli/` and `public/stimuli/`

---

## 7. Admin Dashboard

| Page | Route | Features |
|---|---|---|
| Dashboard | `/admin` | Participant counts, group counts, manipulation check group-level summary (RI, RC, SNA, TE means) |
| Participants | `/admin/participants` | Table with code, age, gender, major, group, stage, status, started/completed timestamps, delete button |
| Sessions | `/admin/sessions` | Detailed table: progress, balance, accuracy, mean RT, missed count, MC construct means, delete; code links to Study 1 detail |
| Stimuli | `/admin/stimuli` | 69 thumbnails by category, upload form, edit metadata, 使用中/垃圾桶/全部 filter tabs, v1 badges, retire/restore |
| Study 1 | `/admin/study1` | Per-session assignment list → click to `/admin/study1/[sessionId]` detail |
| Session Detail | `/admin/study1/[id]` | 5×5 matrix, calibration, validation, formal choice tables, diagnostics |
| Audit | `/admin/audit` | Per-session integrity checks: ✅/❌ per check, gate status, rank direction check, timeout rates, legacy warnings |
| Results | `/admin/results` | Group-level + per-participant behavioral metrics; CSV export buttons; model-based metric placeholders |

### CSV Export Types (`/api/admin/export?type=...`)

| Type | File | Contents |
|---|---|---|
| `choice_responses` | study1_choice_responses.csv | All formal choice responses with trial metadata, coded variables (choice_right, chose_high_liking, etc.) |
| `participant_summary` | study1_participant_summary.csv | Per-participant summary: stage-game accuracy/RT, MC means, calibration consistency, formal choice rates, tradeoff index |
| `stimulus_value_map` | study1_stimulus_value_map.csv | Per-participant stimulus-to-value assignment |
| `data_dictionary` | study1_data_dictionary.csv | Field-level documentation |

---

## 8. API Routes

### Auth
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/login` | POST | Admin login → JWT cookie |
| `/api/auth/logout` | POST | Clear auth cookie |

### Participant
| Route | Method | Purpose |
|---|---|---|
| `/api/participants/verify-entry-password` | POST | Verify entry password → `participant_access` JWT cookie |
| `/api/participants/register` | POST | Register participant + create session + balanced group assignment (requires `participant_access` cookie) |

### Session/Stage
| Route | Method | Purpose |
|---|---|---|
| `/api/sessions/advance` | POST | Advance `current_stage` to `nextStage()`, log event |

### Stage-Game (Resource Task)
| Route | Method | Purpose |
|---|---|---|
| `/api/stage-game/init` | POST | Generate 90 stage_game_trials (idempotent), set initial balance |
| `/api/stage-game/submit-response` | POST | Save stage_game_response + update balance |
| `/api/stage-game/block-check` | POST | Save mini block manipulation check (4 Likert) |

### Study 1 Specific
| Route | Method | Purpose |
|---|---|---|
| `/api/study1/init-assignment` | POST | Sample 25 stimuli + construct 5 hidden sets |
| `/api/study1/calibration/init` | POST | Generate calibration_trials (Phase 1 → 2 auto-transition) |
| `/api/study1/calibration/submit` | POST | Save calibration_response + auto-phase transition + build liking_map |
| `/api/study1/validation/init` | POST | Generate liking_validation_trials from liking_map |
| `/api/study1/validation/submit` | POST | Save validation_response + compute quality + auto-advance |
| `/api/study1/value-assignment/init` | POST | Assign external values + build stimulus_value_map |
| `/api/study1/comprehension-check` | POST | Save value comprehension attempt + advance |
| `/api/study1/formal-trials/init` | POST | Generate 144 formal_trials (idempotent) |
| `/api/study1/formal-choice/submit` | POST | Save choice_response + auto-complete |
| `/api/study1/post-experiment-check` | POST | Save post-experiment check + complete session |

### Manipulation Check
| Route | Method | Purpose |
|---|---|---|
| `/api/manipulation-check/submit` | POST | Save 14 Likert responses + compute construct means + advance stage |

### Admin
| Route | Method | Purpose |
|---|---|---|
| `/api/admin/delete-participant` | POST | Delete participant + cascade |
| `/api/admin/delete-session` | POST | Delete session + cascade |
| `/api/admin/export` | GET | CSV export (4 types, JWT-protected) |
| `/api/admin/stimuli/upload` | POST | Upload stimulus image (multipart) |
| `/api/admin/stimuli/update` | PATCH | Edit stimulus metadata |

---

## 9. Key Experiment Logic

### Resource Task (Stage 3: scarcity_manipulation)

- 3 blocks × 30 trials = 90 in full mode (DEV_TEST_MODE: 1 block × 6 = 6)
- Task types: dot_comparison, shape_matching, dot_estimation
- Scarcity: initial balance 10, range ~4-12, pass threshold 10
- Abundance: initial balance 100, range ~80-130, pass threshold 10
- Feedback is **preset** (pre-generated), not based on real accuracy
- **Timeout rule**: missed response → always loss (2 pts deducted), accuracy=0, response=null, rt_ms=null
- Balance **can go negative** — no clamping to 0
- RT measurement: `performance.now()` + `requestAnimationFrame()`, stimulus timeout: 3000ms
- Mini block checks: 4 Likert items (1-7) after each block

### Liking Ranking (Stage 4: study1_liking_ranking)

- Pairwise F/J comparison, 2 phases:
  - Phase 1: 50 within-set pairs
  - Phase 2: 30 cross-set pairs (generated after Phase 1 completes)
- Rank inference: win-count within each set → rank 1-5
- **Rank 1 = least liked, rank 5 = most liked** (critical: verify rank direction)
- RT: `performance.now()` + `requestAnimationFrame()`, timeout: 180000ms
- DEV_TEST_MODE: 16 trials total

### Liking Validation (Stage 5: study1_liking_validation)

- 30 different_rank + 15 same_rank = 45 pairwise comparisons
- Quality gate: if `different_rank_consistency_rate < 85%` → blocks value assignment
- Also checks calibration timeout rate >20% and validation timeout rate >20%

### Value Assignment (Stage 6: study1_value_assignment)

- Rotating Latin-square: session N % 5 determines offset
- Values [5, 10, 15, 20, 25] rotated across set_1–set_5
- Comprehension MCQ: correct answer is B
- Quality gate enforced before this stage: liking_map must have 25 entries, validation must pass, timeout rates checked

### Formal Choice (Stage 7: study1_formal_choice)

- 144 trials in full mode (DEV_TEST_MODE: 18)
- Trial types: conflict (48), congruent (32), liking_only (32), value_only (32)
- Two images + external value labels displayed, F/J response
- Records: chose_high_liking, chose_high_value, chose_congruent_advantage
- RT: `performance.now()` + `requestAnimationFrame()`, timeout: 180000ms

### Manipulation Check (Stage 8)

- 14 Chinese Likert items, 4 constructs:
  1. resource_insufficiency (items 1-5)
  2. resource_confidence (items 6-7)
  3. stress_negative_affect (items 8-10)
  4. task_engagement (items 11-14)
- Response scale: 1-7
- All items currently NOT reverse-scored
- Construct means auto-computed and saved to `manipulation_check_summary`

---

## 10. Source Code Structure

```
src/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── layout.tsx                         # Root layout
│   ├── globals.css                        # Tailwind
│   ├── start/page.tsx                     # Participant entry (password gate + form)
│   ├── experiment/page.tsx                # MAIN STAGE ROUTER (~517 lines)
│   ├── login/page.tsx                     # Admin login
│   ├── complete/page.tsx                  # Thank-you page
│   ├── admin/
│   │   ├── layout.tsx                     # Admin layout (auth check)
│   │   ├── page.tsx                       # Dashboard
│   │   ├── participants/page.tsx          # Participants table
│   │   ├── sessions/page.tsx              # Sessions table
│   │   ├── stimuli/page.tsx               # Stimulus management + upload
│   │   ├── stimuli/StimulusGrid.tsx       # Thumbnail grid component
│   │   ├── study1/page.tsx               # Study 1 session list
│   │   ├── study1/[sessionId]/page.tsx   # Session detail (5×5 matrix, diagnostics)
│   │   ├── audit/page.tsx                # Session integrity audit
│   │   └── results/page.tsx              # Behavioral metrics + export
│   └── api/
│       ├── auth/login/route.ts
│       ├── auth/logout/route.ts
│       ├── participants/register/route.ts
│       ├── participants/verify-entry-password/route.ts
│       ├── sessions/advance/route.ts
│       ├── stage-game/init/route.ts
│       ├── stage-game/submit-response/route.ts
│       ├── stage-game/block-check/route.ts
│       ├── study1/init-assignment/route.ts
│       ├── study1/calibration/init/route.ts
│       ├── study1/calibration/submit/route.ts
│       ├── study1/validation/init/route.ts
│       ├── study1/validation/submit/route.ts
│       ├── study1/value-assignment/init/route.ts
│       ├── study1/comprehension-check/route.ts
│       ├── study1/formal-trials/init/route.ts
│       ├── study1/formal-choice/submit/route.ts
│       ├── study1/post-experiment-check/route.ts
│       ├── manipulation-check/submit/route.ts
│       └── admin/
│           ├── delete-participant/route.ts
│           ├── delete-session/route.ts
│           ├── export/route.ts
│           └── stimuli/upload/route.ts
│           └── stimuli/update/route.ts
├── components/
│   ├── AdminNav.tsx
│   ├── BaselinePractice.tsx
│   ├── DeleteButton.tsx
│   ├── EntryPasswordGate.tsx
│   ├── ExperimentControls.tsx
│   ├── FormalChoiceTask.tsx
│   ├── ParticipantForm.tsx
│   ├── PostExperimentCheck.tsx
│   ├── PracticeTrials.tsx
│   ├── PreferenceTask.tsx
│   ├── StageGameTask.tsx           # 670 lines — largest component
│   ├── StatCard.tsx
│   ├── TaskSurvey.tsx
│   ├── ValidationTask.tsx
│   └── ValueInstructionTask.tsx
├── lib/
│   ├── auth/index.ts               # JWT sign/verify, password hash, cookie helpers
│   ├── db/
│   │   ├── index.ts                # SQLite singleton, schema, auto-seed, migrations
│   │   └── event-log.ts            # logEvent() helper
│   ├── stages.ts                   # STAGES array, labels, FEEDBACK_TEXT, nextStage()
│   ├── stimulus-seed.ts            # seedStimulusPool() — scans storage/stimuli/
│   ├── types/database.ts           # TypeScript interfaces
│   ├── manipulation-check/
│   │   ├── items.ts                # 14 Chinese Likert items
│   │   └── scoring.ts             # computeConstructMeans(), saveConstructMeans()
│   ├── stage-game/
│   │   ├── config.ts               # DEV_TEST_MODE, block/trial counts, timing
│   │   ├── types.ts                # TypeScript types
│   │   ├── trial-generator.ts      # generateStageGameTrials(), feedback schedule
│   │   ├── response.ts             # saveStageGameResponse()
│   │   └── progress.ts             # calculateStageGameProgress()
│   └── study1/
│       ├── sampling.ts             # initializeStudy1StimulusAssignment() — 377 lines
│       ├── calibration-generator.ts # Phase 1+2 trial generation — 354 lines
│       ├── calibration-scoring.ts  # saveCalibrationResponse(), buildFinalLikingMap()
│       ├── calibration-types.ts    # TypeScript types
│       ├── value-assignment.ts     # assignExternalValues(), buildStimulusValueMap()
│       ├── formal-trial-generator.ts # generateFormalChoiceTrials() — 304 lines
│       └── formal-response.ts      # saveChoiceResponse(), codeChoiceResponse()
└── proxy.ts                        # Route protection for /admin/* (JWT middleware)

storage/
├── stimuli/                        # 69 PNG stimulus images
└── stimuli_legacy_backup_20260527_235016/  # Old 80-image set backup

public/
└── stimuli/                        # Copy of storage/stimuli/ (served by Next.js)

scripts/
└── seed-stimuli.ts                 # CLI script for manual re-seeding

backups/
└── study1_before_stimulus_versioning_20260519_153358.db
```

---

## 11. Known Bugs and Issues

| # | Description | Priority | Location |
|---|---|---|---|
| 1 | Landing page has English text ("Admin Login", "Participant Entrance", "Psychology Experiment Research Platform") | LOW | `src/app/page.tsx` |
| 2 | Stage titles "Final Questions" (post_experiment_check) and "Complete" are still English | LOW | `src/lib/stages.ts:42-43` |
| 3 | `PreferenceTask`, `FormalChoiceTask`, `ValidationTask` have minor English labels ("Preparing…", "All trials complete.") | LOW | Component files |
| 4 | `public/stimuli/` is a file copy, not a symlink → uploaded replacement images need manual sync to both directories | MEDIUM | Filesystem |
| 5 | Stimulus versioning (`B17_v2.png` upload/replacement) never tested with real replacement image | LOW | Upload API |
| 6 | DB currently empty (0 participants) — cleaned during previous stimulus replacement | INFO | — |
| 7 | `liking_rankings` table exists in schema but is legacy/unused (replaced by `liking_map`) | INFO | `src/lib/db/index.ts` |
| 8 | `src/middleware.ts` referenced in old HANDOFF.md as deprecated — need to verify it doesn't conflict with `proxy.ts` | LOW | Root |
| 9 | Supabase dependencies (`@supabase/ssr`, `@supabase/supabase-js`) are in `package.json` but project uses local SQLite — possibly unused | LOW | `package.json` |
| 10 | There is a `supabase/migrations/001_initial_schema.sql` file — original schema from before switching to better-sqlite3 | INFO | `supabase/` dir |

---

## 12. Participant Blinding Rules (Critical)

These must **never** appear in participant-facing HTML or API responses:

- `scarcity`, `abundance`, `group`, `condition`, `manipulation`
- `set_id`, `visual_category`, `liking_rank`, `trial_type`
- `delta_liking`, `delta_value`, `feedback_direction`, `calibration`
- `high_liking_side`, `high_value_side`, `congruent`
- Any construct names from manipulation check items

**Component names** were already renamed to avoid leaking in RSC payloads (e.g., `CalibrationTask` → `PreferenceTask`).

---

## 13. Key Implementation Assumptions

1. **Rank direction**: Rank 1 = least liked, rank 5 = most liked. This was fixed on 2026-05-19 (was reversed before).
2. **Stage-game feedback is preset**, not based on real accuracy. The feedback schedule is deterministic from the session's random seed.
3. **Stage-game timeout = loss**: Always deducts 2 points, balance can go negative.
4. **Value assignment counterbalancing**: Rotating Latin-square based on `COUNT(DISTINCT session_id) % 5` at assignment time.
5. **Quality gate**: Validation consistency < 85% OR calibration/validation timeout rate > 20% blocks value assignment stage.
6. **Stimulus sampling quota** rotates every 4 participants (A=7/B=6/C=6/D=6 patterns).
7. **Balanced group assignment**: New participant gets whichever group (scarcity/abundance) has fewer active sessions at registration time.
8. **The `experiment/page.tsx` server component does NOT use client-side data fetching for trial data** — all trial data is queried server-side and passed as props, so it never leaks into client network tabs.
9. **`public/stimuli/` is a COPY**, not a symlink (likely due to previous stimulus set replacement).

---

## 14. Files to Be Most Cautious With

| File | Reason |
|---|---|
| `src/app/experiment/page.tsx` | Main stage router, 517 lines — complex server component with inline DB queries, stage-specific rendering, gate logic |
| `src/lib/db/index.ts` | Schema definitions, auto-seed, migrations — breaking this breaks the entire app |
| `src/lib/stages.ts` | Defines the canonical 10-stage order — changing order requires checking all references |
| `src/lib/study1/sampling.ts` | Quota rotation, set construction, hard category constraints — affects all future data |
| `src/lib/study1/calibration-generator.ts` | Phase 1 → 2 auto-transition — breaking this blocks participant progression |
| `src/lib/study1/formal-trial-generator.ts` | 144-trial generation with 4 types, position balancing |
| `src/components/StageGameTask.tsx` | 670 lines, complex client component with timing, keyboard handling, feedback display |
| `src/proxy.ts` | Admin route protection — changing matcher breaks admin security |
| `src/lib/auth/index.ts` | JWT signing, cookie management — changes affect admin login |

---

## 15. Notes for the Next Claude Code Session

1. **Project is at `~/Desktop/study1_V2`**, NOT `~/Desktop/study1` (the old CURRENT_HANDOFF.md had the wrong path).
2. **The DB is empty**. Before testing the full flow, you'll need to register a participant through the UI.
3. **DEV_TEST_MODE is OFF** (commented out in `.env.local`). This means full trial counts (90 stage-game, 80 calibration, 144 formal choice). For quick smoke tests, temporarily add `NEXT_PUBLIC_DEV_TEST_MODE=true` to `.env.local` and restart.
4. **Always restart the dev server** after changing `.env.local` (Next.js doesn't hot-reload env vars).
5. **The `.next/` directory exists** from a previous build. If you encounter mysterious errors, try `rm -rf .next && npm run dev`.
6. **The old handoff docs** (`CURRENT_HANDOFF.md`, `HANDOFF.md`) contain useful history but reference the old `study1` path. This `HANDOFF_CURRENT.md` is authoritative.
7. **`study1.db-shm` and `study1.db-wal`** files exist — these are SQLite WAL files, not separate databases. Don't delete them while the server is running.
8. **When modifying experiment flow**: Always check `src/lib/stages.ts` first — it's the single source of truth for stage order.
9. **When adding new stimuli**: Upload via admin UI at `/admin/stimuli`, or place files in `storage/stimuli/` + copy to `public/stimuli/` + re-seed.
10. **Before collecting real data**: Verify CSV exports include all needed fields, run a full E2E walkthrough, back up `study1.db`.
