import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { NETWORK_RULE_TYPE_OPTIONS, type NetworkRuleType } from "./networkRuleTypes";

export function NetworkRuleTypeDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (type: NetworkRuleType) => void }) {
  return <DialogFrame title="选择网络模式" subtitle="选择用途后，再填写监听端口和目标地址" className="network-type-dialog" onClose={onClose}>
    <div className="network-type-options" aria-label="网络模式">
      {NETWORK_RULE_TYPE_OPTIONS.map((option, index) => <button key={option.type} className="network-type-option" data-type={option.type} data-dialog-autofocus={index === 0 || undefined} onClick={() => onSelect(option.type)}>
        <span className="network-type-option-icon"><Icon name="network" size={18}/></span>
        <span className="network-type-option-copy"><span className="network-type-badge">{option.badge}</span><strong>{option.title}</strong><code>{option.direction}</code><small>{option.description}</small></span>
      </button>)}
    </div>
  </DialogFrame>;
}
