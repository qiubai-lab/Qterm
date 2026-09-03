import type { CSSProperties } from "react";

import type { ConnectionSelectionState } from "./useConnectionManagerMotion";

type IndicatorStyle = CSSProperties & { "--connection-selection-y": string };

export function ConnectionSelectionIndicator({ state }: { state: ConnectionSelectionState }) {
  const style: IndicatorStyle = { "--connection-selection-y": `${state.offset}px` };
  return <span
    className={`connection-selection-indicator${state.visible ? " visible" : ""}${state.ready ? " ready" : ""}`}
    data-target-id={state.targetId ?? undefined}
    style={style}
    aria-hidden="true"
  />;
}
