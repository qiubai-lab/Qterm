import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { getVaultStatus, listCredentials, type CredentialSummary, type VaultStatus } from "../../lib/tauri/credentials";
import { clearUnsupportedProfileStorage, createProfile, createProfileGroup, deleteProfile, deleteProfileGroup, listJumpCandidates, listProfileGroups, updateProfile, updateProfileGroup, type ConnectionProfile, type JumpCandidate, type ProfileGroup, type ProfileInput } from "../../lib/tauri/profiles";
import { findLeaf, terminalBlockIds } from "../../workspace/layout";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { Icon } from "../Icon";
import { RequiredFieldLabel } from "../RequiredFieldLabel";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";
import { CredentialDialog } from "./CredentialDialog";
import { MasterPasswordDialog } from "./MasterPasswordDialog";
import { SshConfigImportDialog } from "./SshConfigImportDialog";

const empty: ProfileInput = { name: "", host: "", port: 22, username: "", authPreference: "password", credentialId: null, groupId: null, jumpProfileIds: [] };
type EditorTab = "connection" | "authentication" | "jump";
type TabMotion = "idle" | "forward" | "backward";
type SaveState = "idle" | "saving" | "success";
type ContextMenuState = {
  x: number;
  y: number;
  target: { type: "group"; group: ProfileGroup } | { type: "profile"; profile: ConnectionProfile };
};
type DropTarget = string | "ungrouped" | null;
type PointerDragState = {
  profiles: ConnectionProfile[];
  anchorProfile: ConnectionProfile;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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
  const [deleteRequested, setDeleteRequested] = useState<ConnectionProfile[] | null>(null);
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
  const [profileStorageUnsupported, setProfileStorageUnsupported] = useState(false);
  const [clearStorageRequested, setClearStorageRequested] = useState(false);
  const [clearStorageBusy, setClearStorageBusy] = useState(false);
  const [clearStorageMessage, setClearStorageMessage] = useState("");
  const [jumpRows, setJumpRows] = useState<Array<string | null>>([null]);
  const [jumpCandidates, setJumpCandidates] = useState<JumpCandidate[]>([]);
  const [jumpPickerOpen, setJumpPickerOpen] = useState<number | null>(null);
  const [jumpCandidatesLoading, setJumpCandidatesLoading] = useState(false);
  const [jumpCandidatesError, setJumpCandidatesError] = useState("");
  const activeLeaf = findLeaf(activeWorkspace.layout, activeBlockId);
  const terminalBlockId = activeLeaf?.type === "terminal" ? activeLeaf.blockId : terminalBlockIds(activeWorkspace.layout)[0];
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;
  const linkedCredential = credentials.find((credential) => credential.id === editor.credentialId) ?? null;
  const knownGroupIds = new Set(groups.map((group) => group.id));
  const ungroupedProfiles = profiles.filter((profile) => !profile.groupId || !knownGroupIds.has(profile.groupId));
  const contextGroup = contextMenu?.target.type === "group" ? contextMenu.target.group : null;
  const contextProfile = contextMenu?.target.type === "profile" ? contextMenu.target.profile : null;
  const contextProfiles = contextProfile
    ? selectedIds.has(contextProfile.id) ? profiles.filter((profile) => selectedIds.has(profile.id)) : [contextProfile]
    : [];

  useEffect(() => {
    void refreshCredentialSummaries();
  }, []);
  useEffect(() => {
    void listProfileGroups().then((items) => {
      setGroups(items);
      setProfileStorageUnsupported(false);
      setCollapsedGroupIds(new Set(items.map((group) => group.id)));
    }).catch((error) => {
      setProfileStorageUnsupported(errorCode(error) === "profileStorageVersionUnsupported");
      setMessage(errorMessage(error));
    });
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

  function editProfile(profile: ConnectionProfile) {
    const changedProfile = profile.id !== selectedId;
    setSelectedId(profile.id);
    setEditor({ name: profile.name, host: profile.host, port: profile.port, username: profile.username, authPreference: profile.authPreference, credentialId: profile.credentialId, groupId: profile.groupId, jumpProfileIds: profile.jumpProfileIds ?? [] });
    setJumpRows(profile.jumpProfileIds?.length ? [...profile.jumpProfileIds] : [null]);
    setJumpPickerOpen(null);
    if (changedProfile && saveState === "idle") { setEditorTab("connection"); setTabMotion("idle"); }
  }

  function chooseProfile(profile: ConnectionProfile) {
    setSelectedIds(new Set([profile.id]));
    editProfile(profile);
  }

  function toggleProfileSelection(profile: ConnectionProfile) {
    const next = new Set(selectedIds);
    if (next.has(profile.id)) {
      next.delete(profile.id);
      setSelectedIds(next);
      if (selectedId === profile.id) {
        const replacement = profiles.find((item) => next.has(item.id));
        if (replacement) editProfile(replacement);
        else startNewProfile();
      }
      return;
    }
    next.add(profile.id);
    setSelectedIds(next);
    editProfile(profile);
  }

  function activateProfile(profile: ConnectionProfile, additive: boolean) {
    if (additive) toggleProfileSelection(profile);
    else chooseProfile(profile);
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

  async function openJumpPicker(index: number) {
    setJumpPickerOpen(index);
    setJumpCandidatesLoading(true);
    setJumpCandidatesError("");
    try {
      setJumpCandidates(await listJumpCandidates(selectedId, jumpRows.filter((id, rowIndex): id is string => rowIndex !== index && Boolean(id))));
    } catch (error) {
      setJumpCandidatesError(errorMessage(error));
      setJumpCandidates([]);
    } finally {
      setJumpCandidatesLoading(false);
    }
  }

  function chooseJumpCandidate(index: number, candidate: JumpCandidate | null) {
    if (candidate && !candidate.selectable) return;
    setJumpRows((current) => candidate
      ? current.map((value, rowIndex) => rowIndex === index ? candidate.profile.id : value)
      : current.slice(0, index + 1).map((value, rowIndex) => rowIndex === index ? null : value));
    setJumpPickerOpen(null);
  }

  function startNewProfile(groupId: string | null = null) {
    setSelectedId(null); setSelectedIds(new Set()); setEditor({ ...empty, groupId }); setJumpRows([null]); setEditorTab("connection"); setTabMotion("idle"); setMessage(""); setSaveState("idle");
  }

  function selectEditorTab(next: EditorTab) {
    if (next === editorTab) return;
    const order: EditorTab[] = ["connection", "authentication", "jump"];
    setTabMotion(order.indexOf(next) > order.indexOf(editorTab) ? "forward" : "backward");
    setEditorTab(next);
  }

  function moveEditorTab(event: KeyboardEvent<HTMLButtonElement>, current: EditorTab) {
    const tabs: EditorTab[] = ["connection", "authentication", "jump"];
    let index = tabs.indexOf(current);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault();
    selectEditorTab(tabs[index]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role='tab']")[index]?.focus();
  }

  function addJumpRow() {
    if (jumpRows.length >= 4 || !jumpRows[jumpRows.length - 1]) return;
    setJumpRows((current) => [...current, null]);
  }

  function removeJumpRow(index: number) {
    setJumpRows((current) => current.length === 1 ? [null] : current.filter((_, rowIndex) => rowIndex !== index));
    setJumpPickerOpen(null);
  }

  async function clearUnsupportedStorage() {
    if (clearStorageBusy) return;
    setClearStorageBusy(true);
    setClearStorageMessage("");
    try {
      await clearUnsupportedProfileStorage();
      await refreshProfiles();
      setGroups(await listProfileGroups());
      setProfileStorageUnsupported(false);
      setClearStorageRequested(false);
      startNewProfile();
      setMessage("旧连接配置与网络转发规则已清除");
    } catch (error) {
      setClearStorageMessage(errorMessage(error));
    } finally {
      setClearStorageBusy(false);
    }
  }

  async function save() {
    if (saveState === "saving") return;
    if (saveResetTimerRef.current !== null) window.clearTimeout(saveResetTimerRef.current);
    setSaveState("saving"); setMessage("");
    try {
      const input = { ...editor, name: editor.name.trim() || editor.host.trim(), jumpProfileIds: jumpRows.filter((id): id is string => Boolean(id)) };
      setEditor(input);
      const profile = selectedId ? await updateProfile(selectedId, input) : await createProfile(input);
      await refreshProfiles(); setSelectedId(profile.id); setSelectedIds(new Set([profile.id]));
      setSaveState("success");
      saveResetTimerRef.current = window.setTimeout(() => { setSaveState("idle"); saveResetTimerRef.current = null; }, 1400);
    } catch (error) { setSaveState("idle"); setMessage(errorMessage(error)); }
  }

  function requestDelete(requestedProfiles: ConnectionProfile | ConnectionProfile[]) {
    setDeleteMessage("");
    setDeleteRequested(Array.isArray(requestedProfiles) ? requestedProfiles : [requestedProfiles]);
  }

  async function remove(requestedProfiles: ConnectionProfile[] | null = deleteRequested) {
    if (!requestedProfiles?.length) return;
    setDeleteBusy(true); setDeleteMessage("");
    try {
      const results = await Promise.all(requestedProfiles.map((profile) => deleteProfile(profile.id)));
      await refreshProfiles();
      const deletedIds = new Set(requestedProfiles.map((profile) => profile.id));
      if (deletedIds.has(findProfileId(activeWorkspace.layout, terminalBlockId) ?? "")) await selectBlockTarget(activeWorkspace.id, terminalBlockId, null);
      if (selectedId && deletedIds.has(selectedId)) startNewProfile();
      else setSelectedIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
      setDeleteRequested(null);
      const deletedNetworkRules = results.reduce((total, result) => total + result.deletedNetworkRules, 0);
      const prefix = requestedProfiles.length > 1 ? `已删除 ${requestedProfiles.length} 个连接配置` : "连接配置已删除";
      setMessage(deletedNetworkRules > 0
        ? `${prefix}，已同时删除 ${deletedNetworkRules} 条关联网络转发规则；共享凭证保持不变`
        : `${prefix}，共享凭证保持不变`);
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
    if (target.type === "profile" && !selectedIds.has(target.profile.id)) chooseProfile(target.profile);
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 250)),
      target,
    });
  }

  function openContextMenuFromKeyboard(event: KeyboardEvent<HTMLElement>, target: ContextMenuState["target"]) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    if (target.type === "profile" && !selectedIds.has(target.profile.id)) chooseProfile(target.profile);
    const bounds = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: Math.max(8, Math.min(bounds.left + 14, window.innerWidth - 190)),
      y: Math.max(8, Math.min(bounds.bottom, window.innerHeight - 250)),
      target,
    });
  }

  function beginPointerDrag(event: ReactPointerEvent<HTMLElement>, profile: ConnectionProfile) {
    if (event.button !== 0) return;
    const additive = event.metaKey || event.ctrlKey;
    const draggedProfiles = selectedIds.has(profile.id)
      ? profiles.filter((item) => selectedIds.has(item.id))
      : [profile];
    if (!selectedIds.has(profile.id) && !additive) chooseProfile(profile);
    const bounds = event.currentTarget.getBoundingClientRect();
    const drag: PointerDragState = {
      profiles: draggedProfiles,
      anchorProfile: profile,
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
    const targetGroupId = dropGroupAtPoint(event.clientX, event.clientY, current.profiles);
    const next = { ...current, active: true, x: event.clientX, y: event.clientY, targetGroupId };
    pointerDragRef.current = next;
    setPointerDrag(next);
    setDropTarget(targetGroupId === undefined ? null : targetGroupId ?? "ungrouped");
  }

  function endPointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = pointerDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const { active, profiles: draggedProfiles, targetGroupId } = current;
    clearPointerDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!active) return;
    event.preventDefault();
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    if (targetGroupId !== undefined) void moveProfiles(draggedProfiles, targetGroupId);
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

  async function moveProfiles(requestedProfiles: ConnectionProfile[], groupId: string | null) {
    setContextMenu(null);
    const movableProfiles = requestedProfiles.filter((profile) => (profile.groupId ?? null) !== groupId);
    if (movableProfiles.length === 0) return;
    try {
      await Promise.all(movableProfiles.map((profile) => updateProfile(profile.id, profileToInput(profile, groupId))));
      if (selectedId && movableProfiles.some((profile) => profile.id === selectedId)) setEditor((current) => ({ ...current, groupId }));
      await refreshProfiles();
      const destination = groups.find((group) => group.id === groupId)?.name ?? "未分组";
      setMessage(movableProfiles.length > 1 ? `已将 ${movableProfiles.length} 个连接移到${destination}` : `已将“${movableProfiles[0].name}”移到${destination}`);
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
    const isSelected = selectedIds.has(profile.id);
    const isDragging = pointerDrag?.active && pointerDrag.profiles.some((item) => item.id === profile.id);
    return <div
      key={profile.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={`${isSelected ? "connection-item selected" : "connection-item"}${isDragging ? " dragging" : ""}`}
      onClick={(event) => { if (suppressClickRef.current) { event.preventDefault(); return; } activateProfile(profile, event.metaKey || event.ctrlKey); }}
      onMouseDown={(event) => { if (event.button === 2) openContextMenu(event, { type: "profile", profile }); }}
      onContextMenu={(event) => openContextMenu(event, { type: "profile", profile })}
      onKeyDown={(event) => {
        openContextMenuFromKeyboard(event, { type: "profile", profile });
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateProfile(profile, event.metaKey || event.ctrlKey); }
      }}
      onPointerDown={(event) => beginPointerDrag(event, profile)}
      onPointerMove={movePointerDrag}
      onPointerUp={endPointerDrag}
      onPointerCancel={cancelPointerDrag}
      onLostPointerCapture={() => { if (pointerDragRef.current?.anchorProfile.id === profile.id) clearPointerDrag(); }}
    ><span className="connection-item-status" aria-hidden="true"/><span className="connection-item-copy"><strong className="connection-item-name">{profile.name}</strong><small className="connection-item-endpoint"><span className="connection-item-address" title={`${profile.username}@${profile.host}:${profile.port}`}>{profile.username}@{profile.host}:{profile.port}</span><span className="connection-item-auth">{authPreferenceLabel(profile.authPreference)}</span></small></span></div>;
  }

  return <>
    <DialogFrame
      title="连接管理"
      subtitle="管理 SSH 连接配置"
      headerActions={<>{profileStorageUnsupported && <span className="connection-storage-warning"><span className="connection-storage-warning-message" role="alert" title="连接配置文件版本不受支持">连接配置文件版本不受支持</span><button type="button" className="danger-button connection-storage-clear" onClick={() => { setClearStorageMessage(""); setClearStorageRequested(true); }}><Icon name="trash" size={13}/>清除旧配置</button></span>}<span className={`vault-status-button ${vaultStatus.initialized ? "initialized" : "uninitialized"}`}><span aria-hidden="true"/>{vaultStatus.unlocked ? "凭证库已解锁" : vaultStatus.initialized ? "凭证库已锁定" : vaultStatus.legacy ? "旧版凭证库" : "凭证库未初始化"}</span><button type="button" className="connection-import-button" onClick={() => setSshConfigImportOpen(true)}><Icon name="upload" size={13}/>导入</button></>}
      onClose={credentialManagerOpen || credentialUnlockOpen || sshConfigImportOpen || jumpPickerOpen !== null || deleteRequested || clearStorageRequested || groupEditor || groupDeleteRequested || contextMenu ? () => undefined : onClose}
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
            <button type="button" role="tab" aria-selected={editorTab === "connection"} tabIndex={editorTab === "connection" ? 0 : -1} onClick={() => selectEditorTab("connection")} onKeyDown={(event) => moveEditorTab(event, "connection")}><span>连接信息</span></button>
            <button type="button" role="tab" aria-selected={editorTab === "authentication"} tabIndex={editorTab === "authentication" ? 0 : -1} onClick={() => selectEditorTab("authentication")} onKeyDown={(event) => moveEditorTab(event, "authentication")}><span>认证方式</span></button>
            <button type="button" role="tab" aria-selected={editorTab === "jump"} tabIndex={editorTab === "jump" ? 0 : -1} onClick={() => selectEditorTab("jump")} onKeyDown={(event) => moveEditorTab(event, "jump")}><span>跳板连接 <small className="experimental-tag">实验</small></span></button>
          </div>
          <div className="connection-editor-scroll">
            {editorTab === "connection" && <div className={`form-grid connection-tab-panel${tabMotion === "backward" ? " tab-backward" : tabMotion === "forward" ? " tab-forward" : ""}`} role="tabpanel" aria-label="连接信息">
              <label className="span-2"><RequiredFieldLabel>名称</RequiredFieldLabel><input required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}/></label>
              <label className="span-2">分组<select value={editor.groupId ?? ""} onChange={(event) => setEditor({ ...editor, groupId: event.target.value || null })}><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <label><RequiredFieldLabel>主机</RequiredFieldLabel><input required value={editor.host} onChange={(event) => setEditor({ ...editor, host: event.target.value })}/></label>
              <label><RequiredFieldLabel>端口</RequiredFieldLabel><input required type="number" min="1" max="65535" value={editor.port} onChange={(event) => setEditor({ ...editor, port: Number(event.target.value) })}/></label>
              <label className="span-2"><RequiredFieldLabel>用户名</RequiredFieldLabel><input required value={editor.username} onChange={(event) => setEditor({ ...editor, username: event.target.value })}/></label>
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
            {editorTab === "jump" && <div className={`jump-route-panel connection-tab-panel${tabMotion === "forward" ? " tab-forward" : tabMotion === "backward" ? " tab-backward" : ""}`} role="tabpanel" aria-label="跳板连接">
              <JumpRouteFlow profiles={profiles} jumpRows={jumpRows} targetName={editor.name || "当前服务器"} targetEndpoint={editor.host ? `${editor.username || "user"}@${editor.host}:${editor.port}` : "未填写目标"}/>
              <div className="jump-route-rows">
                {jumpRows.map((profileId, index) => {
                  const profile = profiles.find((item) => item.id === profileId);
                  return <div className="jump-route-row" key={`${index}-${profileId ?? "direct"}`}>
                    <label id={`jump-profile-label-${index}`}>跃点 {index + 1}</label>
                    <div className={`jump-route-row-control${profileId || jumpRows.length > 1 ? " has-remove" : ""}`}>
                      <button type="button" className="jump-profile-trigger" aria-labelledby={`jump-profile-label-${index}`} aria-haspopup="dialog" onClick={() => void openJumpPicker(index)}>
                        <span><strong>{profile?.name ?? "直接连接"}</strong><small>{profile ? `${profile.username}@${profile.host}:${profile.port}` : "不经过其他 SSH 节点"}</small></span><Icon name="connections" size={14}/>
                      </button>
                      {(profileId || jumpRows.length > 1) && <button type="button" className="jump-route-remove" aria-label={`删除跃点 ${index + 1}`} onClick={() => removeJumpRow(index)}><Icon name="trash" size={13}/></button>}
                    </div>
                  </div>;
                })}
              </div>
              <button type="button" className="jump-route-add" disabled={jumpRows.length >= 4 || !jumpRows[jumpRows.length - 1]} onClick={addJumpRow}><Icon name="plus" size={13}/>添加跃点</button>
            </div>}
          </div>
          <footer className="dialog-actions connection-editor-actions dialog-actions-with-status"><DialogActionStatus message={profileStorageUnsupported ? "" : message}/><div className="connection-footer-buttons">{selected && <button className="danger-button" onClick={() => requestDelete(profiles.filter((profile) => selectedIds.has(profile.id)))}>{selectedIds.size > 1 ? `删除 ${selectedIds.size} 项` : "删除"}</button>}<button className={`primary-button connection-save-button ${saveState}`} data-state={saveState} disabled={saveState !== "idle" || profileStorageUnsupported} aria-live="polite" onClick={() => void save()}><span>{saveState === "saving" ? "保存中…" : saveState === "success" ? "保存成功" : "保存配置"}</span></button></div></footer>
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
    ><strong>{pointerDrag.anchorProfile.name}{pointerDrag.profiles.length > 1 && <span className="connection-drag-count">{pointerDrag.profiles.length}</span>}</strong><small>{pointerDrag.profiles.length > 1 ? `移动 ${pointerDrag.profiles.length} 个连接` : `${pointerDrag.anchorProfile.username}@${pointerDrag.anchorProfile.host}:${pointerDrag.anchorProfile.port}`}</small></div>}
    {contextMenu && <div
      ref={contextMenuRef}
      className="connection-context-menu"
      role="menu"
      aria-label={contextGroup ? `${contextGroup.name} 分组菜单` : contextProfiles.length > 1 ? `${contextProfiles.length} 个已选连接菜单` : `${contextProfile?.name ?? "连接"} 连接菜单`}
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {contextGroup ? <>
        <button role="menuitem" onClick={() => { setContextMenu(null); startNewProfile(contextGroup.id); }}>在此分组新建连接</button>
        <button role="menuitem" onClick={() => { setContextMenu(null); openGroupManager(contextGroup); }}>重命名分组</button>
        <div className="connection-context-menu-separator" role="separator"/>
        <button className="danger" role="menuitem" onClick={() => { setContextMenu(null); setGroupDeleteRequested(contextGroup); }}>删除分组</button>
      </> : contextProfile ? <>
        {contextProfiles.length === 1 && <button role="menuitem" onClick={() => { setContextMenu(null); chooseProfile(contextProfile); }}>编辑连接</button>}
        {contextProfiles.length === 1 && <button role="menuitem" onClick={() => void duplicateProfile(contextProfile)}>复制连接</button>}
        {contextProfiles.length === 1 && <div className="connection-context-menu-separator" role="separator"/>}
        <button className="danger" role="menuitem" onClick={() => { setContextMenu(null); requestDelete(contextProfiles); }}>{contextProfiles.length > 1 ? `删除 ${contextProfiles.length} 个连接` : "删除连接"}</button>
      </> : null}
    </div>}
    {jumpPickerOpen !== null && <JumpProfilePicker
      index={jumpPickerOpen}
      currentProfileId={jumpRows[jumpPickerOpen]}
      candidates={jumpCandidates}
      groups={groups}
      loading={jumpCandidatesLoading}
      error={jumpCandidatesError}
      vaultUnlocked={vaultStatus.unlocked}
      onClose={() => setJumpPickerOpen(null)}
      onSelect={(candidate) => chooseJumpCandidate(jumpPickerOpen, candidate)}
    />}
    {groupEditor && <DialogFrame title={groupEditor === "new" ? "新建分组" : "管理分组"} subtitle="连接分组仅支持一层" compact onClose={() => setGroupEditor(null)}>
      <label><RequiredFieldLabel>分组名称</RequiredFieldLabel><input data-dialog-autofocus required value={groupName} maxLength={80} onChange={(event) => setGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveGroup(); }}/></label>
      {groupMessage && <p className="inline-message" role="alert">{groupMessage}</p>}
      <footer className={`dialog-actions group-editor-actions${groupEditor === "new" ? " end" : ""}`}>{groupEditor !== "new" && <button className="danger-button" onClick={() => { setGroupEditor(null); setGroupDeleteRequested(groupEditor); }}>删除分组</button>}<div><button className="secondary-button" onClick={() => setGroupEditor(null)}>取消</button><button className="primary-button" onClick={() => void saveGroup()}>{groupEditor === "new" ? "创建分组" : "保存分组"}</button></div></footer>
    </DialogFrame>}
    {groupDeleteRequested && <DialogFrame title="删除分组？" subtitle={groupDeleteRequested.name} compact onClose={() => setGroupDeleteRequested(null)}>
      <p className="confirm-copy">该分组内的连接不会被删除，而会自动移到“未分组”。</p>
      <footer className="dialog-actions end"><button className="secondary-button" onClick={() => setGroupDeleteRequested(null)}>取消</button><button className="danger-button filled" data-dialog-autofocus onClick={() => void removeGroup()}>确认删除</button></footer>
    </DialogFrame>}
    {deleteRequested && <DialogFrame title={deleteRequested.length > 1 ? `删除 ${deleteRequested.length} 个连接？` : "删除连接？"} subtitle={deleteRequested.length > 1 ? deleteRequested.map((profile) => profile.name).join("、") : deleteRequested[0].name} compact dismissible={!deleteBusy} onClose={() => { if (!deleteBusy) setDeleteRequested(null); }}>
      <p className="confirm-copy">删除后将同时移除{deleteRequested.length > 1 ? "这些连接" : "此连接"}及其关联的网络转发规则；共享凭证保持不变。此操作无法撤销。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={deleteMessage}/><div><button className="secondary-button" disabled={deleteBusy} onClick={() => setDeleteRequested(null)}>取消</button><button className="danger-button filled" data-dialog-autofocus disabled={deleteBusy} onClick={() => void remove()}>{deleteBusy ? "正在删除…" : "确认删除"}</button></div></footer>
    </DialogFrame>}
    {clearStorageRequested && <DialogFrame title="清除旧配置？" subtitle="连接配置版本不受支持" compact dismissible={!clearStorageBusy} onClose={() => { if (!clearStorageBusy) setClearStorageRequested(false); }}>
      <p className="confirm-copy">将永久删除旧版连接配置和全部网络转发规则。凭证库与 Workspace 保持不变。此操作无法撤销。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={clearStorageMessage}/><div><button className="secondary-button" disabled={clearStorageBusy} onClick={() => setClearStorageRequested(false)}>取消</button><button className="danger-button filled" data-dialog-autofocus disabled={clearStorageBusy} onClick={() => void clearUnsupportedStorage()}>{clearStorageBusy ? "正在清除…" : "确认清除"}</button></div></footer>
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

function JumpProfilePicker({ index, currentProfileId, candidates, groups, loading, error, vaultUnlocked, onClose, onSelect }: {
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
            return <button
              type="button"
              className="jump-picker-option"
              role="option"
              aria-selected={selected}
              aria-disabled={!candidate.selectable}
              data-disabled={!candidate.selectable || undefined}
              data-dialog-autofocus={selected || undefined}
              key={candidate.profile.id}
              onClick={() => onSelect(candidate)}
            >
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

function JumpRouteFlow({ profiles, jumpRows, targetName, targetEndpoint }: { profiles: ConnectionProfile[]; jumpRows: Array<string | null>; targetName: string; targetEndpoint: string }) {
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
    jumpProfileIds: profile.jumpProfileIds ?? [],
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

function dropGroupAtPoint(x: number, y: number, draggedProfiles: ConnectionProfile[]): string | null | undefined {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-profile-drop-group]");
  if (!target) return undefined;
  const groupId = target.dataset.profileDropGroup || null;
  return draggedProfiles.every((profile) => (profile.groupId ?? null) === groupId) ? undefined : groupId;
}

function errorMessage(error: unknown): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : "操作失败";
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" && error && "code" in error ? String(error.code) : null;
}

function authPreferenceLabel(preference: ConnectionProfile["authPreference"]): string {
  if (preference === "privateKey") return "私钥";
  if (preference === "sshAgent") return "代理";
  if (preference === "manual") return "手动";
  return "密码";
}
