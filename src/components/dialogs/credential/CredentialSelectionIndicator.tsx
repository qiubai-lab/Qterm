import type { CSSProperties } from "react";

import type { CredentialSelectionState } from "./useCredentialManagerMotion";

type IndicatorStyle = CSSProperties & { "--credential-selection-y": string };

export function CredentialSelectionIndicator({ state }: { state: CredentialSelectionState }) {
  const style: IndicatorStyle = { "--credential-selection-y": `${state.offset}px` };
  return <span className={`credential-selection-indicator${state.visible ? " visible" : ""}${state.ready ? " ready" : ""}`} data-target-id={state.targetId ?? undefined} style={style} aria-hidden="true"/>;
}
