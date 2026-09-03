import type { CSSProperties } from "react";

import type { ConnectionSelectionState } from "./useConnectionManagerMotion";

type IndicatorStyle = CSSProperties & { "--connection-selection-y": string };

export function ConnectionSelectionIndicator({ state }: { state: ConnectionSelectionState }) {
  // An invisible transformed element still expands the list's scrollable area.
  if (!state.visible) return null;

  const style: IndicatorStyle = { "--connection-selection-y": `${state.offset}px` };
  return <span
    className={`connection-selection-indicator${state.visible ? " visible" : ""}${state.ready ? " ready" : ""}`}
    data-target-id={state.targetId ?? undefined}
    style={style}
    aria-hidden="true"
  />;
}
