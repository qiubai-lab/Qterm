import { forwardRef, type ComponentPropsWithoutRef } from "react";

export const ExactTextInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(function ExactTextInput(props, ref) {
  return <input {...props} ref={ref} autoCapitalize="none" autoCorrect="off" spellCheck={false}/>;
});

export const ExactTextArea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(function ExactTextArea(props, ref) {
  return <textarea {...props} ref={ref} autoCapitalize="none" autoCorrect="off" spellCheck={false}/>;
});
