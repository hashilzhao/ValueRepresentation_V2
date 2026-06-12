/**
 * Calibration Orchestrator — single source of truth for phase progression.
 *
 * Eliminates the duplicated phase-generation logic previously in:
 *   - src/app/experiment/page.tsx (ensureCalibrationPhases)
 *   - src/app/api/study1/calibration/init/route.ts
 *   - src/app/api/study1/calibration/submit/route.ts
 *
 * Flow: 4A → 4B-R1 → [4B-R2?] → 4C-a → 4C-b → [4C-c?] → finalize
 */

import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { initializeStudy1StimulusAssignment } from "./sampling";
import {
  generateWithinFullPairTrials,
  generateWithinAdjacentRetestRound1,
  generateWithinAdjacentRetestRound2,
  generateCrossSetAnchorMidTrials,
  generateCrossSetAnchorLowHighTrials,
  generateCrossSetAdaptiveTrials,
  inferWithinSetRanks,
  buildWithinSetStableTable,
  buildCrossSetOrthogonalizedTable,
  loadSetMembers,
} from "./calibration-generator";
import {
  getCalibrationAttemptIndex,
  saveWithinSetStableTable,
  saveCrossSetOrthogonalizedTable,
  syncLikingMapFromElo,
  saveCalibrationResponse,
} from "./calibration-scoring";
import {
  computeAllPhaseElo,
  saveEloScores,
  loadEloScores,
  rankWithinSetByElo,
} from "./elo";
import { detectAnomalies } from "./anomaly-detection";
import { computeStability, saveStability } from "./stability-validation";
import { nextStage } from "@/lib/stages";
import type { Stage } from "@/lib/stages";
import type {
  CalibrationPhase,
  CalibrationResponse,
  PhaseState,
  PhaseTransition,
  SetStimulus,
} from "./calibration-types";
import crypto from "crypto";

export class CalibrationOrchestrator {
  private sessionId: string;
  private participantId: string;
  private attemptIndex: number;
  private db: ReturnType<typeof getDb>;

  constructor(sessionId: string, participantId: string) {
    this.sessionId = sessionId;
    this.participantId = participantId;
    this.db = getDb();
    this.attemptIndex = getCalibrationAttemptIndex(sessionId);
  }

  // ═════════════════════════════════════════════════════════════
  // ensurePhases — called by page.tsx and calibration/init route
  // ═════════════════════════════════════════════════════════════

  /** Ensure all needed phases are generated. Idempotent. */
  ensurePhases(): PhaseState {
    // Ensure stimulus assignment exists.
    initializeStudy1StimulusAssignment(this.sessionId);

    // Check each phase in order and generate if missing.
    const state = this.getCurrentState();

    if (state.phase === "within_full_pair" && state.completed_trials < state.total_trials) {
      return state;
    }

    // 4A done → check 4B-R1
    if (this.isPhaseComplete("within_full_pair")) {
      if (!this.phaseExists("within_adjacent_retest")) {
        this.generate4BRound1();
      }
      const r1State = this.getCurrentState();
      if (!this.isPhaseComplete("within_adjacent_retest")) return r1State;

      // 4B-R1 done → check if R2 needed
      if (!this.phaseExists("within_adjacent_retest_r2")) {
        const r2Generated = this.generate4BRound2IfNeeded();
        if (!r2Generated) {
          // No R2 needed → build stable table, advance to 4C
          this.buildAndSaveStableTable();
          this.generate4Ca();
        }
      }
      if (this.phaseExists("within_adjacent_retest_r2") && !this.isPhaseComplete("within_adjacent_retest_r2")) {
        return this.getCurrentState();
      }

      // 4B-R2 done → build stable table, advance to 4C
      if (this.isPhaseComplete("within_adjacent_retest_r2") && !this.phaseExists("cross_set_anchor_mid")) {
        this.buildAndSaveStableTable();
        this.generate4Ca();
      }
      if (this.phaseExists("cross_set_anchor_mid")) {
        if (!this.isPhaseComplete("cross_set_anchor_mid")) return this.getCurrentState();
        // 4C-a done → generate 4C-b
        if (!this.phaseExists("cross_set_anchor_low")) {
          this.generate4Cb();
        }
        if (!this.isPhaseComplete("cross_set_anchor_low") || !this.isPhaseComplete("cross_set_anchor_high")) {
          return this.getCurrentState();
        }
        // 4C-b done → check anomalies → maybe 4C-c
        if (!this.phaseExists("cross_set_adaptive")) {
          const generated = this.generate4CcIfNeeded();
          if (!generated) return { phase: "complete", total_trials: 0, completed_trials: 0, attempt_index: this.attemptIndex };
        }
        if (this.phaseExists("cross_set_adaptive") && !this.isPhaseComplete("cross_set_adaptive")) {
          return this.getCurrentState();
        }
        // All complete.
        return { phase: "complete", total_trials: 0, completed_trials: 0, attempt_index: this.attemptIndex };
      }

      // 4B complete without R2 and 4C hasn't been generated yet.
      if (!this.phaseExists("cross_set_anchor_mid") && !this.phaseExists("within_adjacent_retest_r2")) {
        // If 4B-R1 done but no R2 and no 4C yet, generate 4C directly.
        this.buildAndSaveStableTable();
        this.generate4Ca();
      }
    }

    return this.getCurrentState();
  }

  // ═════════════════════════════════════════════════════════════
  // handlePhaseCompleted — called by calibration/submit route
  // ═════════════════════════════════════════════════════════════

  /**
   * Handle a phase completion event. May trigger generation of next phase.
   * Returns the transition info for the API response.
   */
  handlePhaseCompleted(phase: CalibrationPhase): PhaseTransition {
    const transition: PhaseTransition = {
      phase_completed: phase,
      next_phase: null,
      next_phase_trials: 0,
    };

    switch (phase) {
      case "within_full_pair":
        this.generate4BRound1();
        transition.next_phase = "within_adjacent_retest";
        transition.next_phase_trials = this.getPhaseCount("within_adjacent_retest");
        break;

      case "within_adjacent_retest": {
        const r2Generated = this.generate4BRound2IfNeeded();
        if (r2Generated) {
          transition.next_phase = "within_adjacent_retest_r2";
          transition.next_phase_trials = this.getPhaseCount("within_adjacent_retest_r2");
        } else {
          this.buildAndSaveStableTable();
          this.generate4Ca();
          transition.next_phase = "cross_set_anchor_mid";
          transition.next_phase_trials = this.getPhaseCount("cross_set_anchor_mid");
        }
        break;
      }

      case "within_adjacent_retest_r2":
        this.buildAndSaveStableTable();
        this.generate4Ca();
        transition.next_phase = "cross_set_anchor_mid";
        transition.next_phase_trials = this.getPhaseCount("cross_set_anchor_mid");
        break;

      case "cross_set_anchor_mid":
        this.generate4Cb();
        transition.next_phase = "cross_set_anchor_low";
        transition.next_phase_trials = this.getPhaseCount("cross_set_anchor_low");
        break;

      case "cross_set_anchor_low":
        // Both low and high are generated together; check if both done.
        if (this.isPhaseComplete("cross_set_anchor_low") && this.isPhaseComplete("cross_set_anchor_high")) {
          this.updateEloAfter4Cab();
          const generated = this.generate4CcIfNeeded();
          if (generated) {
            transition.next_phase = "cross_set_adaptive";
            transition.next_phase_trials = this.getPhaseCount("cross_set_adaptive");
          } else {
            transition.next_phase = "complete";
          }
        }
        break;

      case "cross_set_anchor_high":
        if (this.isPhaseComplete("cross_set_anchor_low") && this.isPhaseComplete("cross_set_anchor_high")) {
          this.updateEloAfter4Cab();
          const generated = this.generate4CcIfNeeded();
          if (generated) {
            transition.next_phase = "cross_set_adaptive";
            transition.next_phase_trials = this.getPhaseCount("cross_set_adaptive");
          } else {
            transition.next_phase = "complete";
          }
        }
        break;

      case "cross_set_adaptive":
        transition.next_phase = "complete";
        break;

      default:
        break;
    }

    return transition;
  }

  // ═════════════════════════════════════════════════════════════
  // finalize — called when all phases complete
  // ═════════════════════════════════════════════════════════════

  finalize(): { nextStage: Stage | null; stability: ReturnType<typeof computeStability> } {
    const db = this.db;

    // Save Elo scores to stimulus_elo table.
    const bySet = loadSetMembers(this.sessionId);
    const allPhases = [
      "within_full_pair", "within_adjacent_retest", "within_adjacent_retest_r2",
      "cross_set_anchor_mid", "cross_set_anchor_low", "cross_set_anchor_high",
      "cross_set_adaptive",
    ];
    const eloMap = computeAllPhaseElo(this.sessionId, allPhases);
    saveEloScores(this.sessionId, this.participantId, this.attemptIndex, eloMap, bySet);

    // Build and save cross-set orthogonalized table.
    saveCrossSetOrthogonalizedTable(this.sessionId, this.participantId, this.attemptIndex);

    // Sync liking_map from Elo.
    syncLikingMapFromElo(this.sessionId, this.participantId, this.attemptIndex);

    // Compute and save stability.
    const stability = computeStability(this.sessionId, this.participantId, this.attemptIndex);
    saveStability(stability);

    // Log completion.
    logEvent(this.sessionId, this.participantId, "study1_liking_calibration_completed", {
      attempt: this.attemptIndex,
      stability_grade: stability.stability_grade,
      phases_completed: allPhases,
    });

    // Advance stage.
    const session = db
      .prepare("SELECT current_stage FROM experiment_sessions WHERE id = ?")
      .get(this.sessionId) as { current_stage: string };
    const next = nextStage(session.current_stage as Stage);
    if (next) {
      db.prepare("UPDATE experiment_sessions SET current_stage = ? WHERE id = ?")
        .run(next, this.sessionId);
      logEvent(this.sessionId, this.participantId, "stage.advanced", {
        from: session.current_stage, to: next,
      });
    }

    // Build liking_map (already done via syncLikingMapFromElo).
    return { nextStage: next, stability };
  }

  // ═════════════════════════════════════════════════════════════
  // Private helpers
  // ═════════════════════════════════════════════════════════════

  private getCurrentState(): PhaseState {
    const db = this.db;
    const phases: CalibrationPhase[] = [
      "within_full_pair", "within_adjacent_retest", "within_adjacent_retest_r2",
      "cross_set_anchor_mid", "cross_set_anchor_low", "cross_set_anchor_high",
      "cross_set_adaptive",
    ];

    for (const phase of phases) {
      const total = db.prepare(
        "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = ?"
      ).get(this.sessionId, phase) as { cnt: number };
      if (total.cnt === 0) continue;

      const done = db.prepare(
        `SELECT COUNT(*) AS cnt FROM calibration_responses cr
         JOIN calibration_trials ct ON ct.id = cr.trial_id
         WHERE cr.session_id = ? AND ct.phase = ?`
      ).get(this.sessionId, phase) as { cnt: number };

      if (done.cnt < total.cnt) {
        const round = phase === "within_adjacent_retest_r2" ? 2 : phase === "within_adjacent_retest" ? 1 : undefined;
        return {
          phase,
          total_trials: total.cnt,
          completed_trials: done.cnt,
          round,
          attempt_index: this.attemptIndex,
        };
      }
    }

    // Check if all phases exist and are complete.
    const totalAll = db.prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ?"
    ).get(this.sessionId) as { cnt: number };
    const doneAll = db.prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_responses WHERE session_id = ?"
    ).get(this.sessionId) as { cnt: number };

    if (totalAll.cnt > 0 && doneAll.cnt >= totalAll.cnt) {
      return { phase: "complete", total_trials: totalAll.cnt, completed_trials: doneAll.cnt, attempt_index: this.attemptIndex };
    }

    // Nothing exists yet → generate 4A.
    this.generate4A();
    return this.getCurrentState();
  }

  private isPhaseComplete(phase: string): boolean {
    const db = this.db;
    const total = (db.prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = ?"
    ).get(this.sessionId, phase) as { cnt: number }).cnt;
    if (total === 0) return false;
    const done = (db.prepare(
      `SELECT COUNT(*) AS cnt FROM calibration_responses cr
       JOIN calibration_trials ct ON ct.id = cr.trial_id
       WHERE cr.session_id = ? AND ct.phase = ?`
    ).get(this.sessionId, phase) as { cnt: number }).cnt;
    return done >= total;
  }

  private phaseExists(phase: string): boolean {
    const cnt = (this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = ?"
    ).get(this.sessionId, phase) as { cnt: number }).cnt;
    return cnt > 0;
  }

  private getPhaseCount(phase: string): number {
    return (this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM calibration_trials WHERE session_id = ? AND phase = ?"
    ).get(this.sessionId, phase) as { cnt: number }).cnt;
  }

  // ── Phase generators ──────────────────────────────────────

  private generate4A(): void {
    const trials = generateWithinFullPairTrials(this.sessionId, this.participantId);
    this.insertTrials(trials);
    logEvent(this.sessionId, this.participantId, "calibration_4a_initialized", {
      total: trials.length, attempt: this.attemptIndex,
    });
  }

  private generate4BRound1(): void {
    const ranks4A = inferWithinSetRanks(this.sessionId);
    const trials = generateWithinAdjacentRetestRound1(
      this.sessionId, this.participantId,
      ranks4A.map((r) => ({ stim_id: r.stim_id, set_id: r.set_id, rank: r.rank })),
    );
    this.insertTrials(trials);
    logEvent(this.sessionId, this.participantId, "calibration_4b_r1_initialized", {
      total: trials.length, attempt: this.attemptIndex,
    });
  }

  private generate4BRound2IfNeeded(): boolean {
    // Compute Elo from 4A + 4B-R1.
    const eloMap = computeAllPhaseElo(this.sessionId, ["within_full_pair", "within_adjacent_retest"]);
    const bySet = loadSetMembers(this.sessionId);
    const trials = generateWithinAdjacentRetestRound2(this.sessionId, this.participantId, eloMap, bySet);
    if (!trials) return false;
    this.insertTrials(trials);
    logEvent(this.sessionId, this.participantId, "calibration_4b_r2_initialized", {
      total: trials.length, attempt: this.attemptIndex,
    });
    return true;
  }

  private generate4Ca(): void {
    const stableRows = this.db.prepare(
      "SELECT stim_id, set_id, final_stable_rank FROM within_set_stable WHERE session_id = ? AND calibration_attempt_index = ?"
    ).all(this.sessionId, this.attemptIndex) as { stim_id: string; set_id: string; final_stable_rank: number }[];
    const trials = generateCrossSetAnchorMidTrials(this.sessionId, this.participantId, stableRows);
    if (trials.length > 0) {
      this.insertTrials(trials);
      logEvent(this.sessionId, this.participantId, "calibration_4ca_initialized", {
        total: trials.length, attempt: this.attemptIndex,
      });
    }
  }

  private generate4Cb(): void {
    const stableRows = this.db.prepare(
      "SELECT stim_id, set_id, final_stable_rank FROM within_set_stable WHERE session_id = ? AND calibration_attempt_index = ?"
    ).all(this.sessionId, this.attemptIndex) as { stim_id: string; set_id: string; final_stable_rank: number }[];
    const trials = generateCrossSetAnchorLowHighTrials(this.sessionId, this.participantId, stableRows);
    if (trials.length > 0) {
      this.insertTrials(trials);
      logEvent(this.sessionId, this.participantId, "calibration_4cb_initialized", {
        total: trials.length, attempt: this.attemptIndex,
      });
    }
  }

  private generate4CcIfNeeded(): boolean {
    const anomalies = detectAnomalies(this.sessionId, this.attemptIndex);
    if (!anomalies.has_anomalies) return false;

    const eloMap = loadEloScores(this.sessionId, this.attemptIndex);
    const trials = generateCrossSetAdaptiveTrials(
      this.sessionId, this.participantId,
      anomalies.flagged_stimuli, eloMap,
    );
    if (trials.length === 0) return false;

    this.insertTrials(trials);
    logEvent(this.sessionId, this.participantId, "calibration_4cc_initialized", {
      total: trials.length, anomaly_details: anomalies.anomaly_details, attempt: this.attemptIndex,
    });
    return true;
  }

  private updateEloAfter4Cab(): void {
    const bySet = loadSetMembers(this.sessionId);
    const phases = [
      "within_full_pair", "within_adjacent_retest", "within_adjacent_retest_r2",
      "cross_set_anchor_mid", "cross_set_anchor_low", "cross_set_anchor_high",
    ];
    const eloMap = computeAllPhaseElo(this.sessionId, phases);
    saveEloScores(this.sessionId, this.participantId, this.attemptIndex, eloMap, bySet);
  }

  private buildAndSaveStableTable(): void {
    saveWithinSetStableTable(this.sessionId, this.participantId, this.attemptIndex);
    // Also save Elo scores after building stable table.
    const bySet = loadSetMembers(this.sessionId);
    const eloMap = computeAllPhaseElo(this.sessionId, [
      "within_full_pair", "within_adjacent_retest", "within_adjacent_retest_r2",
    ]);
    saveEloScores(this.sessionId, this.participantId, this.attemptIndex, eloMap, bySet);
  }

  // ── Trial insertion ───────────────────────────────────────

  private insertTrials(trials: import("./calibration-types").CalibrationTrial[]): void {
    const db = this.db;
    const maxIdx = (db.prepare(
      "SELECT MAX(trial_index) AS mx FROM calibration_trials WHERE session_id = ?"
    ).get(this.sessionId) as { mx: number }).mx;

    const insert = db.prepare(`
      INSERT INTO calibration_trials
        (id, session_id, participant_id, phase, trial_index,
         left_stim_id, right_stim_id, left_set_id, right_set_id,
         left_preliminary_rank, right_preliminary_rank,
         expected_choice, left_image_url, right_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();

    db.transaction(() => {
      for (let i = 0; i < trials.length; i++) {
        const t = trials[i];
        insert.run(
          t.id, t.session_id, t.participant_id, t.phase, maxIdx + 1 + i,
          t.left_stim_id, t.right_stim_id, t.left_set_id, t.right_set_id,
          t.left_rank_before, t.right_rank_before,
          t.expected_choice, t.left_image_url, t.right_image_url, now,
        );
      }
    })();
  }
}

// ─── Convenience: thin wrapper for saveCalibrationResponse ──────

export function submitCalibrationResponse(input: CalibrationResponse): {
  phaseCompleted: string | null;
  totalInPhase: number;
  doneInPhase: number;
} {
  return saveCalibrationResponse(input);
}
