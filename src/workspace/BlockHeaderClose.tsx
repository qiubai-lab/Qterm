import type { ReactNode } from "react";
import { Icon } from "../components/Icon";
import { ThemedTooltipButton } from "../components/ThemedTooltipButton";

export function BlockHeaderClose({ label, onClose, children }: { label: string; onClose: () => void; children?: ReactNode }) {
  return <div className="block-actions">{children}<ThemedTooltipButton aria-label={label} tooltip="关闭" onClick={onClose}><Icon name="close" size={13}/></ThemedTooltipButton></div>;
}
