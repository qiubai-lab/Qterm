import type { ReactNode } from "react";

export function RequiredFieldLabel({ children }: { children: ReactNode }) {
  return <span className="required-field-label"><span className="required-field-mark" aria-hidden="true"/>{children}</span>;
}
