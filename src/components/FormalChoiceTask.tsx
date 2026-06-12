"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

interface TrialData {
  id: string;
  trial_index: number;
  trial_type: string;
  left_stim_id: string;
  right_stim_id: string;
  left_image_url: string;
  right_image_url: string;
  left_liking_rank: number;
  right_liking_rank: number;
  left_external_value: number;
  right_external_value: number;
  delta_liking: number;
  delta_value: number;
}

type Phase = "preloading" | "fixation" | "stimulus" | "blank" | "done";

interface Props {
  sessionId: string;
  participantCode: string;
  participantId: string;
  allTrials: TrialData[];
  completedCount: number;
}

const FIXATION_MS = 500;
const MAX_STIMULUS_MS = 180000;
const BLANK_MS = 300;
const IMG_SIZE = 320;
const KEY_MAP: Record<string, string> = { f: "F", j: "J" };

export default function FormalChoiceTask({
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

  const stimOnsetRef = useRef<number>(0);
  const respondedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTrial = allTrials[trialIndex] ?? null;

  // ─── Preload ────────────────────────────────────────────

  useEffect(() => {
    // If no trials exist yet, trigger initialization.
    if (allTrials.length === 0) {
      initFormalTrials();
      return;
    }
    let cancelled = false;
    const urls = new Set<string>();
    for (const t of allTrials) {
      urls.add(t.left_image_url);
      urls.add(t.right_image_url);
    }
    let loaded = 0;
    for (const url of urls) {
      const img = new window.Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (!cancelled && loaded >= urls.size) setImagesReady(true);
      };
      img.src = url;
    }
    return () => { cancelled = true; };
  }, [allTrials]);

  // ─── Init formal trials ────────────────────────────────

  async function initFormalTrials() {
    try {
      await fetch("/api/study1/formal-trials/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      window.location.reload();
    } catch {
      setError("初始化失败，请刷新页面重试。");
    }
  }

  // ─── Phase transitions ─────────────────────────────────

  useEffect(() => {
    if (!imagesReady) return;
    if (allTrials.length > 0 && trialIndex >= allTrials.length) { setPhase("done"); finishAll(); return; }
    setPhase("fixation");
  }, [imagesReady, trialIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    if (phase === "fixation") {
      timeoutRef.current = setTimeout(() => setPhase("stimulus"), FIXATION_MS);
    }
    if (phase === "stimulus") {
      respondedRef.current = false;
      requestAnimationFrame(() => { stimOnsetRef.current = performance.now(); });
      timeoutRef.current = setTimeout(() => {
        if (!respondedRef.current && currentTrial) submitTrial(null, null, null, true);
      }, MAX_STIMULUS_MS);
    }
    if (phase === "blank") {
      timeoutRef.current = setTimeout(() => setTrialIndex((p) => p + 1), BLANK_MS);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Key / click ────────────────────────────────────────

  const respond = useCallback((side: "left" | "right", method: string) => {
    if (phase !== "stimulus" || respondedRef.current || !currentTrial) return;
    respondedRef.current = true;
    const rtMs = performance.now() - stimOnsetRef.current;
    const chosenId = side === "left" ? currentTrial.left_stim_id : currentTrial.right_stim_id;
    submitTrial(side, chosenId, rtMs, false, method);
  }, [phase, currentTrial]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === "f") respond("left", "keyboard");
    else if (key === "j") respond("right", "keyboard");
  }, [respond]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ─── Submit ─────────────────────────────────────────────

  async function submitTrial(
    side: string | null,
    chosenId: string | null,
    rtMs: number | null,
    timeout: boolean,
    method: string = "keyboard",
  ) {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (!currentTrial) return;

    try {
      const res = await fetch("/api/study1/formal-choice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
          formal_trial_id: currentTrial.id,
          trial_index: currentTrial.trial_index,
          trial_type: currentTrial.trial_type,
          left_stim_id: currentTrial.left_stim_id,
          right_stim_id: currentTrial.right_stim_id,
          left_liking_rank: currentTrial.left_liking_rank,
          right_liking_rank: currentTrial.right_liking_rank,
          left_external_value: currentTrial.left_external_value,
          right_external_value: currentTrial.right_external_value,
          delta_liking: currentTrial.delta_liking,
          delta_value: currentTrial.delta_value,
          response_side: side,
          chosen_stim_id: chosenId,
          response_method: method,
          rt_ms: rtMs,
          timeout,
        }),
      });
      if (!res.ok) throw new Error("Submit failed");
      const data = await res.json();

      if (data.completed) {
        window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
        return;
      }
    } catch {
      setError("保存失败，请继续作答。");
    }
    setPhase("blank");
  }

  // ─── Finish ─────────────────────────────────────────────

  async function finishAll() {
    await fetch("/api/sessions/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, event_type: "study1_formal_choice_completed" }),
    });
    window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
  }

  // ─── Render ─────────────────────────────────────────────

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
    <div className="text-center space-y-3 select-none">
      {/* Progress */}
      <div className="text-xs text-gray-400">
        试次 {trialIndex + 1} / {allTrials.length}
      </div>

      {/* Fixation */}
      {phase === "fixation" && <div className="text-6xl text-gray-900 py-16">+</div>}

      {/* Stimulus */}
      {phase === "stimulus" && currentTrial && (
        <div className="flex items-center justify-center gap-12 py-2">
          {/* Left */}
          <div
            className="cursor-pointer rounded border-2 border-gray-400 hover:border-gray-900 transition-colors p-3"
            onClick={() => respond("left", "mouse")}
          >
            <div style={{ width: IMG_SIZE, height: IMG_SIZE }} className="relative">
              <Image
                src={currentTrial.left_image_url}
                alt=""
                fill
                unoptimized
                priority
                className="object-contain"
              />
            </div>
            <p className="mt-2 text-xl font-bold text-gray-900">
              价值点数：{currentTrial.left_external_value}
            </p>
          </div>

          {/* Right */}
          <div
            className="cursor-pointer rounded border-2 border-gray-400 hover:border-gray-900 transition-colors p-3"
            onClick={() => respond("right", "mouse")}
          >
            <div style={{ width: IMG_SIZE, height: IMG_SIZE }} className="relative">
              <Image
                src={currentTrial.right_image_url}
                alt=""
                fill
                unoptimized
                priority
                className="object-contain"
              />
            </div>
            <p className="mt-2 text-xl font-bold text-gray-900">
              价值点数：{currentTrial.right_external_value}
            </p>
          </div>
        </div>
      )}

      {/* Blank */}
      {phase === "blank" && <div className="py-16" />}

      {/* Key hints */}
      <div className="flex justify-center gap-8 text-xl text-gray-800 font-medium mt-2">
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">F</span>
        <span>选择左边 · 选择右边</span>
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">J</span>
      </div>
    </div>
  );
}
