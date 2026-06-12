"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────

type Phase =
  | "instruction"
  | "loading"
  | "fixation"
  | "stimulus"
  | "feedback"
  | "blank"
  | "done";

interface TrialData {
  id: string;
  global_trial_index: number;
  task_type: "dot_comparison" | "shape_matching" | "dot_estimation";
  stimulus_payload: Stimulus;
  correct_answer: string;
  preset_feedback_direction: "gain" | "loss" | null;
  preset_feedback_points: number | null;
}

type Stimulus =
  | { type: "dot_comparison"; question: string; left_dots: number; right_dots: number; left_positions: [number, number][]; right_positions: [number, number][]; answer: string }
  | { type: "shape_matching"; question: string; left_shape: string; right_shape: string; match: boolean; answer: string }
  | { type: "dot_estimation"; question: string; dot_count: number; reference_number: number; comparison: string; answer: string; positions: [number, number][] };

interface Props {
  sessionId: string;
  participantCode: string;
  participantId: string;
}

// ─── Constants ─────────────────────────────────────────────────

const FIXATION_MS = 500;
const MAX_STIMULUS_MS = 3000;
const FEEDBACK_MS = 800;
const BLANK_MS = 300;

const KEY_MAP: Record<string, string> = { f: "F", j: "J" };

// ─── Component ─────────────────────────────────────────────────

export default function StageGameTask({
  sessionId,
  participantCode,
  participantId,
}: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("instruction");
  const [trials, setTrials] = useState<TrialData[]>([]);
  const [trialIndex, setTrialIndex] = useState(0);
  const [totalTrials, setTotalTrials] = useState(90);
  const [balance, setBalance] = useState(0);
  const [feedbackDirection, setFeedbackDirection] = useState<"gain" | "loss">("gain");
  const [feedbackPoints, setFeedbackPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for RT measurement.
  const stimOnsetRef = useRef<number>(0);
  const respondedRef = useRef(false);
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Instruction → Init ────────────────────────────────────

  function handleStartTask() {
    setPhase("loading");
  }

  useEffect(() => {
    if (phase === "loading") initTrials();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function initTrials() {
    try {
      const res = await fetch("/api/stage-game/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) throw new Error("Init failed");
      const data = await res.json();

      const allTrials: TrialData[] = data.trials.map((t: Record<string, unknown>) => ({
        ...t,
        stimulus_payload:
          typeof t.stimulus_payload === "string"
            ? JSON.parse(t.stimulus_payload as string)
            : t.stimulus_payload,
      }));

      setTrials(allTrials);
      setTotalTrials(allTrials.length);
      setBalance(data.current_balance);

      const nextIdx = data.completed_trials;
      if (nextIdx >= allTrials.length) {
        setPhase("done");
      } else {
        setTrialIndex(nextIdx);
        schedulePhase("fixation", FIXATION_MS);
      }
    } catch {
      setError("任务初始化失败，请刷新页面重试。");
    }
  }

  // ─── Trial flow ──────────────────────────────────────────────

  const currentTrial = trials[trialIndex] ?? null;

  const advancePhase = useCallback(() => {
    if (!currentTrial) return;

    setPhase((prev) => {
      switch (prev) {
        case "fixation":
          return "stimulus";
        case "stimulus":
          return "feedback";
        case "feedback":
          return "blank";
        case "blank": {
          const nextIdx = trialIndex + 1;
          if (nextIdx >= trials.length) return "done";
          return "fixation";
        }
        default:
          return prev;
      }
    });
  }, [currentTrial, trialIndex, trials]);

  // Handle phase transitions via timeouts.
  useEffect(() => {
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }

    if (phase === "fixation") {
      phaseTimeoutRef.current = setTimeout(() => advancePhase(), FIXATION_MS);
    }

    if (phase === "stimulus") {
      respondedRef.current = false;
      requestAnimationFrame(() => {
        stimOnsetRef.current = performance.now();
      });
      phaseTimeoutRef.current = setTimeout(() => {
        if (!respondedRef.current && currentTrial) {
          handleTimeout();
        }
      }, MAX_STIMULUS_MS);
    }

    if (phase === "feedback") {
      phaseTimeoutRef.current = setTimeout(() => advancePhase(), FEEDBACK_MS);
    }

    if (phase === "blank") {
      phaseTimeoutRef.current = setTimeout(() => {
        setTrialIndex((prev) => prev + 1);
        schedulePhase("fixation", 0);
      }, BLANK_MS);
    }

    if (phase === "done" && currentTrial) {
      finishStage();
    }

    return () => {
      if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function schedulePhase(p: Phase, delay: number) {
    if (phaseTimeoutRef.current) clearTimeout(phaseTimeoutRef.current);
    if (delay > 0) {
      phaseTimeoutRef.current = setTimeout(() => setPhase(p), delay);
    } else {
      requestAnimationFrame(() => setPhase(p));
    }
  }

  // ─── Key handling ────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== "stimulus" || respondedRef.current || !currentTrial) return;

      const key = e.key.toLowerCase();
      if (key !== "f" && key !== "j") return;

      respondedRef.current = true;
      const responseTime = performance.now();
      const rtMs = responseTime - stimOnsetRef.current;

      submitResponse(currentTrial, KEY_MAP[key], rtMs);
    },
    [phase, currentTrial], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function handleTimeout() {
    if (!currentTrial) return;
    respondedRef.current = true;
    await submitResponse(currentTrial, null, null, true, true);
  }

  // ─── Submit + feedback ───────────────────────────────────────

  async function submitResponse(
    trial: TrialData,
    response: string | null,
    rtMs: number | null,
    missed = false,
    timedOut = false,
  ) {
    const accuracy = timedOut
      ? 0
      : response === null
        ? null
        : response === trial.correct_answer
          ? 1
          : 0;

    // Clear the stimulus timeout.
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }

    try {
      const res = await fetch("/api/stage-game/submit-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
          trial_id: trial.id,
          global_trial_index: trial.global_trial_index,
          task_type: trial.task_type,
          stimulus_payload: trial.stimulus_payload,
          correct_answer: trial.correct_answer,
          response,
          accuracy,
          rt_ms: rtMs,
          missed_response: missed,
          timeout: timedOut,
          balance_before: balance,
        }),
      });
      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try {
          const d = await res.json();
          msg = d.error || msg;
        } catch {
          /* ignore parse error */
        }
        setError(msg);
        return;
      }
      const data = await res.json();

      setBalance(data.balance_after);
      setFeedbackDirection(data.feedback_direction);
      setFeedbackPoints(data.feedback_points);

      if (trialIndex + 1 >= trials.length) {
        setPhase("done");
      } else {
        setPhase("feedback");
      }
    } catch {
      setError("保存失败，请检查网络后重试。");
    }
  }

  // ─── Finish ──────────────────────────────────────────────────

  async function finishStage() {
    try {
      await fetch("/api/sessions/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          event_type: "scarcity_manipulation_completed",
        }),
      });
    } catch {
      /* proceed even if advance fails — participant can refresh */
    }
    router.push(
      `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`,
    );
  }

  // ─── Render ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className="text-center text-sm text-red-700 bg-red-50 rounded px-4 py-3">
        {error}
      </div>
    );
  }

  if (phase === "instruction") {
    return (
      <div className="max-w-3xl mx-auto space-y-5 text-xl leading-relaxed text-gray-800 py-4">
        <h2 className="text-4xl font-bold text-gray-900 text-center">
          资源任务说明
        </h2>
        <p>接下来你将完成一个资源任务。任务一共包含 {totalTrials} 个试次。</p>
        <p>在每个试次中，你会看到一个简单的知觉判断题。题目类型包括：</p>
        <ol className="list-decimal list-inside space-y-2 pl-2">
          <li>点数比较：判断哪一侧包含更多点。</li>
          <li>图形匹配：判断两个图形是否匹配。</li>
        </ol>
        <p>
          每个试次结束后，系统会显示你本轮获得或失去的资源点数，以及你当前的资源余额。
        </p>
        <p>
          请你尽量保持专注，并根据第一直觉作答。你的目标是在任务过程中认真完成判断，并关注自己的资源余额变化。
        </p>
        <p>任务完成后，系统会自动进入下一部分。</p>
        <button
          onClick={handleStartTask}
          className="w-full rounded bg-gray-900 py-4 text-2xl font-bold text-white hover:bg-gray-800"
        >
          我已了解，开始任务
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="text-center text-sm text-gray-400 py-8">
        任务准备中…
      </div>
    );
  }

  if (trialIndex >= trials.length && trials.length > 0) {
    return (
      <div className="text-center text-sm text-green-700 bg-green-50 rounded px-4 py-3 py-8">
        所有试次已完成，正在前往下一阶段…
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="text-center text-sm text-green-700 bg-green-50 rounded px-4 py-3 py-8">
        所有试次已完成，正在前往下一阶段…
      </div>
    );
  }

  return (
    <div ref={containerRef} className="text-center space-y-4 select-none">
      {/* Progress indicator — continuous, no block reference */}
      <div className="text-xl text-gray-700 font-medium">
        试次 {trialIndex + 1} / {trials.length}
        <span className="ml-4 text-2xl font-extrabold text-red-600 bg-red-50 rounded-lg px-4 py-1.5 border-2 border-red-300">
          当前账户：{balance} 点
        </span>
      </div>

      {/* Fixation */}
      {phase === "fixation" && (
        <div className="text-6xl text-gray-900 py-20">+</div>
      )}

      {/* Stimulus */}
      {phase === "stimulus" && currentTrial && (
        <StimulusDisplay stimulus={currentTrial.stimulus_payload} />
      )}

      {/* Feedback */}
      {phase === "feedback" && (
        <FeedbackDisplay
          direction={feedbackDirection}
          points={feedbackPoints}
          balance={balance}
        />
      )}

      {/* Blank ITI */}
      {phase === "blank" && <div className="py-16" />}

      {/* Key hints */}
      <div className="flex justify-center items-center gap-6 text-xl text-gray-800 mt-4 font-medium">
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">
          F
        </span>
        <span>按 F 选择左侧 · 按 J 选择右侧</span>
        <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">
          J
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function FeedbackDisplay({
  direction,
  points,
  balance,
}: {
  direction: "gain" | "loss";
  points: number;
  balance: number;
}) {
  const isGain = direction === "gain";
  const sign = isGain ? "+" : "−";
  const colorClass = isGain
    ? "text-green-600 bg-green-50 border-green-300"
    : "text-red-600 bg-red-50 border-red-300";

  return (
    <div className="py-8 space-y-3">
      <div className={`inline-block rounded-2xl border-2 px-10 py-6 ${colorClass}`}>
        <p className="text-6xl font-extrabold tracking-tight">
          {sign}{points}
        </p>
        <p className="text-2xl font-bold mt-1">
          {isGain ? "获得" : "失去"} {points} 点
        </p>
      </div>
      <p className="text-2xl font-extrabold text-red-600 bg-red-50 rounded-lg px-6 py-2 inline-block border-2 border-red-300">
        当前账户：{balance} 点
      </p>
    </div>
  );
}

function StimulusDisplay({ stimulus }: { stimulus: Stimulus }) {
  switch (stimulus.type) {
    case "dot_comparison":
      return (
        <DotComparisonStimulus
          stimulus={stimulus}
        />
      );
    case "shape_matching":
      return (
        <ShapeMatchingStimulus
          stimulus={stimulus}
        />
      );
    default:
      // dot_estimation no longer used — fallback display.
      return (
        <div className="py-8 text-gray-500">请按 F 或 J 键作答</div>
      );
  }
}

function DotComparisonStimulus({
  stimulus,
}: {
  stimulus: {
    type: "dot_comparison";
    question: string;
    left_dots: number;
    right_dots: number;
    left_positions: [number, number][];
    right_positions: [number, number][];
    answer: string;
  };
}) {
  return (
    <div className="py-4">
      <p className="text-2xl text-gray-900 font-medium mb-6">
        {stimulus.question}
      </p>
      <div className="flex items-center justify-center gap-12">
        {/* Left panel */}
        <div className="relative w-80 h-80 border-2 border-black rounded bg-white">
          {stimulus.left_positions.map(([x, y], i) => (
            <span
              key={`l-${i}`}
              className="absolute h-3 w-3 rounded-full bg-gray-900"
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>
        {/* Right panel */}
        <div className="relative w-80 h-80 border-2 border-black rounded bg-white">
          {stimulus.right_positions.map(([x, y], i) => (
            <span
              key={`r-${i}`}
              className="absolute h-3 w-3 rounded-full bg-gray-900"
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between mt-3 text-lg text-gray-700 font-medium">
        <span>F — 左侧更多</span>
        <span>右侧更多 — J</span>
      </div>
    </div>
  );
}

function ShapeMatchingStimulus({
  stimulus,
}: {
  stimulus: {
    type: "shape_matching";
    question: string;
    left_shape: string;
    right_shape: string;
    answer: string;
  };
}) {
  return (
    <div className="py-4">
      <p className="text-2xl text-gray-900 font-medium mb-6">
        {stimulus.question}
      </p>
      <div className="flex items-center justify-center gap-12 py-8">
        <div className="border-2 border-black rounded bg-white p-8">
          <ShapeSvg shape={stimulus.left_shape} />
        </div>
        <div className="border-2 border-black rounded bg-white p-8">
          <ShapeSvg shape={stimulus.right_shape} />
        </div>
      </div>
      <div className="flex justify-between mt-3 text-lg text-gray-700 font-medium">
        <span>F — 匹配（是）</span>
        <span>不匹配（否） — J</span>
      </div>
    </div>
  );
}

function ShapeSvg({ shape }: { shape: string }) {
  const cls = "w-40 h-40";
  switch (shape) {
    case "circle":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#1f2937"
            strokeWidth="3"
          />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <rect
            x="10"
            y="10"
            width="80"
            height="80"
            fill="none"
            stroke="#1f2937"
            strokeWidth="3"
          />
        </svg>
      );
    case "triangle":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <polygon
            points="50,10 90,85 10,85"
            fill="none"
            stroke="#1f2937"
            strokeWidth="3"
          />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <polygon
            points="50,5 95,50 50,95 5,50"
            fill="none"
            stroke="#1f2937"
            strokeWidth="3"
          />
        </svg>
      );
    default:
      return <div className={`${cls} bg-gray-200 rounded`} />;
  }
}
