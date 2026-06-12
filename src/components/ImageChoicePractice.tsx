"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";

type Phase = "instruction" | "trial" | "done";

interface PracticeImage {
  image_url: string;
  label: string;
}

interface Props {
  /** Practice images — at least 4 needed (2 pairs). */
  images: PracticeImage[];
  /** Whether to show mock value points below each image (for formal choice practice). */
  showValues?: boolean;
  /** Called when all practice trials are complete. */
  onComplete: () => void;
}

interface PracticeTrial {
  leftImage: PracticeImage;
  rightImage: PracticeImage;
  leftValue?: number;
  rightValue?: number;
}

/** Build practice trials from the image list. */
function buildTrials(images: PracticeImage[], showValues: boolean): PracticeTrial[] {
  const values = [5, 10, 15, 20, 25];
  const trials: PracticeTrial[] = [];
  // Use 4 trials: 2 pairs, each presented twice (left/right swapped).
  const pairs: [number, number][] = [[0, 1], [2, 3]];
  for (const [a, b] of pairs) {
    if (!images[a] || !images[b]) continue;
    // First presentation
    trials.push({
      leftImage: images[a],
      rightImage: images[b],
      leftValue: showValues ? values[a % values.length] : undefined,
      rightValue: showValues ? values[b % values.length] : undefined,
    });
    // Swapped
    trials.push({
      leftImage: images[b],
      rightImage: images[a],
      leftValue: showValues ? values[b % values.length] : undefined,
      rightValue: showValues ? values[a % values.length] : undefined,
    });
  }
  return trials;
}

export default function ImageChoicePractice({
  images,
  showValues = false,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("instruction");
  const [trialIndex, setTrialIndex] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const trials = useMemo(() => buildTrials(images, showValues), [images, showValues]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (phase !== "trial") return;
      const key = e.key.toLowerCase();
      if (key === "f" || key === "j") {
        const side = key === "f" ? "left" : "right";
        setLastFeedback(side === "left" ? "你选择了左侧图形" : "你选择了右侧图形");
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

  if (images.length < 4) {
    return (
      <div className="text-center text-sm text-red-700 bg-red-50 rounded px-4 py-3">
        练习图片加载失败，请联系主试。
      </div>
    );
  }

  if (phase === "instruction") {
    return (
      <div className="max-w-3xl mx-auto space-y-5 text-xl leading-relaxed text-gray-900">
        {showValues ? (
          <>
            <p>
              接下来的任务中，你会看到左右两张抽象图形。每张图形旁边会显示一个价值点数，表示该图形在任务中的兑换价值（收益价值）。
            </p>
            <p>
              请综合你对图形的喜爱程度和图形旁边显示的价值点数，选择你更愿意获得的一个。
            </p>
          </>
        ) : (
          <>
            <p>
              在接下来的任务中，你会多次看到左右两个抽象图形。
            </p>
            <p>
              如果你更偏好左侧的图形，请按
              <span className="font-mono font-bold text-2xl border-2 border-gray-400 rounded px-3 py-1 mx-1">F</span>
              ；如果你更偏好右侧的图形，请按
              <span className="font-mono font-bold text-2xl border-2 border-gray-400 rounded px-3 py-1 mx-1">J</span>
              。
            </p>
            <p>
              本任务没有客观正确答案，请根据你的主观喜爱程度，按照第一感觉进行选择，不需要过度思考。
            </p>
          </>
        )}
        <p>接下来你将完成 {trials.length} 次练习，帮助你熟悉操作。</p>
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
          你已经熟悉了操作方式。准备好后请点击下方按钮进入正式任务。
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
        练习 {trialIndex + 1} / {trials.length}
      </p>

      {/* Images side by side */}
      <div className="flex items-center justify-center gap-8 py-4">
        <div className="rounded border-2 border-gray-400 p-3">
          <Image
            src={trial.leftImage.image_url}
            alt="Left"
            width={240}
            height={240}
            unoptimized
            priority
            className="object-contain"
          />
          {showValues && trial.leftValue != null && (
            <p className="mt-2 text-xl font-bold text-gray-900">
              价值点数：{trial.leftValue}
            </p>
          )}
        </div>
        <div className="rounded border-2 border-gray-400 p-3">
          <Image
            src={trial.rightImage.image_url}
            alt="Right"
            width={240}
            height={240}
            unoptimized
            priority
            className="object-contain"
          />
          {showValues && trial.rightValue != null && (
            <p className="mt-2 text-xl font-bold text-gray-900">
              价值点数：{trial.rightValue}
            </p>
          )}
        </div>
      </div>

      {showValues ? (
        <p className="text-2xl text-gray-900 font-medium">
          请综合喜好和价值，选择你更愿意获得的一个
        </p>
      ) : (
        <p className="text-2xl text-gray-900 font-medium">
          请选择你更喜欢的图形
        </p>
      )}

      {/* Feedback */}
      {lastFeedback && (
        <div className="text-xl font-bold text-green-700">{lastFeedback}</div>
      )}

      {!lastFeedback && (
        <div className="flex justify-center gap-8 text-xl text-gray-800 font-medium mt-2">
          <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">F</span>
          <span>选择左边 · 选择右边</span>
          <span className="rounded border-2 border-gray-400 px-4 py-2 font-mono text-2xl">J</span>
        </div>
      )}
    </div>
  );
}
