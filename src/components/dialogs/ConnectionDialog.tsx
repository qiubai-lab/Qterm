import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { getVaultStatus, listCredentials, type CredentialSummary, type VaultStatus } from "../../lib/tauri/credentials";
import { createProfile, createProfileGroup, deleteProfile, deleteProfileGroup, listProfileGroups, updateProfile, updateProfileGroup, type ConnectionProfile, type ProfileGroup, type ProfileInput } from "../../lib/tauri/profiles";
import { findLeaf, terminalBlockIds } from "../../workspace/layout";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { Icon } from "../Icon";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";
import { CredentialDialog } from "./CredentialDialog";
import { MasterPasswordDialog } from "./MasterPasswordDialog";
import { SshConfigImportDialog } from "./SshConfigImportDialog";

const empty: ProfileInput = { name: "", host: "", port: 22, username: "", authPreference: "password", credentialId: null, groupId: null };
type EditorTab = "connection" | "authentication";
type TabMotion = "idle" | "forward" | "backward";
type SaveState = "idle" | "saving" | "success";
type ContextMenuState = {
  x: number;
  y: number;
  target: { type: "group"; group: ProfileGroup } | { type: "profile"; profile: ConnectionProfile };
};
type DropTarget = string | "ungrouped" | null;
type PointerDragState = {
  profile: ConnectionProfile;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  width: number;
  active: boolean;
  targetGroupId: string | null | undefined;
};

export function ConnectionDialog({ onClose }: { onClose: () => void }) {
  const { profiles, refreshProfiles, activeWorkspace, activeBlockId, selectBlockTarget } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ProfileInput>(empty);
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(true);
  const [groupEditor, setGroupEditor] = useState<ProfileGroup | "new" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMessage, setGroupMessage] = useState("");
  const [groupDeleteRequested, setGroupDeleteRequested] = useState<ProfileGroup | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("connection");
  const [tabMotion, setTabMotion] = useState<TabMotion>("idle");
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({ initialized: false, unlocked: false, legacy: false });
  const [credentialManagerOpen, setCredentialManagerOpen] = useState(false);
  const [credentialUnlockOpen, setCredentialUnlockOpen] = useState(false);
  const [sshConfigImportOpen, setSshConfigImportOpen] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState<ConnectionProfile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pointerDrag, setPointerDrag] = useState<PointerDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const suppressClickRef = useRef(false);
  const initializedSelectionRef = useRef(false);
  const saveResetTimerRef = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const activeLeaf = findLeaf(activeWorkspace.layout, activeBlockId);
  const terminalBlockId = activeLeaf?.type === "terminal" ? activeLeaf.blockId : terminalBlockIds(activeWorkspace.layout)[0];
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;
  const linkedCredential = credentials.find((credential) => credential.id === editor.credentialId) ?? null;
  const knownGroupIds = new Set(groups.map((group) => group.id));
  const ungroupedProfiles = profiles.filter((profile) => !profile.groupId || !knownGroupIds.has(profile.groupId));
  const contextGroup = contextMenu?.target.type === "group" ? contextMenu.target.group : null;
  const contextProfile = contextMenu?.target.type === "profile" ? contextMenu.target.profile : null;

  useEffect(() => {
    void refreshCredentialSummaries();
  }, []);
  useEffect(() => {
    void listProfileGroups().then((items) => {
      setGroups(items);
      setCollapsedGroupIds(new Set(items.map((group) => group.id)));
    }).catch((error) => setMessage(errorMessage(error)));
  }, []);
  useEffect(() => {
    if (initializedSelectionRef.current || profiles.length === 0) return;
    initializedSelectionRef.current = true;
    chooseProfile(profiles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);
  useEffect(() => {
    if (!contextMenu) return;
    contextMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".connection-context-menu")) setContextMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", closeOnEscape); };
  }, [contextMenu]);
  useEffect(() => () => {
    if (saveResetTimerRef.current !== null) window.clearTimeout(saveResetTimerRef.current);
  }, []);

  function chooseProfile(profile: ConnectionProfile) {
    const changedProfile = profile.id !== selectedId;
    setSelectedId(profile.id);
    setEditor({ name: profile.name, host: profile.host, port: profile.port, username: profile.username, authPreference: profile.authPreference, credentialId: profile.credentialId, groupId: profile.groupId });
    if (changedProfile && saveState === "idle") { setEditorTab("connection"); setTabMotion("idle"); }
  }

  async function refreshCredentialSummaries() {
    try {
      const status = await getVaultStatus();
      setVaultStatus(status);
      setCredentials(status.initialized && !status.legacy ? await listCredentials() : []);
    } catch {
      setCredentials([]);
    }
  }

  function startNewProfile(groupId: string | null = null) {
    setSelectedId(null); setEditor({ ...empty, groupId }); setEditorTab("connection"); setTabMotion("idle"); setMessage(""); setSaveState("idle");
  }

  function selectEditorTab(next: EditorTab) {
    if (next === editorTab) return;
    setTabMotion(next === "authentication" ? "forward" : "backward");
    setEditorTab(next);
  }

  async function save() {
    if (saveState === "saving") return;
    if (saveResetTimerRef.current !== null) window.clearTimeout(saveResetTimerRef.current);
    setSaveState("saving"); setMessage("");
    try {
      const input = { ...editor, name: editor.name.trim() || editor.host.trim() };
      setEditor(input);
      const profile = selectedId ? await updateProfile(selectedId, input) : await createProfile(input);
      await refreshProfiles(); setSelectedId(profile.id);
      setSaveState("success");
      saveResetTimerRef.current = window.setTimeout(() => { setSaveState("idle"); saveResetTimerRef.current = null; }, 1400);
    } catch (error) { setSaveState("idle"); setMessage(errorMessage(error)); }
  }

  function requestDelete(profile: ConnectionProfile) {
    setDeleteMessage("");
    setDeleteRequested(profile);
  }

  async function remove(profile: ConnectionProfile | null = deleteRequested) {
    if (!profile) return;
    setDeleteBusy(true); setDeleteMessage("");
    try {
      const result = await deleteProfile(profile.id); await refreshProfiles();
      if (findProfileId(activeWorkspace.layout, terminalBlockId) === profile.id) await selectBlockTarget(activeWorkspace.id, terminalBlockId, null);
      if (selectedId === profile.id) startNewProfile();
      setDeleteRequested(null);
      setMessage(result.deletedNetworkRules > 0
        ? `连接配置已删除，已同时删除 ${result.deletedNetworkRules} 条关联网络转发规则；共享凭证保持不变`
        : "连接配置已删除，共享凭证保持不变");
    } catch (error) { setDeleteMessage(errorMessage(error)); }
    finally { setDeleteBusy(false); }
  }

  function openNewGroup() {
    setGroupEditor("new"); setGroupName(""); setGroupMessage("");
  }

  function openGroupManager(group: ProfileGroup) {
    setGroupEditor(group); setGroupName(group.name); setGroupMessage("");
  }

  async function saveGroup() {
    try {
      const creating = groupEditor === "new";
      const group = creating
        ? await createProfileGroup(groupName)
        : groupEditor
          ? await updateProfileGroup(groupEditor.id, groupName)
          : null;
      if (!group) return;
      setGroups((current) => groupEditor === "new" ? [...current, group] : current.map((item) => item.id === group.id ? group : item));
      if (creating) setCollapsedGroupIds((current) => new Set(current).add(group.id));
      setGroupEditor(null); setGroupMessage("");
    } catch (error) { setGroupMessage(errorMessage(error)); }
  }

  async function removeGroup() {
    if (!groupDeleteRequested) return;
    const group = groupDeleteRequested; setGroupDeleteRequested(null);
    try {
      await deleteProfileGroup(group.id);
      setGroups((current) => current.filter((item) => item.id !== group.id));
      setEditor((current) => current.groupId === group.id ? { ...current, groupId: null } : current);
      await refreshProfiles();
      setMessage(`已删除“${group.name}”，组内连接已移到未分组`);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, target: ContextMenuState["target"]) {
    event.preventDefault();
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 250)),
      target,
    });
  }

  function openContextMenuFromKeyboard(event: KeyboardEvent<HTMLElement>, target: ContextMenuState["target"]) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: Math.max(8, Math.min(bounds.left + 14, window.innerWidth - 190)),
      y: Math.max(8, Math.min(bounds.bottom, window.innerHeight - 250)),
      target,
    });
  }

  function beginPointerDrag(event: ReactPointerEvent<HTMLElement>, profile: ConnectionProfile) {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const drag: PointerDragState = {
      profile,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabX: event.clientX - bounds.left,
      grabY: event.clientY - bounds.top,
      width: Math.max(bounds.width, 150),
      active: false,
      targetGroupId: undefined,
    };
    pointerDragRef.current = drag;
    setPointerDrag(drag); setDropTarget(null); setContextMenu(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = pointerDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const active = current.active || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 8;
    if (!active) return;
    event.preventDefault();
    suppressClickRef.current = true;
    const targetGroupId = dropGroupAtPoint(event.clientX, event.clientY, current.profile.groupId);
    const next = { ...current, active: true, x: event.clientX, y: event.clientY, targetGroupId };
    pointerDragRef.current = next;
    setPointerDrag(next);
    setDropTarget(targetGroupId === undefined ? null : targetGroupId ?? "ungrouped");
  }

  function endPointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = pointerDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const { active, profile, targetGroupId } = current;
    clearPointerDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!active) return;
    event.preventDefault();
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    if (targetGroupId !== undefined) void moveProfile(profile, targetGroupId);
  }

  function cancelPointerDrag(event?: ReactPointerEvent<HTMLElement>) {
    const current = pointerDragRef.current;
    if (!current || (event && current.pointerId !== event.pointerId)) return;
    clearPointerDrag();
    if (event) event.currentTarget.releasePointerCapture?.(event.pointerId);
    suppressClickRef.current = false;
  }

  function clearPointerDrag() {
    pointerDragRef.current = null;
    setPointerDrag(null); setDropTarget(null);
  }

  async function moveProfile(profile: ConnectionProfile, groupId: string | null) {
    setContextMenu(null);
    if ((profile.groupId ?? null) === groupId) return;
    try {
      await updateProfile(profile.id, profileToInput(profile, groupId));
      if (selectedId === profile.id) setEditor((current) => ({ ...current, groupId }));
      await refreshProfiles();
      const destination = groups.find((group) => group.id === groupId)?.name ?? "未分组";
      setMessage(`已将“${profile.name}”移到${destination}`);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function duplicateProfile(profile: ConnectionProfile) {
    setContextMenu(null); setMessage("");
    try {
      const input = {
        ...profileToInput(profile, profile.groupId),
        name: duplicateProfileName(profile.name, profiles),
      };
      const duplicate = await createProfile(input);
      await refreshProfiles();
      if (duplicate.groupId) {
        setCollapsedGroupIds((current) => {
          const next = new Set(current); next.delete(duplicate.groupId!); return next;
        });
      } else {
        setUngroupedCollapsed(false);
      }
      chooseProfile(duplicate);
      setMessage(`已复制“${profile.name}”为“${duplicate.name}”`);
    } catch (error) { setMessage(errorMessage(error)); }
  }

  function profileItem(profile: ConnectionProfile) {
    return <div
      key={profile.id}
      role="button"
      tabIndex={0}
      className={`${selectedId === profile.id ? "connection-item selected" : "connection-item"}${pointerDrag?.active && pointerDrag.profile.id === profile.id ? " dragging" : ""}`}
      onClick={(event) => { if (suppressClickRef.current) { event.preventDefault(); return; } chooseProfile(profile); }}
      onMouseDown={(event) => { if (event.button === 2) openContextMenu(event, { type: "profile", profile }); }}
      onContextMenu={(event) => openContextMenu(event, { type: "profile", profile })}
      onKeyDown={(event) => {
        openContextMenuFromKeyboard(event, { type: "profile", profile });
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseProfile(profile); }
      }}
      onPointerDown={(event) => beginPointerDrag(event, profile)}
      onPointerMove={movePointerDrag}
      onPointerUp={endPointerDrag}
      onPointerCancel={cancelPointerDrag}
      onLostPointerCapture={() => { if (pointerDragRef.current?.profile.id === profile.id) clearPointerDrag(); }}
    ><span className="connection-item-status" aria-hidden="true"/><span className="connection-item-copy"><strong className="connection-item-name">{profile.name}</strong><small className="connection-item-endpoint"><span className="connection-item-address" title={`${profile.username}@${profile.host}:${profile.port}`}>{profile.username}@{profile.host}:{profile.port}</span><span className="connection-item-auth">{authPreferenceLabel(profile.authPreference)}</span></small></span></div>;
  }

  return <>
    <DialogFrame
      title="连接管理"
      subtitle="管理 SSH 连接配置"
      headerActions={<><span className={`vault-status-button ${vaultStatus.initialized ? "initialized" : "uninitialized"}`}><span aria-hidden="true"/>{vaultStatus.unlocked ? "凭证库已解锁" : vaultStatus.initialized ? "凭证库已锁定" : vaultStatus.legacy ? "旧版凭证库" : "凭证库未初始化"}</span><button type="button" className="connection-import-button" onClick={() => setSshConfigImportOpen(true)}><Icon name="upload" size={13}/>导入</button></>}
      onClose={credentialManagerOpen || credentialUnlockOpen || sshConfigImportOpen || deleteRequested || groupEditor || groupDeleteRequested || contextMenu ? () => undefined : onClose}
      wide
    >
      <div className="connection-dialog-grid">
        <aside className="connection-sidebar">
          <div className="connection-sidebar-toolbar">
            <div className="connection-list-actions"><button data-dialog-autofocus onClick={() => startNewProfile()}>＋ 新建连接</button><button onClick={openNewGroup}>＋ 新建分组</button></div>
          </div>
          <div className="connection-list">
            <section className="connection-group-section" data-profile-drop-group="">
              <header
                className={`connection-group-heading${dropTarget === "ungrouped" ? " drop-target" : ""}`}
              ><button className="connection-group-toggle" aria-expanded={!ungroupedCollapsed} title="单击折叠未分组连接" onClick={() => setUngroupedCollapsed((current) => !current)}><span className="connection-group-chevron" aria-hidden="true">›</span><strong>未分组</strong><small>{ungroupedProfiles.length}</small></button></header>
              {!ungroupedCollapsed && <div className="connection-group-items">{ungroupedProfiles.map(profileItem)}{ungroupedProfiles.length === 0 && <p>暂无连接</p>}</div>}
            </section>
            {groups.map((group) => {
              const groupProfiles = profiles.filter((profile) => profile.groupId === group.id);
              const expanded = !collapsedGroupIds.has(group.id);
              return <section className="connection-group-section" data-profile-drop-group={group.id} key={group.id}>
                <header
                  className={`connection-group-heading${dropTarget === group.id ? " drop-target" : ""}`}
                >
                  <button
                    className="connection-group-toggle"
                    aria-expanded={expanded}
                    title="单击折叠，右键管理分组"
                    onClick={() => toggleGroup(group.id)}
                    onContextMenu={(event) => openContextMenu(event, { type: "group", group })}
                    onKeyDown={(event) => openContextMenuFromKeyboard(event, { type: "group", group })}
                  ><span className="connection-group-chevron" aria-hidden="true">›</span><strong>{group.name}</strong><small>{groupProfiles.length}</small></button>
                </header>
                {expanded && <div className="connection-group-items">{groupProfiles.map(profileItem)}{groupProfiles.length === 0 && <p>暂无连接</p>}</div>}
              </section>;
            })}
          </div>
        </aside>
        <div className="connection-editor">
          <div className="connection-editor-tabs" role="tablist" aria-label="连接配置" data-active={editorTab}>
            <span className="connection-editor-tab-indicator" aria-hidden="true"/>
            <button type="button" role="tab" aria-selected={editorTab === "connection"} tabIndex={editorTab === "connection" ? 0 : -1} onClick={() => selectEditorTab("connection")} onKeyDown={(event) => { if (event.key === "ArrowRight") { selectEditorTab("authentication"); (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus(); } }}><span>连接信息</span></button>
            <button type="button" role="tab" aria-selected={editorTab === "authentication"} tabIndex={editorTab === "authentication" ? 0 : -1} onClick={() => selectEditorTab("authentication")} onKeyDown={(event) => { if (event.key === "ArrowLeft") { selectEditorTab("connection"); (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); } }}><span>认证方式</span></button>
          </div>
          <div className="connection-editor-scroll">
            {editorTab === "connection" && <div className={`form-grid connection-tab-panel${tabMotion === "backward" ? " tab-backward" : tabMotion === "forward" ? " tab-forward" : ""}`} role="tabpanel" aria-label="连接信息">
              <label className="span-2">名称<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}/></label>
              <label className="span-2">分组<select value={editor.groupId ?? ""} onChange={(event) => setEditor({ ...editor, groupId: event.target.value || null })}><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <label>主机<input value={editor.host} onChange={(event) => setEditor({ ...editor, host: event.target.value })}/></label>
              <label>端口<input type="number" min="1" max="65535" value={editor.port} onChange={(event) => setEditor({ ...editor, port: Number(event.target.value) })}/></label>
              <label className="span-2">用户名<input value={editor.username} onChange={(event) => setEditor({ ...editor, username: event.target.value })}/></label>
            </div>}
            {editorTab === "authentication" && <div className={`form-grid connection-tab-panel connection-auth-panel${tabMotion === "forward" ? " tab-forward" : tabMotion === "backward" ? " tab-backward" : ""}`} role="tabpanel" aria-label="认证方式">
              <label className="span-2">认证方式<select value={editor.authPreference} onChange={(event) => {
                const authPreference = event.target.value as ProfileInput["authPreference"];
                setEditor({ ...editor, authPreference, credentialId: authPreference === "manual" || authPreference === "sshAgent" ? null : editor.credentialId });
              }}><option value="password">密码凭证</option><option value="privateKey">私钥凭证</option><option value="sshAgent">SSH Agent（推荐）</option><option value="manual">手动选择</option></select></label>
              {(editor.authPreference === "password" || editor.authPreference === "privateKey") && <><p className="callout span-2">连接只保存凭证引用；实际{editor.authPreference === "password" ? "密码" : "私钥"}由加密凭证库提供。应用每次启动后需要先解锁凭证库。</p><div className="credential-reference-field span-2"><label>引用凭证{vaultStatus.unlocked ? <select value={editor.credentialId ?? ""} onChange={(event) => setEditor({ ...editor, credentialId: event.target.value || null })}><option value="">未选择凭证</option>{credentials.filter((item) => item.kind === editor.authPreference).map((item) => <option value={item.id} key={item.id}>{item.name}{item.detail ? ` · ${item.detail}` : ""}</option>)}</select> : <button type="button" className="credential-reference-locked" aria-label={`解锁后选择凭证，当前：${linkedCredential?.name ?? (editor.credentialId ? "已关联凭证" : "未选择凭证")}`} disabled={!vaultStatus.initialized || vaultStatus.legacy} onClick={() => setCredentialUnlockOpen(true)}><span>{linkedCredential?.name ?? (editor.credentialId ? "已关联凭证" : "未选择凭证")}{linkedCredential?.detail ? ` · ${linkedCredential.detail}` : ""}</span><Icon name="lock" size={12}/></button>}</label><button type="button" className="secondary-button credential-manage-button" onClick={() => setCredentialManagerOpen(true)}><Icon name="key" size={13}/>管理凭证</button></div>{!vaultStatus.unlocked && <p className="dialog-note span-2">当前关联凭证仍可查看；更改选择前需要解锁凭证库。</p>}</>}
              {editor.authPreference === "sshAgent" && <div className="agent-auth-note span-2"><strong>使用系统 SSH Agent</strong><p>应用只请求 Agent 完成签名，不读取、不扫描也不保存私钥。</p></div>}
              {editor.authPreference === "manual" && <div className="agent-auth-note span-2"><strong>每次连接时手动选择</strong><p>连接前选择一次性密码、凭证库凭证或 SSH Agent，本次选择不会保存。</p></div>}
            </div>}
            {message && <p className="inline-message" role="alert">{message}</p>}
          </div>
          <footer className="dialog-actions connection-editor-actions">{selected && <button className="danger-button" onClick={() => requestDelete(selected)}>删除</button>}<button className={`primary-button connection-save-button ${saveState}`} data-state={saveState} disabled={saveState !== "idle"} aria-live="polite" onClick={() => void save()}><span>{saveState === "saving" ? "保存中…" : saveState === "success" ? "保存成功" : "保存配置"}</span></button></footer>
        </div>
      </div>
    </DialogFrame>
    {pointerDrag?.active && <div
      className="connection-drag-preview"
      aria-hidden="true"
      style={{
        width: pointerDrag.width,
        transform: `translate3d(${pointerDrag.x - pointerDrag.grabX}px, ${pointerDrag.y - pointerDrag.grabY}px, 0)`,
      }}
    ><strong>{pointerDrag.profile.name}</strong><small>{pointerDrag.profile.username}@{pointerDrag.profile.host}:{pointerDrag.profile.port}</small></div>}
    {contextMenu && <div
      ref={contextMenuRef}
      className="connection-context-menu"
      role="menu"
      aria-label={contextGroup ? `${contextGroup.name} 分组菜单` : `${contextProfile?.name ?? "连接"} 连接菜单`}
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {contextGroup ? <>
        <button role="menuitem" onClick={() => { setContextMenu(null); startNewProfile(contextGroup.id); }}>在此分组新建连接</button>
        <button role="menuitem" onClick={() => { setContextMenu(null); openGroupManager(contextGroup); }}>重命名分组</button>
        <div className="connection-context-menu-separator" role="separator"/>
        <button className="danger" role="menuitem" onClick={() => { setContextMenu(null); setGroupDeleteRequested(contextGroup); }}>删除分组</button>
      </> : contextProfile ? <>
        <button role="menuitem" onClick={() => { setContextMenu(null); chooseProfile(contextProfile); }}>编辑连接</button>
        <button role="menuitem" onClick={() => void duplicateProfile(contextProfile)}>复制连接</button>
        <div className="connection-context-menu-separator" role="separator"/>
        <button className="danger" role="menuitem" onClick={() => { setContextMenu(null); requestDelete(contextProfile); }}>删除连接</button>
      </> : null}
    </div>}
    {groupEditor && <DialogFrame title={groupEditor === "new" ? "新建分组" : "管理分组"} subtitle="连接分组仅支持一层" compact onClose={() => setGroupEditor(null)}>
      <label>分组名称<input data-dialog-autofocus value={groupName} maxLength={80} onChange={(event) => setGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveGroup(); }}/></label>
      {groupMessage && <p className="inline-message" role="alert">{groupMessage}</p>}
      <footer className={`dialog-actions group-editor-actions${groupEditor === "new" ? " end" : ""}`}>{groupEditor !== "new" && <button className="danger-button" onClick={() => { setGroupEditor(null); setGroupDeleteRequested(groupEditor); }}>删除分组</button>}<div><button className="secondary-button" onClick={() => setGroupEditor(null)}>取消</button><button className="primary-button" onClick={() => void saveGroup()}>{groupEditor === "new" ? "创建分组" : "保存分组"}</button></div></footer>
    </DialogFrame>}
    {groupDeleteRequested && <DialogFrame title="删除分组？" subtitle={groupDeleteRequested.name} compact onClose={() => setGroupDeleteRequested(null)}>
      <p className="confirm-copy">该分组内的连接不会被删除，而会自动移到“未分组”。</p>
      <footer className="dialog-actions end"><button className="secondary-button" onClick={() => setGroupDeleteRequested(null)}>取消</button><button className="danger-button filled" data-dialog-autofocus onClick={() => void removeGroup()}>确认删除</button></footer>
    </DialogFrame>}
    {deleteRequested && <DialogFrame title="删除连接？" subtitle={deleteRequested.name} compact dismissible={!deleteBusy} onClose={() => { if (!deleteBusy) setDeleteRequested(null); }}>
      <p className="confirm-copy">删除后将同时移除此连接及其关联的网络转发规则；共享凭证保持不变。此操作无法撤销。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={deleteMessage}/><div><button className="secondary-button" disabled={deleteBusy} onClick={() => setDeleteRequested(null)}>取消</button><button className="danger-button filled" data-dialog-autofocus disabled={deleteBusy} onClick={() => void remove()}>{deleteBusy ? "正在删除…" : "确认删除"}</button></div></footer>
    </DialogFrame>}
    {credentialManagerOpen && (
      <CredentialDialog onClose={() => {
        setCredentialManagerOpen(false);
        void refreshCredentialSummaries();
      }}/>
    )}
    {credentialUnlockOpen && (
      <MasterPasswordDialog mode="unlock" onClose={() => setCredentialUnlockOpen(false)} onSuccess={() => {
        setCredentialUnlockOpen(false);
        void refreshCredentialSummaries();
      }}/>
    )}
    {sshConfigImportOpen && (
      <SshConfigImportDialog
        onClose={() => setSshConfigImportOpen(false)}
        onImported={async (result) => {
          await refreshProfiles();
          await refreshCredentialSummaries();
          const credentialResult = [
            result.importedPrivateKeys > 0 ? `新建 ${result.importedPrivateKeys} 个私钥凭证` : "",
            result.reusedPrivateKeys > 0 ? `复用 ${result.reusedPrivateKeys} 个已有凭证` : "",
          ].filter(Boolean).join("，");
          setMessage(`已导入 ${result.imported} 个连接${credentialResult ? `，${credentialResult}` : ""}`);
        }}
      />
    )}
  </>;
}

function findProfileId(node: import("../../workspace/model").LayoutNode, blockId: string): string | null {
  if (node.type === "terminal") return node.blockId === blockId ? node.profileId : null;
  if (node.type === "files" || node.type === "network") return null;
  return findProfileId(node.first, blockId) ?? findProfileId(node.second, blockId);
}

function profileToInput(profile: ConnectionProfile, groupId: string | null): ProfileInput {
  return {
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authPreference: profile.authPreference,
    credentialId: profile.credentialId,
    groupId,
  };
}

function duplicateProfileName(name: string, profiles: ConnectionProfile[]): string {
  const names = new Set(profiles.map((profile) => profile.name));
  const base = `${name} 副本`;
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

function dropGroupAtPoint(x: number, y: number, currentGroupId: string | null): string | null | undefined {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-profile-drop-group]");
  if (!target) return undefined;
  const groupId = target.dataset.profileDropGroup || null;
  return groupId === (currentGroupId ?? null) ? undefined : groupId;
}

function errorMessage(error: unknown): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : "操作失败";
}

function authPreferenceLabel(preference: ConnectionProfile["authPreference"]): string {
  if (preference === "privateKey") return "私钥";
  if (preference === "sshAgent") return "代理";
  if (preference === "manual") return "手动";
  return "密码";
}
