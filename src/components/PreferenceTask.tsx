"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

// ─── Types ─────────────────────────────────────────────────

interface TrialData {
  id: string;
  phase: string;
  trial_index: number;
  left_stim_id: string;
  right_stim_id: string;
  left_image_url: string;
  right_image_url: string;
  left_set_id: string;
  right_set_id: string;
  left_preliminary_rank: number | null;
  right_preliminary_rank: number | null;
  expected_choice: string | null;
  round?: number;
}

type Phase = "preloading" | "fixation" | "stimulus" | "blank" | "done";

interface Props {
  sessionId: string;
  participantCode: string;
  participantId: string;
  allTrials: TrialData[];
  completedCount: number;
}

// ─── Constants ─────────────────────────────────────────────

const FIXATION_MS = 500;
const MAX_STIMULUS_MS = 180000;
const BLANK_MS = 300;
const KEY_MAP: Record<string, string> = { f: "F", j: "J" };

// ─── Component ─────────────────────────────────────────────

export default function PreferenceTask({
  sessionId,
  participantCode,
  participantId,
  allTrials,
  completedCount,
}: Props) {
  const [phase, setPhase] = useState<Phase>("preloading");
  const [trialIndex, setTrialIndex] = useState(completedCount);
  const [error, setError] = useState<string | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState(false);

  // RT measurement — never from server timestamps.
  const stimOnsetRef = useRef<number>(0);
  const respondedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTrial: TrialData | null = allTrials[trialIndex] ?? null;

  // ─── Init calibration when no trials exist ───────────────

  async function initCalibration() {
    try {
      // Ensure stimulus assignment exists first.
      const res1 = await fetch("/api/study1/init-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res1.ok) {
        const d = await res1.json().catch(() => ({}));
        throw new Error(d.error || `init-assignment failed (${res1.status})`);
      }
      // Generate calibration trials.
      const res2 = await fetch("/api/study1/calibration/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res2.ok) {
        const d = await res2.json().catch(() => ({}));
        throw new Error(d.error || `calibration init failed (${res2.status})`);
      }
      const calData = await res2.json();
      // Log debug info to console (admin only).
      console.log("[PreferenceTask] Calibration initialized:", {
        phase: calData.phase,
        total_trials: calData.total_trials,
        attempt_index: calData.attempt_index,
      });
      window.location.reload();
    } catch (e: any) {
      console.error("[PreferenceTask] Init failed:", e.message);
      setError("图片加载失败，请联系主试检查实验材料。");
    }
  }

  // ─── Preload images ──────────────────────────────────────

  useEffect(() => {
    // If no trials exist yet, trigger initialization.
    if (allTrials.length === 0) {
      initCalibration();
      return;
    }
    let cancelled = false;
    const urls = new Set<string>();
    let missingCount = 0;
    for (const t of allTrials) {
      if (t.left_image_url) urls.add(t.left_image_url);
      else missingCount++;
      if (t.right_image_url) urls.add(t.right_image_url);
      else missingCount++;
    }
    if (missingCount > 0) {
      console.warn("[PreferenceTask]", missingCount, "missing image_urls in", allTrials.length, "trials");
    }
    if (urls.size === 0) {
      console.error("[PreferenceTask] No image URLs found — check calibration_trials.left_image_url/right_image_url");
      setError("图片加载失败，请联系主试检查实验材料。");
      return;
    }
    let loaded = 0;
    // Safety timeout: if images don't load within 15s, show error.
    const safetyTimer = setTimeout(() => {
      if (!cancelled && !imagesReady) {
        console.error("[PreferenceTask] Image preload timed out after 15s —", loaded, "/", urls.size, "loaded");
        setError("图片加载超时，请刷新页面重试。如果持续出现请联系主试。");
      }
    }, 15000);
    for (const url of urls) {
      const img = new window.Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (!cancelled && loaded >= urls.size) {
          clearTimeout(safetyTimer);
          setImagesReady(true);
        }
      };
      img.src = url;
    }
    return () => { cancelled = true; clearTimeout(safetyTimer); };
  }, [allTrials]);

  // ─── Phase transitions ──────────────────────────────────

  useEffect(() => {
    if (!imagesReady) return;
    if (allTrials.length > 0 && trialIndex >= allTrials.length) {
      // Do NOT call finishAll() here. The submit API controls completion.
      // When the final phase finishes, submit returns phase:"complete".
      // If we land here mid-phase, the page needs a reload to fetch
      // newly-generated next-phase trials from the server.
      console.warn("[PreferenceTask] trialIndex", trialIndex, ">= allTrials", allTrials.length, "— reloading to fetch next phase");
      window.location.reload();
      return;
    }
    // Start with fixation.
    setPhase("fixation");
  }, [imagesReady, trialIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    if (phase === "fixation") {
      timeoutRef.current = setTimeout(() => setPhase("stimulus"), FIXATION_MS);
    }
    if (phase === "stimulus") {
      respondedRef.current = false;
      requestAnimationFrame(() => {
        stimOnsetRef.current = performance.now();
      });
      timeoutRef.current = setTimeout(() => {
        if (!respondedRef.current && currentTrial) submitResponse(null, null, null, true);
      }, MAX_STIMULUS_MS);
    }
    if (phase === "blank") {
      timeoutRef.current = setTimeout(() => {
        setTrialIndex((prev) => prev + 1);
      }, BLANK_MS);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Key handling ────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (phase !== "stimulus" || respondedRef.current || !currentTrial) return;
    const key = e.key.toLowerCase();
    if (key !== "f" && key !== "j") return;
    respondedRef.current = true;
    const rtMs = performance.now() - stimOnsetRef.current;
    const mapped = KEY_MAP[key];
    const side = mapped === "F" ? "left" : "right";
    const chosen = side === "left" ? currentTrial.left_stim_id : currentTrial.right_stim_id;
    submitResponse(side, chosen, rtMs, false);
  }, [phase, currentTrial]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Click handling ──────────────────────────────────────

  function handleClick(side: "left" | "right") {
    if (phase !== "stimulus" || respondedRef.current || !currentTrial) return;
    respondedRef.current = true;
    const rtMs = performance.now() - stimOnsetRef.current;
    const chosen = side === "left" ? currentTrial.left_stim_id : currentTrial.right_stim_id;
    submitResponse(side, chosen, rtMs, false, "mouse");
  }

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ─── Submit ──────────────────────────────────────────────

  async function submitResponse(
    side: string | null,
    chosenId: string | null,
    rtMs: number | null,
    timeout: boolean,
    method: string = "keyboard",
  ) {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (!currentTrial) return;

    // Compute consistency for cross-set trials.
    let consistent: number | null = null;
    if (!timeout && chosenId && currentTrial.expected_choice && currentTrial.expected_choice !== "none") {
      const expectedId = currentTrial.expected_choice === "left"
        ? currentTrial.left_stim_id
        : currentTrial.right_stim_id;
      consistent = chosenId === expectedId ? 1 : 0;
    }

    try {
      const res = await fetch("/api/study1/calibration/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
          trial_id: currentTrial.id,
          phase: currentTrial.phase,
          left_stim_id: currentTrial.left_stim_id,
          right_stim_id: currentTrial.right_stim_id,
          response_side: side,
          chosen_stim_id: chosenId,
          response_method: method,
          rt_ms: rtMs,
          timeout,
          consistent,
        }),
      });
      if (!res.ok) throw new Error("Submit failed");
      const data = await res.json();

      if (data.phase === "complete") {
        window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
        return;
      }

      if (data.phase_completed) {
        // Phase 1 done, Phase 2 generated. Full reload to fetch new trials.
        window.location.reload();
        return;
      }
    } catch {
      setError("保存失败，请检查网络后重试。");
      return; // Do not advance — allow retry on same trial.
    }
    setTimeoutMessage(timeout);
    setPhase("blank");
  }

  // ─── Finish ──────────────────────────────────────────────

  async function finishAll() {
    await fetch("/api/sessions/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        event_type: "study1_liking_calibration_completed",
      }),
    });
    window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
  }

  // ─── Render ──────────────────────────────────────────────

  if (error) {
    return <div className="text-center text-sm text-red-700 bg-red-50 rounded px-4 py-3">{error}</div>;
  }

  if (!imagesReady || phase === "preloading") {
    return <div className="text-center text-sm text-gray-400 py-8">图片加载中…</div>;
  }

  if (phase === "done" || trialIndex >= allTrials.length) {
    return <div className="text-center text-sm text-green-700 bg-green-50 rounded px-4 py-3">本阶段已完成，正在前往下一阶段…</div>;
  }

  return (
    <div className="text-center space-y-4 select-none">
      {/* Progress */}
      <div className="text-xs text-gray-400">
        试次 {trialIndex + 1} / {allTrials.length}
        {currentTrial?.phase?.includes("_r2") && (
          <span className="ml-2 text-amber-600">第2轮</span>
        )}
      </div>

      {/* Fixation */}
      {phase === "fixation" && <div className="text-4xl text-gray-900 py-16">+</div>}

      {/* Stimulus — two images side by side */}
      {phase === "stimulus" && currentTrial && (
        <div className="flex items-center justify-center gap-8 py-4">
          {/* Left image */}
          <div
            className="cursor-pointer rounded border-2 border-gray-400 hover:border-gray-900 transition-colors p-2"
            onClick={() => handleClick("left")}
          >
            <Image
              src={currentTrial.left_image_url}
              alt="Left"
              width={320}
              height={320}
              unoptimized
              priority
              className="object-contain"
            />
          </div>

          {/* Right image */}
          <div
            className="cursor-pointer rounded border-2 border-gray-400 hover:border-gray-900 transition-colors p-2"
            onClick={() => handleClick("right")}
          >
            <Image
              src={currentTrial.right_image_url}
              alt="Right"
              width={320}
              height={320}
              unoptimized
              priority
              className="object-contain"
            />
          </div>
        </div>
      )}

      {/* Blank ITI */}
      {phase === "blank" && (
        <div className="py-16">
          {timeoutMessage && <p className="text-sm text-gray-500">本题未作答，请尽量在时间内选择。</p>}
        </div>
      )}

      {/* Key hints */}
      <div className="flex justify-center gap-8 text-xl text-gray-800 font-medium mt-2">
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">F</span>
        <span>选择左边 · 选择右边</span>
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">J</span>
      </div>
    </div>
  );
}
