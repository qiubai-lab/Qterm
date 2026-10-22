import { Button } from "../../Button";
import { Icon, type IconName } from "../../Icon";
import type { MergeOptions, MergeScan } from "../../../lib/tauri/configurationMerge";

const items: { key: keyof MergeOptions; title: string; icon: IconName; hint: string }[] = [
  { key: "connections", title: "连接与分组", icon: "server", hint: "保留分组与跳板机关系" },
  { key: "network", title: "网络规则", icon: "network", hint: "随连接导入，保持停止" },
  { key: "credentials", title: "凭证", icon: "key", hint: "默认不合并，选择后验证主密码" },
];

export function MergeConfirmation({ scan, options, busy, onChange, onPreview }: { scan: MergeScan; options: MergeOptions; busy: boolean; onPreview?: () => void; onChange: (key: keyof MergeOptions, checked: boolean) => void }) {
  return <>
    <fieldset className="configuration-merge-options" disabled={busy}><legend>选择合并项<span>{onPreview ? <Button className="configuration-merge-preview-trigger" onClick={onPreview}>查看变更</Button> : busy ? "正在检查…" : "重复内容自动跳过"}</span></legend>
      {items.map(({ key, title, icon, hint }) => <label key={key} data-selected={options[key]}>
        <span className="configuration-merge-option-icon"><Icon name={icon} size={16}/></span>
        <span className="configuration-merge-option-copy"><strong>{title}</strong><small>{scan[key].error || (key === "credentials" && options.credentials ? "已验证 · 使用当前凭证库加密" : hint)}</small></span>
        <span className="configuration-merge-count">{scan[key].count} 项</span>
        <input type="checkbox" aria-label={title} checked={options[key]} disabled={!!scan[key].error || scan[key].count === 0 || (key === "network" && !options.connections)} onChange={(e) => onChange(key, e.target.checked)}/>
      </label>)}
    </fieldset>

  </>;
}
