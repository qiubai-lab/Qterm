import type { CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { IMAGE_FEEDBACK_ERROR_MS, IMAGE_FEEDBACK_SUCCESS_MS, type TerminalImageFeedback } from "./terminalImageModel";

export function TerminalImageFeedbackBubble({ feedback }: { feedback: TerminalImageFeedback }) {
  const duration = feedback.error ? IMAGE_FEEDBACK_ERROR_MS : IMAGE_FEEDBACK_SUCCESS_MS;
  return <span className="terminal-image-feedback-bubble" data-tone={feedback.error ? "error" : "success"} role={feedback.error ? "alert" : "status"} aria-atomic="true" style={{ "--feedback-exit-delay": `${duration - 140}ms` } as CSSProperties}>
    <Icon name={feedback.error ? "alertCircle" : "checkCircle"} size={14}/>
    <span>{feedback.message}</span>
  </span>;
}
