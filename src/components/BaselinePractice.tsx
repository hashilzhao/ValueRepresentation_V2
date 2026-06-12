"use client";

import PracticeTrials from "./PracticeTrials";
import ImageChoicePractice from "./ImageChoicePractice";

interface PracticeImage {
  image_url: string;
  label: string;
}

interface Props {
  sessionId: string;
  participantCode: string;
  /** Which practice content to show. */
  practiceType?: "resource_task" | "image_preference" | "formal_choice";
  /** Images for image-based practice (required for image_preference / formal_choice). */
  practiceImages?: PracticeImage[];
}

export default function BaselinePractice({
  sessionId,
  participantCode,
  practiceType = "resource_task",
  practiceImages = [],
}: Props) {
  function handleComplete() {
    fetch("/api/sessions/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).then(() => {
      window.location.href = `/experiment?code=${encodeURIComponent(participantCode)}&session=${sessionId}`;
    });
  }

  if (practiceType === "image_preference") {
    return (
      <ImageChoicePractice
        images={practiceImages}
        showValues={false}
        onComplete={handleComplete}
      />
    );
  }

  if (practiceType === "formal_choice") {
    return (
      <ImageChoicePractice
        images={practiceImages}
        showValues={true}
        onComplete={handleComplete}
      />
    );
  }

  // resource_task (default): dot comparison + shape matching practice
  return <PracticeTrials onComplete={handleComplete} />;
}
