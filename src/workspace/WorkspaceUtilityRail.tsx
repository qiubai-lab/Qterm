import { Fragment } from "react";
import { Icon, type IconName } from "../components/Icon";

const entries = [
  ["connections", "computer", "连接管理"],
  ["credentials", "key", "凭证管理"],
  ["files", "files", "文件管理"],
  ["network", "network", "网络管理"],
  ["git", "git", "Git 管理"],
  ["terminal", "terminal", "打开终端"],
  ["lock", "lock", "锁定终端"],
  ["settings", "settings", "系统设置"],
  ["help", "help", "关于"],
] as const satisfies readonly (readonly [string, IconName, string])[];

type RailAction = typeof entries[number][0];
interface RailControl {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  accessibleLabel?: string;
  title?: string;
  notice?: string;
}

/** Shared product navigation. Missing controls render display-only buttons. */
export function WorkspaceUtilityRail({ controls = {}, unavailableTitle }: { controls?: Partial<Record<RailAction, RailControl>>; unavailableTitle?: string }) {
  return <aside className="utility-rail" aria-label="工具">
    {entries.map(([id, icon, label]) => {
      const control = controls[id];
      return <Fragment key={id}>
        {id === "lock" && <span className="rail-spacer"/>}
        <button data-onboarding={`rail-${id}`} type="button" className={`rail-button${control?.active ? " active" : ""}${control?.notice ? " update-attention" : ""}`}
          aria-label={control?.accessibleLabel ?? (control?.notice ? `${label}，${control.notice}` : label)}
          title={control ? control.title ?? control.notice : unavailableTitle} aria-pressed={control?.active}
          aria-disabled={!control || undefined} disabled={!control || control.disabled} onClick={control?.onClick}>
          <Icon name={icon}/><span className="rail-button-label">{label}</span>
        </button>
      </Fragment>;
    })}
  </aside>;
}
