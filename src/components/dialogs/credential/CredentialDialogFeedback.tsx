import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
export type CredentialSecurityTooltipTarget = { key: string; element: HTMLElement };

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
      className={`credential-feedback-bubble ${feedback.scope} ${feedback.tone}`}
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

export function CredentialSecurityTooltip({ id, target }: { id: string; target: HTMLElement | null }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);

  useLayoutEffect(() => {
    if (!target || !target.isConnected) return;
    const updatePosition = () => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const anchorRect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const inset = 8;
      const gap = 5;
      const maximumLeft = Math.max(inset, window.innerWidth - inset - tooltipRect.width);
      const desiredLeft = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
      const left = Math.min(Math.max(inset, desiredLeft), maximumLeft);
      const belowTop = anchorRect.bottom + gap;
      const aboveTop = anchorRect.top - gap - tooltipRect.height;
      const placement = belowTop + tooltipRect.height <= window.innerHeight - inset || aboveTop < inset ? "below" : "above";
      setPosition({ left, top: placement === "below" ? belowTop : Math.max(inset, aboveTop), placement });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [target]);

  if (!target) return null;
  return createPortal(
    <div
      ref={tooltipRef}
      id={id}
      className="credential-security-tooltip"
      role="tooltip"
      data-placement={position?.placement ?? "below"}
      style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }}
    >
      <strong>RSA 风险例外</strong>
      <span>RSA 签名依赖存在未修复的时序侧信道风险，建议改用 Ed25519 或 ECDSA。</span>
    </div>,
    document.body,
  );
}
