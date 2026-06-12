"use client";

import { useState, useEffect, useMemo } from "react";
import { generateDotPositions } from "@/lib/stimulus/dots";

type Phase = "instruction" | "trial" | "done";

interface Props {
  onComplete: () => void;
}

type TrialType = "dot_comparison" | "shape_matching";

interface PracticeTrial {
  type: TrialType;
  prompt: string;
  leftLabel: string;
  rightLabel: string;
  leftDots?: number;
  rightDots?: number;
  leftShape?: "circle" | "square" | "triangle" | "diamond";
  rightShape?: "circle" | "square" | "triangle" | "diamond";
  shapesMatch?: boolean;
  correctAnswer: string; // "F" | "J"
}

/** 6 practice trials: 4 dot_comparison (2 easy + 2 hard) + 2 shape_matching. Real feedback only. */
function buildPracticeTrials(): PracticeTrial[] {
  const dcTrials: PracticeTrial[] = [];
  // 2 easy (15-25 dots, diff 1-3) + 2 hard (30-50 dots, diff 2-4)
  const specs = [
    { min: 15, max: 25, diffMin: 1, diffMax: 3 },  // easy (matches real dot)
    { min: 15, max: 25, diffMin: 1, diffMax: 3 },  // easy
    { min: 30, max: 50, diffMin: 2, diffMax: 4 },  // hard (matches manipulated dot)
    { min: 30, max: 50, diffMin: 2, diffMax: 4 },  // hard
  ];
  for (let i = 0; i < 4; i++) {
    const leftHasMore = i % 2 === 0;
    const { min, max, diffMin, diffMax } = specs[i];
    const diff = diffMin + Math.floor(Math.random() * (diffMax - diffMin + 1));
    const mid = min + diff + Math.floor(Math.random() * (max - min - diff + 1));
    const leftDots = leftHasMore ? mid : mid - diff;
    const rightDots = leftHasMore ? mid - diff : mid;
    dcTrials.push({
      type: "dot_comparison",
      prompt: "哪一侧包含更多点？",
      leftLabel: "左侧更多（F）",
      rightLabel: "右侧更多（J）",
      leftDots,
      rightDots,
      correctAnswer: leftHasMore ? "F" : "J",
    });
  }

  // 2 shape_matching trials: 1 match, 1 non-match.
  const smTrials: PracticeTrial[] = [
    {
      type: "shape_matching",
      prompt: "这两个图形是否匹配？",
      leftLabel: "匹配（F）",
      rightLabel: "不匹配（J）",
      leftShape: "circle",
      rightShape: "circle",
      shapesMatch: true,
      correctAnswer: "F",
    },
    {
      type: "shape_matching",
      prompt: "这两个图形是否匹配？",
      leftLabel: "匹配（F）",
      rightLabel: "不匹配（J）",
      leftShape: "square",
      rightShape: "triangle",
      shapesMatch: false,
      correctAnswer: "J",
    },
  ];

  // Interleave: DC, DC, SM, DC, DC, SM
  return [dcTrials[0], dcTrials[1], smTrials[0], dcTrials[2], dcTrials[3], smTrials[1]];
}

export default function PracticeTrials({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("instruction");
  const [trialIndex, setTrialIndex] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<{
    correct: boolean;
    answer: string;
  } | null>(null);

  const trials = useMemo(() => buildPracticeTrials(), []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (phase !== "trial") return;
      const key = e.key.toLowerCase();
      if (key === "f" || key === "j") {
        const trial = trials[trialIndex];
        const correct = key.toUpperCase() === trial.correctAnswer;
        setLastFeedback({ correct, answer: key.toUpperCase() });
        // Brief pause then advance.
        setTimeout(() => {
          setLastFeedback(null);
          if (trialIndex < trials.length - 1) {
            setTrialIndex((p) => p + 1);
          } else {
            setPhase("done");
          }
        }, 600);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, trialIndex, trials]);

  if (phase === "instruction") {
    return (
      <div className="max-w-3xl mx-auto space-y-5 text-xl leading-relaxed text-gray-900">
        <p>
          在后续任务中，你会多次看到左右两个选项。如果你选择左侧，请按
          <span className="font-mono font-bold text-2xl border-2 border-gray-400 rounded px-3 py-1 mx-1">
            F
          </span>
          ；如果你选择右侧，请按
          <span className="font-mono font-bold text-2xl border-2 border-gray-400 rounded px-3 py-1 mx-1">
            J
          </span>
          。
        </p>
        <p>请在看清题目后尽快作答。</p>
        <p>
          接下来你将完成 6 次练习，包含点数比较和图形匹配两种题型。
          练习结果不会计入正式任务，也不影响你的资源点数。
        </p>
        <button
          onClick={() => setPhase("trial")}
          className="w-full rounded bg-gray-900 py-4 text-2xl font-bold text-white hover:bg-gray-800"
        >
          开始练习
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="text-center space-y-6">
        <h2 className="text-3xl font-bold text-gray-900">练习已完成</h2>
        <p className="text-xl text-gray-700">
          练习已完成。接下来将进入正式任务信息页面。
        </p>
        <button
          onClick={onComplete}
          className="rounded bg-gray-900 px-10 py-4 text-2xl font-bold text-white hover:bg-gray-800"
        >
          继续
        </button>
      </div>
    );
  }

  const trial = trials[trialIndex];

  return (
    <div className="text-center space-y-6 select-none">
      <p className="text-xl text-gray-700 font-medium">
        练习 {trialIndex + 1} / 6
      </p>

      {/* Visual stimulus */}
      <div className="flex items-center justify-center py-4">
        <PracticeStimulus trial={trial} />
      </div>

      <p className="text-2xl text-gray-900 font-medium">{trial.prompt}</p>

      {/* Feedback overlay */}
      {lastFeedback && (
        <div className="text-xl font-bold">
          {lastFeedback.correct ? (
            <span className="text-green-700">✓ 正确</span>
          ) : (
            <span className="text-red-700">✗ 错误</span>
          )}
        </div>
      )}

      {!lastFeedback && (
        <>
          <div className="flex items-center justify-center gap-10">
            <span className="rounded border-2 border-gray-400 px-6 py-3 text-xl font-bold text-gray-800">
              {trial.leftLabel}
            </span>
            <span className="rounded border-2 border-gray-400 px-6 py-3 text-xl font-bold text-gray-800">
              {trial.rightLabel}
            </span>
          </div>
          <p className="text-xl text-gray-700 font-medium">
            按 F 选择左侧 · 按 J 选择右侧
          </p>
        </>
      )}
    </div>
  );
}

function PracticeStimulus({ trial }: { trial: PracticeTrial }) {
  switch (trial.type) {
    case "dot_comparison":
      return <DotComparisonBox leftDots={trial.leftDots ?? 30} rightDots={trial.rightDots ?? 30} />;
    case "shape_matching":
      return (
        <div className="flex items-center justify-center gap-10">
          <div className="border-2 border-black rounded bg-white p-6">
            <ShapeSvg shape={trial.leftShape ?? "circle"} />
          </div>
          <div className="border-2 border-black rounded bg-white p-6">
            <ShapeSvg shape={trial.rightShape ?? "circle"} />
          </div>
        </div>
      );
  }
}

function DotComparisonBox({ leftDots, rightDots }: { leftDots: number; rightDots: number }) {
  const leftPositions = useMemo(
    () => generateDotPositions(leftDots, { panelWidth: 90, panelHeight: 90, minDistance: 5, padding: 8 }),
    [leftDots],
  );
  const rightPositions = useMemo(
    () => generateDotPositions(rightDots, { panelWidth: 90, panelHeight: 90, minDistance: 5, padding: 8 }),
    [rightDots],
  );

  return (
    <div className="flex items-center justify-center gap-10">
      <div className="relative w-80 h-64 border-2 border-black rounded bg-white">
        {leftPositions.map(([x, y], i) => (
          <span
            key={`l-${i}`}
            className="absolute h-3 w-3 rounded-full bg-gray-900"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))}
      </div>
      <div className="relative w-80 h-64 border-2 border-black rounded bg-white">
        {rightPositions.map(([x, y], i) => (
          <span
            key={`r-${i}`}
            className="absolute h-3 w-3 rounded-full bg-gray-900"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))}
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
          <circle cx="50" cy="50" r="40" fill="none" stroke="#4b5563" strokeWidth="3" />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <rect x="10" y="10" width="80" height="80" fill="none" stroke="#4b5563" strokeWidth="3" />
        </svg>
      );
    case "triangle":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <polygon points="50,10 90,85 10,85" fill="none" stroke="#4b5563" strokeWidth="3" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 100 100" className={cls}>
          <polygon points="50,5 95,50 50,95 5,50" fill="none" stroke="#4b5563" strokeWidth="3" />
        </svg>
      );
    default:
      return <div className={`${cls} bg-gray-200 rounded`} />;
  }
}
