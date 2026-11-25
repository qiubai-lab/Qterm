import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type FeedbackTone = "success" | "error";
export type CredentialFeedbackInput = {
  message: string;
  tone: FeedbackTone;
} & (
  | { scope: "item"; itemId: string }
  | { scope: "manager" }
);
export type CredentialFeedback = CredentialFeedbackInput & { id: number };

export function CredentialFeedbackBubble({ feedback, getTarget }: { feedback: CredentialFeedback; getTarget: () => HTMLElement | null }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    function updatePosition() {
      const target = getTarget();
      if (!target) { setPosition(null); return; }
      const rect = target.getBoundingClientRect();
      setPosition({
        left: Math.min(rect.right + 8, window.innerWidth - 290),
        top: Math.max(18, Math.min(rect.top + rect.height / 2, window.innerHeight - 18)),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [feedback.id, getTarget]);

  if (!position) return null;
  return createPortal(
    <p
      data-app-overlay="floating" className={`credential-feedback-bubble ${feedback.scope} ${feedback.tone}`}
      data-feedback-for={feedback.scope === "item" ? feedback.itemId : undefined}
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      style={position}
    >
      {feedback.message}
    </p>,
    document.body,
  );
}
