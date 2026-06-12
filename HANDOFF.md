# Study 1 — Handoff Brief

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16.2.6** (App Router, Turbopack) |
| Language | **TypeScript 5** |
| Styling | **Tailwind CSS v4** |
| Database | **better-sqlite3** (local file: `study1.db` in project root) |
| Auth | **JWT + bcryptjs** — cookie-based, no external auth provider |
| Image Storage | **Local filesystem** — `storage/stimuli/` symlinked to `public/stimuli/` |
| Deployment | **Vercel-ready** but currently local-only |
| Start Command | `cd ~/Desktop/study1 && npm run dev` → `http://localhost:3000` |

Admin credentials (in `.env.local`):
- Email: `admin@study1.local`
- Password: `zxzx123456`

DEV_TEST_MODE is currently **enabled** (`NEXT_PUBLIC_DEV_TEST_MODE=true` in `.env.local`). Remove this line for full experimental mode.

---

## 2. Implemented Experiment Flow

### Canonical stage order (10 stages)

| # | Stage | Participant Title | Status |
|---|---|---|---|
| 1 | `baseline_questionnaire` | Task Preparation | **Placeholder** — shows text, Continue button |
| 2 | `relative_resource_feedback` | Resource Profile | **Implemented** — shows scarcity/abundance feedback text based on internal group |
| 3 | `scarcity_manipulation` | Resource Task | **Implemented** — 90 perceptual trials (3×30), dot comparison / shape matching / dot estimation, preset resource feedback, mini block checks |
| 4 | `study1_liking_ranking` | 视觉偏好任务 | **Implemented** — pairwise F/J liking calibration (50 Phase 1 + 30 Phase 2 = 80 trials, 16 in DEV mode), liking_map inferred from win-count |
| 5 | `study1_liking_validation` | 视觉偏好确认 | **Partially implemented** — pairwise validation trials against liking_map, quality metrics |
| 6 | `study1_value_assignment` | 价值点数说明 | **Implemented** — rotating Latin-square value assignment (5/10/15/20/25), comprehension check |
| 7 | `study1_formal_choice` | 图像选择任务 | **Implemented** — 144 trials (48 conflict / 32 congruent / 32 liking_only / 32 value_only), F/J choice with value labels |
| 8 | `manipulation_check` | 任务体验问卷 | **Implemented** — 14 Likert items (Chinese), 4 constructs, suspicion flag |
| 9 | `post_experiment_check` | 实验后问题 | **Implemented** — suspicion/deception check, free-text + MCQ, session → completed |
| 10 | `complete` | Complete | **Implemented** — thank-you page |

### Admin pages

| Page | Route | Status |
|---|---|---|
| Dashboard | `/admin` | **Implemented** — participant counts, group counts, MC group-level summary |
| Participants | `/admin/participants` | **Implemented** — table with code, group, stage, status |
| Sessions | `/admin/sessions` | **Implemented** — detailed table with progress, balance, accuracy, RT, MC means |
| Stimuli | `/admin/stimuli` | **Implemented** — 80-image thumbnail grid, upload, metadata edit (risk, usable, notes) |
| Study 1 | `/admin/study1` | **Implemented** — per-session assignment view, thumbnails, 5 sets, diagnostics |
| Results | `/admin/results` | **Implemented** — group-level + per-participant metrics, CSV export buttons, model-placeholder cards |
| CSV Export | `/api/admin/export?type=...` | **Implemented** — 3 export types: choice_responses, participant_summary, stimulus_value_map |

---

## 3. File Map

### Core infrastructure

```
.env.local                      — JWT secret, admin credentials, DEV_TEST_MODE flag
src/lib/auth/index.ts           — JWT sign/verify, password hash, cookie set/clear
src/lib/db/index.ts             — SQLite singleton, all CREATE TABLE statements, auto-seed stimuli
src/lib/db/event-log.ts         — logEvent(sessionId, participantId, type, data?) helper
src/lib/types/database.ts       — TypeScript types: Participant, ExperimentSession, EventLog
src/lib/stages.ts                — STAGES array (canonical order), STAGE_LABELS (admin), PARTICIPANT_STAGE_TITLES (participant), FEEDBACK_TEXT, nextStage()
src/proxy.ts                     — Route protection for /admin/* (JWT check, redirect to /login)
src/middleware.ts                — (deprecated, superseded by proxy.ts)
```

### Participant-facing pages (App Router)

```
src/app/page.tsx                    — / landing page (Admin Login / Participant Entrance)
src/app/layout.tsx                  — root layout
src/app/start/page.tsx              — /start participant registration form
src/app/experiment/page.tsx         — /experiment — MAIN STAGE ROUTER, renders stage-specific components
src/app/login/page.tsx              — /login admin login form
src/app/complete/page.tsx           — /complete thank-you page
```

### Participant-facing components

```
src/components/ParticipantForm.tsx       — registration form (code validation, consent)
src/components/ExperimentControls.tsx    — generic Continue button for placeholder stages
src/components/StageGameTask.tsx         — Resource Task: perceptual trials (fixation→stimulus→feedback→blank), F/J responses, mini block checks
src/components/PreferenceTask.tsx        — Liking calibration: pairwise image comparison (F/J), Phase 1→2 auto-transition, liking_map building
src/components/ValidationTask.tsx        — Liking validation: pairwise comparison against inferred ranks
src/components/FormalChoiceTask.tsx      — Formal choice: two images + value labels, F/J, 5000ms timeout
src/components/ValueInstructionTask.tsx  — Value instruction + comprehension MCQ
src/components/TaskSurvey.tsx            — 14-item manipulation check (Chinese Likert)
src/components/PostExperimentCheck.tsx   — Post-experiment suspicion check
```

### Admin components

```
src/components/AdminNav.tsx              — admin navigation bar
src/components/StatCard.tsx              — dashboard stat card
src/components/DeleteButton.tsx          — delete participant/session button
```

### Study 1 core library

```
src/lib/stages.ts                        — stage definitions, labels, config
src/lib/stimulus-seed.ts                — seedStimulusPool() — scans storage/stimuli/, upserts into stimulus_pool
src/lib/study1/sampling.ts              — initializeStudy1StimulusAssignment(): sample 25, 5×5 sets, hidden set construction with hard constraints
src/lib/study1/calibration-generator.ts — Phase 1: generateWithinSetCalibrationTrials(), Phase 2: generateCrossSetCalibrationTrials(), inferPreliminaryLikingMap()
src/lib/study1/calibration-scoring.ts   — saveCalibrationResponse(), buildFinalLikingMap(), computeCalibrationQuality()
src/lib/study1/value-assignment.ts      — assignExternalValues() (rotating pattern), buildStimulusValueMap()
src/lib/study1/formal-trial-generator.ts — generateFormalChoiceTrials(): 4 trial types, classifyPair(), balancePositions(), trialSummary()
src/lib/study1/formal-response.ts       — saveChoiceResponse(), codeChoiceResponse()
src/lib/study1/calibration-types.ts     — TypeScript types for calibration
src/lib/manipulation-check/items.ts     — 14 Chinese Likert items + construct mapping
src/lib/manipulation-check/scoring.ts   — computeConstructMeans(), saveConstructMeans()
src/lib/stage-game/config.ts            — Resource Task config, DEV_TEST_MODE settings
src/lib/stage-game/trial-generator.ts   — generateStageGameTrials(), generateFeedbackSchedule(), stimulus generators
src/lib/stage-game/response.ts          — saveStageGameResponse()
src/lib/stage-game/progress.ts          — calculateStageGameProgress()
```

### API routes

```
src/app/api/auth/login/route.ts              — POST admin login → JWT cookie
src/app/api/auth/logout/route.ts             — POST clear cookie
src/app/api/participants/register/route.ts   — POST register participant + create session + balanced group assignment
src/app/api/sessions/advance/route.ts        — POST advance current_stage to nextStage(), log event
src/app/api/stage-game/init/route.ts         — POST generate stage_game_trials (idempotent)
src/app/api/stage-game/submit-response/route.ts  — POST save stage_game_response + update balance
src/app/api/stage-game/block-check/route.ts  — POST save mini block manipulation check
src/app/api/study1/init-assignment/route.ts  — POST sample 25 stimuli + construct 5 hidden sets
src/app/api/study1/calibration/init/route.ts — POST generate calibration_trials (idempotent, Phase 1→2)
src/app/api/study1/calibration/submit/route.ts — POST save calibration_response + auto-phase transition
src/app/api/study1/validation/init/route.ts  — POST generate liking_validation_trials from liking_map
src/app/api/study1/validation/submit/route.ts — POST save validation_response + compute quality + advance
src/app/api/study1/value-assignment/init/route.ts — POST assign external values + build stimulus_value_map
src/app/api/study1/comprehension-check/route.ts — POST save value comprehension attempt + advance
src/app/api/study1/formal-trials/init/route.ts — POST generate formal_trials (idempotent)
src/app/api/study1/formal-choice/submit/route.ts — POST save choice_response + auto-complete
src/app/api/study1/post-experiment-check/route.ts — POST save post-experiment check + complete session
src/app/api/admin/delete-participant/route.ts — POST delete participant + cascade
src/app/api/admin/delete-session/route.ts — POST delete session + cascade
src/app/api/admin/export/route.ts — GET CSV export (3 types, JWT-protected)
src/app/api/admin/stimuli/upload/route.ts — POST upload stimulus image
src/app/api/admin/stimuli/update/route.ts — PATCH edit stimulus metadata
```

### Admin pages (App Router)

```
src/app/admin/page.tsx                       — /admin dashboard
src/app/admin/participants/page.tsx          — /admin/participants
src/app/admin/sessions/page.tsx              — /admin/sessions
src/app/admin/stimuli/page.tsx               — /admin/stimuli
src/app/admin/stimuli/StimulusGrid.tsx       — stimulus thumbnail grid + inline edit
src/app/admin/study1/page.tsx                — /admin/study1 (session assignment detail + diagnostics)
src/app/admin/results/page.tsx               — /admin/results (behavioral metrics + export)
```

### Seed / scripts

```
scripts/seed-stimuli.ts              — CLI: npm run seed-stimuli (auto-runs on first getDb() if pool empty)
storage/stimuli/                     — 80 PNG images (A1–A20, B1–B20, C1–C20, D1–D20)
public/stimuli/                      — symlink → storage/stimuli (served by Next.js)
```

---

## 4. Database Schema

All tables use TEXT primary keys (UUIDs). SQLite via `better-sqlite3` in WAL mode.

### Core session tables

| Table | Key columns | Purpose |
|---|---|---|
| `participants` | id, participant_code (unique), age, gender, major, consented, status | Self-registered participant info |
| `experiment_sessions` | id, participant_id (FK), group_label (scarcity/abundance), current_stage, status, resource_balance, random_seed, started_at, completed_at | One session per participant, tracks stage progression |
| `event_logs` | id, session_id (FK), participant_id (FK), event_type, event_data (JSON), created_at | Immutable audit trail — every participant action logged |

### Stimulus tables

| Table | Key columns | Purpose |
|---|---|---|
| `stimulus_pool` | id, stim_id (e.g. A1), image_url, visual_category (A/B/C/D), complexity_level, regularity_level, semantic_risk, usable, width_px, height_px | 80-image master pool, seeded from `storage/stimuli/` |
| `subject_selected_stimuli` | id, session_id (FK), stim_id, stimulus_pool_id (FK), image_url, visual_category, selection_order | 25 images randomly sampled per session |
| `subject_set_assignment` | id, session_id (FK), set_id (set_1–set_5), stim_id, stimulus_pool_id (FK), image_url, position_in_set | 5 hidden sets × 5 images per session, hard constraint: each set has all 4 categories (1/1/1/2) |

### Stage-game / Resource Task tables

| Table | Key columns | Purpose |
|---|---|---|
| `stage_game_trials` | id, session_id (FK), block_index, trial_index, global_trial_index, task_type, stimulus_payload (JSON), correct_answer, preset_feedback_direction, preset_feedback_points, planned_balance_after | 90 pre-generated perceptual trials per session |
| `stage_game_responses` | id, session_id (FK), trial_index, response, accuracy, rt_ms, missed_response, timeout, preset_feedback_direction, preset_feedback_points, balance_before, balance_after | One row per trial response |
| `block_manipulation_checks` | id, session_id (FK), block_index, resource_insufficient, resource_confident, stressed, engaged | 4-item mini check after each Resource Task block |

### Liking calibration tables

| Table | Key columns | Purpose |
|---|---|---|
| `calibration_trials` | id, session_id (FK), phase (within_set/cross_set_same_rank/cross_set_near_rank/cross_set_anchor), trial_index, left_stim_id, right_stim_id, left_set_id, right_set_id, left_preliminary_rank, right_preliminary_rank, expected_choice, left_image_url, right_image_url | Phase 1: 50 within-set pairs + Phase 2: 30 cross-set pairs per session |
| `calibration_responses` | id, session_id (FK), trial_id (FK), phase, response_side, chosen_stim_id, rt_ms, timeout, consistent | One row per pairwise response |
| `liking_map` | id, session_id (FK), set_id, stim_id, stimulus_pool_id (FK), preliminary_liking_rank, final_liking_rank (1–5), win_count_within_set, total_pairwise_wins, total_pairwise_losses, preference_score, tie_flag | 25 entries per session — ranks inferred from pairwise choices |
| `calibration_quality` | id, session_id (FK), within_set_consistency, cross_set_anchor_consistency, cross_set_near_rank_consistency, timeout_rate, mean_rt_ms | Session-level calibration quality metrics |

### Liking validation tables

| Table | Key columns | Purpose |
|---|---|---|
| `liking_validation_trials` | id, session_id (FK), trial_index, validation_type (different_rank/same_rank), left_stim_id, right_stim_id, left_liking_rank, right_liking_rank, expected_choice | ≥45 pairwise validation trials per session |
| `liking_validation_responses` | id, session_id (FK), trial_id (FK), response_side, chosen_stim_id, rt_ms, timeout, consistent_with_ranking | One row per validation response |
| `liking_validation_quality` | id, session_id (FK), different_rank_consistency_rate, same_rank_bias_flag, needs_rerank, validation_passed | If consistency < 85%, sets `needs_rerank = true` |

### Value assignment tables

| Table | Key columns | Purpose |
|---|---|---|
| `value_assignment` | id, session_id (FK), set_id, external_value (5/10/15/20/25), assignment_pattern_index | Rotating value assignment per set |
| `stimulus_value_map` | id, session_id (FK), set_id, stim_id, stimulus_pool_id (FK), final_liking_rank, external_value, image_url | 25 entries — links each stimulus to its set's external value |

### Formal choice tables

| Table | Key columns | Purpose |
|---|---|---|
| `formal_trials` | id, session_id (FK), trial_index, trial_type (liking_only/value_only/congruent/conflict), left_stim_id, right_stim_id, left_liking_rank, right_liking_rank, left_external_value, right_external_value, delta_liking, delta_value, high_liking_side, high_value_side, congruent_side, conflict_high_value_side | 144 pre-generated formal choice trials per session |
| `choice_responses` | id, session_id (FK), formal_trial_id (FK), trial_index, trial_type, response_side, chosen_stim_id, chosen_liking_rank, chosen_external_value, rt_ms, timeout, chose_high_liking, chose_high_value, chose_congruent_advantage | One row per choice response |

### Manipulation & post-experiment tables

| Table | Key columns | Purpose |
|---|---|---|
| `manipulation_check_responses` | id, session_id (FK), item_id, construct, item_text, response_value (1–7) | 14 Chinese Likert items |
| `manipulation_check_summary` | session_id (PK, FK), resource_insufficiency_mean, resource_confidence_mean, stress_negative_affect_mean, task_engagement_mean | Construct means per session |
| `value_comprehension_checks` | id, session_id (FK), attempt, selected_answer, correct | Value comprehension MCQ attempts |
| `post_experiment_checks` | id, session_id (FK), performance_feedback_belief, preset_feedback_suspicion, resource_task_influence_belief, perceived_study_purpose_text, main_choice_strategy, unusual_or_unrealistic_text, suspicion_flag | Final suspicion/debrief check |
| `liking_rankings` | (legacy — created but unused with current pairwise flow) | |

---

## 5. Current Bug List

### Bug 1: DEV_TEST_MODE enabled by default
- **Where**: `.env.local` line 7
- **Reproduction**: Start server → Resource Task shows 6 trials instead of 90
- **Expected**: Full mode (90 trials) should be default
- **Actual**: DEV_TEST_MODE=true is set, producing 6-trial Resource Task, 16-trial calibration, 18-trial formal choice
- **Fix**: Remove `NEXT_PUBLIC_DEV_TEST_MODE=true` from `.env.local`

### Bug 2: ExperimentControls Continue button may stick on "Please wait…"
- **Where**: `src/components/ExperimentControls.tsx`
- **Reproduction**: Click Continue on a placeholder stage (e.g., Task Preparation)
- **Expected**: Button shows "Continue", click → advance → next stage renders
- **Actual**: `router.push()` to same route kept component mounted with `loading=true`
- **Fix status**: Fixed — changed to `window.location.href` + 5-second safety timeout

### Bug 3: PreferenceTask may not auto-init calibration on first load
- **Where**: `src/components/PreferenceTask.tsx`
- **Reproduction**: Reach 视觉偏好任务 stage with no calibration trials
- **Expected**: Auto-initialize calibration trials and reload
- **Actual**: If `initCalibration()` API call fails, shows generic error
- **Mitigation**: Try refresh; the component calls init APIs on mount

### Bug 4: `router.push()` vs `window.location.href` inconsistency
- **Where**: Multiple components (ExperimentControls, PreferenceTask, FormalChoiceTask)
- **Issue**: `router.push()` to the same route preserves component state in Next.js 16, causing stale `loading` states and skipped trials
- **Fix status**: Fixed in ExperimentControls, PreferenceTask, FormalChoiceTask — all now use `window.location.href`

### Bug 5: Stimulus pool auto-seed on fresh DB
- **Where**: `src/lib/db/index.ts` → `autoSeedStimuli()`
- **Issue**: If `study1.db` is deleted, stimuli must be re-seeded. The auto-seed function calls `seedStimulusPool()` on first `getDb()` call.
- **Status**: Fixed — auto-seeds from `storage/stimuli/` if pool is empty

---

## 6. Implementation Risks

### Participant blinding
- Internal labels (scarcity, abundance, group, condition, set_id, visual_category, liking_rank, trial_type, delta_liking, delta_value, manipulation) must never appear in participant-facing HTML
- **Status**: Multiple rounds of leak-checking applied. Component names (e.g., `CalibrationTask` → `PreferenceTask`) were renamed to avoid leaking in RSC payloads.

### Stimulus sampling
- 25 stimuli randomly sampled per session from the 80-image stimulus_pool
- Divided into 5 hidden sets × 5 images
- Each set must contain all 4 visual categories (A/B/C/D) with 1/1/1/2 structure
- **Status**: `buildDuplicatePlan()` enforces hard constraint. Error thrown if <5 usable stimuli in any category.

### Liking ranks from pairwise choices
- Ranks are INFERRED from pairwise F/J choices, NOT directly assigned by participant
- Win-count within each set → ranking 1–5 (rank 1 = least liked, rank 5 = most liked)
- **DEV_TEST_MODE risk**: Pseudo-ranks may be auto-filled for uncalibrated sets. This must NOT happen in full mode.

### Value assignment counterbalancing
- Rotating Latin-square-like pattern: session_index % 5 → offset
- Values [5, 10, 15, 20, 25] rotated across set_1–set_5
- **Status**: Implemented in `assignExternalValues()`.

### Formal choice trials
- 144 trials MUST use only stimuli from the session's `stimulus_value_map`
- 4 trial types: conflict (48), congruent (32), liking_only (32), value_only (32)
- Left/right positions balanced
- **Status**: `generateFormalChoiceTrials()` reads from `stimulus_value_map`, rejects outside stimuli.

### Cross-set validation
- Phase 2 calibration trials depend on Phase 1 preliminary ranks
- If Phase 1 responses are incomplete, Phase 2 cannot be generated
- **Status**: Phase 2 auto-generated when Phase 1 completes (in submit API). Script-triggered, not user-visible.
