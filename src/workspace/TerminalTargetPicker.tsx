import { useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "../components/Icon";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { SessionState } from "../lib/tauri/sessions";

interface TerminalTargetPickerProps {
  profiles: ConnectionProfile[];
  selectedProfileId: string | null;
  status: SessionState;
  detail: string;
  onSelect: (profileId: string | null) => void;
  icon?: IconName;
  localName?: string;
  localDetail?: string;
  ariaContext?: string;
  allowLocal?: boolean;
}

export function TerminalTargetPicker({ profiles, selectedProfileId, status, detail, onSelect, icon = "terminal", localName = "本地终端", localDetail = "系统默认 Shell", ariaContext = "终端连接", allowLocal = true }: TerminalTargetPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const name = selected?.name ?? localName;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  function select(profileId: string | null) {
    setOpen(false);
    onSelect(profileId);
  }

  return <div className="terminal-target" ref={rootRef}>
    <span className={`connection-dot ${status}`} />
    <button
      className="terminal-target-trigger"
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`选择${ariaContext}，当前：${name}`}
      onClick={() => setOpen((current) => !current)}
    >
      <Icon name={icon} size={13}/>
      <span className="terminal-target-name">{name}</span>
      <span className="terminal-target-menu-icon" aria-hidden="true"><Icon name="menu" size={12}/></span>
    </button>
    <small>{detail}</small>
    {open && <div className="terminal-target-menu" role="menu" aria-label={ariaContext}>
      {allowLocal && <button role="menuitemradio" aria-checked={selectedProfileId === null} onClick={() => select(null)}>
        <Icon name={icon} size={13}/><span><strong>{localName}</strong><small>{localDetail}</small></span>
      </button>}
      {profiles.map((profile) => <button key={profile.id} role="menuitemradio" aria-checked={profile.id === selectedProfileId} onClick={() => select(profile.id)}>
        <Icon name="connections" size={13}/><span><strong>{profile.name}</strong><small>{profile.username}@{profile.host}:{profile.port}</small></span>
      </button>)}
      {profiles.length === 0 && <p>连接管理中暂无配置</p>}
    </div>}
  </div>;
}
