import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { ConnectionProfile, JumpCandidate, ProfileGroup } from "../../../lib/tauri/profiles";
import { Icon } from "../../Icon";
import { DialogActionStatus, DialogFrame } from "../DialogFrame";

export type SaveFeedback = { id: number; profileId: string };

export function ConnectionSaveFeedbackBubble({ feedback, getTarget }: { feedback: SaveFeedback; getTarget: () => HTMLElement | null }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    function updatePosition() {
      const target = getTarget();
      if (!target) { setPosition(null); return; }
      const rect = target.getBoundingClientRect();
      setPosition({
        left: Math.min(rect.right + 8, window.innerWidth - 170),
        top: Math.max(18, Math.min(rect.top + rect.height / 2, window.innerHeight - 18)),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [feedback.id, getTarget]);

  if (!position) return null;
  return createPortal(
    <p className="connection-save-feedback-bubble" data-feedback-for={feedback.profileId} role="status" aria-atomic="true" style={position}>
      连接配置已保存
    </p>,
    document.body,
  );
}

export function JumpProfilePicker({ index, currentProfileId, candidates, groups, loading, error, vaultUnlocked, onClose, onSelect }: {
  index: number;
  currentProfileId: string | null;
  candidates: JumpCandidate[];
  groups: ProfileGroup[];
  loading: boolean;
  error: string;
  vaultUnlocked: boolean;
  onClose: () => void;
  onSelect: (candidate: JumpCandidate | null) => void;
}) {
  const knownGroupIds = new Set(groups.map((group) => group.id));
  const groupedCandidates = [
    { id: "ungrouped", name: "未分组", candidates: candidates.filter((candidate) => !candidate.profile.groupId || !knownGroupIds.has(candidate.profile.groupId)) },
    ...groups.map((group) => ({ id: group.id, name: group.name, candidates: candidates.filter((candidate) => candidate.profile.groupId === group.id) })),
  ].filter((group) => group.candidates.length > 0);
  const selectableCount = candidates.filter((candidate) => candidate.selectable).length;
  return <DialogFrame
    title={`选择跃点 ${index + 1}`}
    subtitle="按连接分组选择一个 SSH 中间节点"
    className="jump-profile-picker-dialog"
    headerActions={<span className="jump-picker-count">{loading ? "检查中…" : `${selectableCount}/${candidates.length} 可选`}</span>}
    onClose={onClose}
  >
    <div className="jump-picker-layout">
      <div className="jump-picker-list" role="listbox" aria-label={`选择跃点 ${index + 1}`}>
        <section className="jump-picker-group jump-picker-direct" role="group" aria-labelledby={`jump-picker-direct-${index}`}>
          <header><strong id={`jump-picker-direct-${index}`}>连接方式</strong><small>不使用中间节点</small></header>
          <button type="button" className="jump-picker-option" role="option" aria-selected={!currentProfileId} data-dialog-autofocus={loading || !currentProfileId || undefined} onClick={() => onSelect(null)}>
            <span className="jump-picker-option-icon"><Icon name="computer" size={15}/></span>
            <span className="jump-picker-option-copy"><strong>直接连接</strong><small>从本机直接访问目标服务器</small></span>
            <span className="jump-picker-option-status">{!currentProfileId && <><Icon name="check" size={12}/>当前选择</>}</span>
          </button>
        </section>
        {loading && <div className="jump-picker-loading" role="status"><Icon name="refresh" size={15}/><span>正在检查连接资格与路径引用…</span></div>}
        {!loading && groupedCandidates.map((group) => <section className="jump-picker-group" role="group" aria-labelledby={`jump-picker-group-${group.id}`} key={group.id}>
          <header><strong id={`jump-picker-group-${group.id}`}>{group.name}</strong><small>{group.candidates.length} 个连接</small></header>
          {group.candidates.map((candidate) => {
            const selected = currentProfileId === candidate.profile.id;
            const locked = candidate.selectable && candidate.usesCredential && !vaultUnlocked;
            const status = candidate.reason ?? (locked ? "连接时需要解锁凭证库" : "可作为跃点");
            return <button type="button" className="jump-picker-option" role="option" aria-selected={selected} aria-disabled={!candidate.selectable} data-disabled={!candidate.selectable || undefined} data-dialog-autofocus={selected || undefined} key={candidate.profile.id} onClick={() => onSelect(candidate)}>
              <span className="jump-picker-option-icon"><Icon name="server" size={15}/></span>
              <span className="jump-picker-option-copy"><strong>{candidate.profile.name}</strong><small>{candidate.profile.username}@{candidate.profile.host}:{candidate.profile.port}</small></span>
              <span className={`jump-picker-option-status${candidate.selectable ? locked ? " locked" : "" : " unavailable"}`}>{locked && <Icon name="lock" size={11}/>}<span>{status}</span>{selected && <Icon name="check" size={12}/>}</span>
            </button>;
          })}
        </section>)}
        {!loading && candidates.length === 0 && !error && <div className="jump-picker-empty"><Icon name="connections" size={22}/><strong>没有其他连接</strong><p>创建并保存连接后即可将其选作跃点。</p></div>}
      </div>
      <footer className="dialog-actions dialog-actions-with-status jump-picker-actions"><DialogActionStatus message={error}/><div><button type="button" className="secondary-button" onClick={onClose}>取消</button></div></footer>
    </div>
  </DialogFrame>;
}

export function JumpRouteFlow({ profiles, jumpRows, targetName, targetEndpoint }: { profiles: ConnectionProfile[]; jumpRows: Array<string | null>; targetName: string; targetEndpoint: string }) {
  const jumps = jumpRows.flatMap((id) => {
    const profile = profiles.find((item) => item.id === id);
    return profile ? [profile] : [];
  });
  const ariaLabel = ["本机", ...jumps.map((profile) => profile.name), targetName].join(" 到 ");
  return <section className="jump-route-flow" aria-labelledby="jump-route-flow-title">
    <header><span><strong id="jump-route-flow-title">连接路径预览</strong><small className="jump-route-flow-subtitle">跃点按从本机到目标服务器的顺序执行，并使用各自保存的认证方式。</small></span><small className="jump-route-flow-limit">最多 4 个跃点</small></header>
    <div className="jump-route-flow-track" role="img" aria-label={ariaLabel}>
      <JumpFlowNode icon="computer" label="本机" value="当前设备"/>
      {jumps.map((profile, index) => <span className="jump-route-flow-segment" key={profile.id}><span className="jump-route-flow-connector" aria-hidden="true"/><JumpFlowNode icon="server" label={`跃点 ${index + 1}`} value={profile.name}/></span>)}
      <span className="jump-route-flow-segment"><span className="jump-route-flow-connector" aria-hidden="true"/><JumpFlowNode icon="server" label={targetName} value={targetEndpoint}/></span>
    </div>
  </section>;
}

function JumpFlowNode({ icon, label, value }: { icon: "computer" | "server"; label: string; value: string }) {
  return <span className="jump-route-flow-node" aria-hidden="true"><span className="jump-route-flow-icon"><Icon name={icon} size={15}/></span><span><small>{label}</small><code title={value}>{value}</code></span></span>;
}
