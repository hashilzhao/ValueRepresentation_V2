"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

interface TrialData {
  id: string; validation_type: string; trial_index: number;
  left_stim_id: string; right_stim_id: string;
  left_image_url: string; right_image_url: string;
  left_set_id: string; right_set_id: string;
  left_liking_rank: number; right_liking_rank: number;
  expected_choice: string | null;
}

type Phase = "preloading" | "fixation" | "stimulus" | "blank" | "done";

interface Props { sessionId: string; participantCode: string; participantId: string; allTrials: TrialData[]; completedCount: number; }

const FIXATION_MS = 500; const MAX_STIMULUS_MS = 180000; const BLANK_MS = 300; const IMG_SIZE = 320;
const KEY_MAP: Record<string, string> = { f: "F", j: "J" };

export default function ValidationTask({ sessionId, participantCode, participantId, allTrials, completedCount }: Props) {
  const [phase, setPhase] = useState<Phase>("preloading");
  const [trialIndex, setTrialIndex] = useState(completedCount);
  const [error, setError] = useState<string | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState(false);
  const stimOnsetRef = useRef<number>(0);
  const respondedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTrial = allTrials[trialIndex] ?? null;

  // Init validation trials if none exist.
  useEffect(() => {
    if (allTrials.length === 0 && !initFailed) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      fetch("/api/study1/validation/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }), signal: controller.signal })
        .then((res) => {
          clearTimeout(timer);
          if (!res.ok) throw new Error("init failed");
          window.location.reload();
        })
        .catch(() => {
          clearTimeout(timer);
          setInitFailed(true);
        });
      return () => { clearTimeout(timer); };
    }
    let cancelled = false;
    const urls = new Set<string>();
    for (const t of allTrials) { urls.add(t.left_image_url); urls.add(t.right_image_url); }
    let loaded = 0;
    for (const url of urls) { const img = new window.Image(); img.onload = img.onerror = () => { loaded++; if (!cancelled && loaded >= urls.size) setImagesReady(true); }; img.src = url; }
    return () => { cancelled = true; };
  }, [allTrials]);

  useEffect(() => { if (!imagesReady) return; if (allTrials.length > 0 && trialIndex >= allTrials.length) { finishAll(); return; } setPhase("fixation"); }, [imagesReady, trialIndex]);
  useEffect(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (phase === "fixation") timeoutRef.current = setTimeout(() => setPhase("stimulus"), FIXATION_MS);
    if (phase === "stimulus") { respondedRef.current = false; requestAnimationFrame(() => { stimOnsetRef.current = performance.now(); }); timeoutRef.current = setTimeout(() => { if (!respondedRef.current) submit(null, null, null, true); }, MAX_STIMULUS_MS); }
    if (phase === "blank") timeoutRef.current = setTimeout(() => setTrialIndex((p) => p + 1), BLANK_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [phase]);

  const respond = useCallback((side: string, method: string) => {
    if (phase !== "stimulus" || respondedRef.current || !currentTrial) return;
    respondedRef.current = true;
    const rtMs = performance.now() - stimOnsetRef.current;
    const chosenId = side === "left" ? currentTrial.left_stim_id : currentTrial.right_stim_id;
    submit(side, chosenId, rtMs, false, method);
  }, [phase, currentTrial]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key.toLowerCase() === "f") respond("left", "keyboard");
    else if (e.key.toLowerCase() === "j") respond("right", "keyboard");
  }, [respond]);
  useEffect(() => { window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [handleKeyDown]);

  async function submit(side: string | null, chosenId: string | null, rtMs: number | null, timeout: boolean, method = "keyboard") {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (!currentTrial) return;
    try {
      const res = await fetch("/api/study1/validation/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, participant_id: participantId, trial_id: currentTrial.id, trial_index: currentTrial.trial_index, validation_type: currentTrial.validation_type, response_side: side, chosen_stim_id: chosenId, expected_choice: currentTrial.expected_choice, rt_ms: rtMs, timeout, response_method: method }) });
      if (!res.ok) throw new Error("Submit failed");
      const data = await res.json();
      if (data.completed) { window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`; return; }
    } catch { setError("保存失败，请重试。"); return; }
    setTimeoutMessage(timeout);
    setPhase("blank");
  }

  async function finishAll() {
    await fetch("/api/sessions/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, event_type: "study1_liking_validation_completed" }) });
    window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
  }

  if (error) return <div className="text-center text-sm text-red-700 bg-red-50 rounded px-4 py-3">{error}</div>;

  if (initFailed) {
    return (
      <div className="text-center space-y-4 py-8">
        <p className="text-sm text-gray-600">任务准备时出现问题，请联系实验员或点击重试。</p>
        <button onClick={() => { setInitFailed(false); window.location.reload(); }} className="rounded bg-gray-900 px-6 py-2 text-sm text-white">重试</button>
      </div>
    );
  }

  if (!imagesReady || phase === "preloading" || allTrials.length === 0) return <div className="text-center text-sm text-gray-400 py-8">图片加载中…</div>;
  if (trialIndex >= allTrials.length) return <div className="text-center text-sm text-green-700 bg-green-50 rounded px-4 py-3">All validation trials complete.</div>;

  return (
    <div className="text-center space-y-3 select-none">
      <div className="text-xs text-gray-400">Validation {trialIndex + 1} of {allTrials.length}</div>
      {phase === "fixation" && <div className="text-4xl text-gray-900 py-12">+</div>}
      {phase === "stimulus" && currentTrial && (
        <div className="flex items-center justify-center gap-8 py-2">
          <div className="cursor-pointer rounded border-2 border-gray-200 hover:border-gray-900 p-2" onClick={() => respond("left", "mouse")}>
            <Image src={currentTrial.left_image_url} alt="" width={IMG_SIZE} height={IMG_SIZE} unoptimized className="object-contain" />
          </div>
          <div className="cursor-pointer rounded border-2 border-gray-200 hover:border-gray-900 p-2" onClick={() => respond("right", "mouse")}>
            <Image src={currentTrial.right_image_url} alt="" width={IMG_SIZE} height={IMG_SIZE} unoptimized className="object-contain" />
          </div>
        </div>
      )}
      {phase === "blank" && (
        <div className="py-16">
          {timeoutMessage && <p className="text-sm text-gray-500">本题未作答，请尽量在时间内选择。</p>}
        </div>
      )}
      <div className="flex justify-center gap-8 text-xl text-gray-800 font-medium mt-2">
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">F</span>
        <span>选择左边 · 选择右边</span>
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">J</span>
      </div>
    </div>
  );
}
