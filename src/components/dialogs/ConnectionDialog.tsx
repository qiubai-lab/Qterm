import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { getVaultStatus, listCredentials, type CredentialSummary, type VaultStatus } from "../../lib/tauri/credentials";
import { clearUnsupportedProfileStorage, createProfile, createProfileGroup, deleteProfile, deleteProfileGroup, listJumpCandidates, listProfileGroups, updateProfile, updateProfileGroup, type ConnectionProfile, type JumpCandidate, type ProfileGroup, type ProfileInput } from "../../lib/tauri/profiles";
import { findLeaf, terminalBlockIds } from "../../workspace/layout";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { Button, StatusBadge } from "../Button";
import { ExactTextInput } from "../ExactTextInput";
import { Icon } from "../Icon";
import { RequiredFieldLabel } from "../RequiredFieldLabel";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";
import { CredentialDialog } from "./CredentialDialog";
import { MasterPasswordDialog } from "./MasterPasswordDialog";
import { SshConfigImportDialog } from "./SshConfigImportDialog";
import { ConnectionSaveFeedbackBubble, JumpProfilePicker, JumpRouteFlow, type SaveFeedback } from "./connection/ConnectionDialogSupport";
import { authPreferenceLabel, connectionErrorCode, connectionErrorMessage, dropGroupAtPoint, duplicateProfileName, findProfileId, profileToInput } from "./connection/connectionDialogModel"; import { ConnectionSelectionIndicator } from "./connection/ConnectionSelectionIndicator"; import { useConnectionManagerMotion } from "./connection/useConnectionManagerMotion";

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
  const saveFeedbackTimerRef = useRef<number | null>(null);
  const saveFeedbackIdRef = useRef(0);
  const profileElementsRef = useRef(new Map<string, HTMLDivElement>());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
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
    : []; const managerMotion = useConnectionManagerMotion({ selectedId, profiles, groups, collapsedGroupIds, ungroupedCollapsed });

  useEffect(() => {
    void refreshCredentialSummaries();
  }, []);
  useEffect(() => {
    void listProfileGroups().then((items) => {
      setGroups(items);
      setProfileStorageUnsupported(false);
      setCollapsedGroupIds(new Set(items.map((group) => group.id)));
    }).catch((error) => {
      setProfileStorageUnsupported(connectionErrorCode(error) === "profileStorageVersionUnsupported");
      setMessage(connectionErrorMessage(error));
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
    if (saveFeedbackTimerRef.current !== null) window.clearTimeout(saveFeedbackTimerRef.current);
  }, []);

  function showSaveFeedback(profileId: string) {
    clearSaveFeedback();
    const id = ++saveFeedbackIdRef.current;
    setSaveFeedback({ id, profileId });
    saveFeedbackTimerRef.current = window.setTimeout(() => {
      setSaveFeedback((current) => current?.id === id ? null : current);
      if (saveFeedbackIdRef.current === id) saveFeedbackTimerRef.current = null;
    }, 2_600);
  }

  function clearSaveFeedback() {
    if (saveFeedbackTimerRef.current !== null) window.clearTimeout(saveFeedbackTimerRef.current);
    saveFeedbackTimerRef.current = null;
    setSaveFeedback(null);
  }

  function editProfile(profile: ConnectionProfile) {
    const changedProfile = profile.id !== selectedId; managerMotion.showProfile(profile.id, () => {
      setSelectedId(profile.id);
      setEditor({ name: profile.name, host: profile.host, port: profile.port, username: profile.username, authPreference: profile.authPreference, credentialId: profile.credentialId, groupId: profile.groupId, jumpProfileIds: profile.jumpProfileIds ?? [] });
      setJumpRows(profile.jumpProfileIds?.length ? [...profile.jumpProfileIds] : [null]); setJumpPickerOpen(null);
      if (changedProfile) setTabMotion("idle");
    });
  }

  function chooseProfile(profile: ConnectionProfile) {
    clearSaveFeedback();
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
      setJumpCandidatesError(connectionErrorMessage(error));
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
    clearSaveFeedback(); managerMotion.showNewProfile(() => { setSelectedId(null); setSelectedIds(new Set()); setEditor({ ...empty, groupId }); setJumpRows([null]); setTabMotion("idle"); setMessage(""); setSaveState("idle"); });
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
      setClearStorageMessage(connectionErrorMessage(error));
    } finally {
      setClearStorageBusy(false);
    }
  }

  async function save() {
    if (saveState === "saving") return;
    if (saveResetTimerRef.current !== null) window.clearTimeout(saveResetTimerRef.current);
    clearSaveFeedback(); setSaveState("saving"); setMessage("");
    try {
      const input = { ...editor, name: editor.name.trim() || editor.host.trim(), jumpProfileIds: jumpRows.filter((id): id is string => Boolean(id)) };
      setEditor(input);
      const profile = selectedId ? await updateProfile(selectedId, input) : await createProfile(input);
      if (profile.groupId) {
        setCollapsedGroupIds((current) => {
          const next = new Set(current); next.delete(profile.groupId!); return next;
        });
      } else setUngroupedCollapsed(false);
      await refreshProfiles(); managerMotion.settleProfile(profile.id); setSelectedId(profile.id); setSelectedIds(new Set([profile.id]));
      setSaveState("success");
      showSaveFeedback(profile.id);
      saveResetTimerRef.current = window.setTimeout(() => { setSaveState("idle"); saveResetTimerRef.current = null; }, 1400);
    } catch (error) { setSaveState("idle"); setMessage(connectionErrorMessage(error)); }
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
    } catch (error) { setDeleteMessage(connectionErrorMessage(error)); }
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
    } catch (error) { setGroupMessage(connectionErrorMessage(error)); }
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
    } catch (error) { setMessage(connectionErrorMessage(error)); }
  }

  function toggleGroup(groupId: string) {
    clearSaveFeedback();
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
    } catch (error) { setMessage(connectionErrorMessage(error)); }
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
    } catch (error) { setMessage(connectionErrorMessage(error)); }
  }

  function profileItem(profile: ConnectionProfile) {
    const isSelected = selectedIds.has(profile.id);
    const isDragging = pointerDrag?.active && pointerDrag.profiles.some((item) => item.id === profile.id);
    return <div
      ref={(element) => { if (element) profileElementsRef.current.set(profile.id, element); else profileElementsRef.current.delete(profile.id); }}
      key={profile.id}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected} data-profile-id={profile.id} data-primary-selected={profile.id === selectedId || undefined}
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
    ><span className="connection-item-icon" aria-hidden="true"><Icon name="computer" size={13}/></span><span className="connection-item-copy"><strong className="connection-item-name">{profile.name}</strong><small className="connection-item-endpoint"><span className="connection-item-address" title={`${profile.username}@${profile.host}:${profile.port}`}>{profile.username}@{profile.host}:{profile.port}</span><span className="connection-item-auth">{authPreferenceLabel(profile.authPreference)}</span></small></span></div>;
  }

  return <>
    <DialogFrame
      title="连接管理"
      subtitle="管理 SSH 连接配置"
      headerActions={<>{profileStorageUnsupported && <span className="connection-storage-warning"><span className="connection-storage-warning-message" role="alert" title="连接配置文件版本不受支持">连接配置文件版本不受支持</span><Button variant="danger" size="compact" className="connection-storage-clear" onClick={() => { setClearStorageMessage(""); setClearStorageRequested(true); }}><Icon name="trash" size={13}/>清除旧配置</Button></span>}<StatusBadge tone={vaultStatus.unlocked ? "success" : vaultStatus.legacy ? "warning" : "neutral"}>{vaultStatus.unlocked ? "凭证库已解锁" : vaultStatus.initialized ? "凭证库已锁定" : vaultStatus.legacy ? "旧版凭证库" : "凭证库未初始化"}</StatusBadge><Button variant="secondary" size="compact" className="connection-import-button" onClick={() => setSshConfigImportOpen(true)}><Icon name="upload" size={13}/>导入</Button></>}
      onClose={credentialManagerOpen || credentialUnlockOpen || sshConfigImportOpen || jumpPickerOpen !== null || deleteRequested || clearStorageRequested || groupEditor || groupDeleteRequested || contextMenu ? () => undefined : onClose}
      wide
    >
      <div className="connection-dialog-grid">
        <aside className="connection-sidebar">
          <div className="connection-sidebar-toolbar">
            <div className="connection-list-actions"><Button size="compact" data-dialog-autofocus onClick={() => startNewProfile()}><Icon name="plus" size={11}/>新建连接</Button><Button size="compact" onClick={openNewGroup}><Icon name="plus" size={11}/>新建分组</Button></div>
          </div>
          <div className="connection-list" ref={managerMotion.listRef}><ConnectionSelectionIndicator state={managerMotion.indicator}/>
            <section className="connection-group-section" data-profile-drop-group="">
              <header
                className={`connection-group-heading${dropTarget === "ungrouped" ? " drop-target" : ""}`}
              ><button className="connection-group-toggle" aria-expanded={!ungroupedCollapsed} title="单击折叠未分组连接" onClick={() => { clearSaveFeedback(); setUngroupedCollapsed((current) => !current); }}><span className="connection-group-chevron" aria-hidden="true">›</span><strong>未分组</strong><small>{ungroupedProfiles.length}</small></button></header>
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
        <div className="connection-editor"><div className="connection-editor-tabs" role="tablist" aria-label="连接配置" data-active={editorTab}>
            <span className="connection-editor-tab-indicator" aria-hidden="true"/>
            <button type="button" role="tab" aria-selected={editorTab === "connection"} tabIndex={editorTab === "connection" ? 0 : -1} onClick={() => selectEditorTab("connection")} onKeyDown={(event) => moveEditorTab(event, "connection")}><span>连接信息</span></button>
            <button type="button" role="tab" aria-selected={editorTab === "authentication"} tabIndex={editorTab === "authentication" ? 0 : -1} onClick={() => selectEditorTab("authentication")} onKeyDown={(event) => moveEditorTab(event, "authentication")}><span>认证方式</span></button>
            <button type="button" role="tab" aria-selected={editorTab === "jump"} tabIndex={editorTab === "jump" ? 0 : -1} onClick={() => selectEditorTab("jump")} onKeyDown={(event) => moveEditorTab(event, "jump")}><span>跳板连接 <StatusBadge tone="warning" presentation="tag" size="compact">实验</StatusBadge></span></button>
          </div>
          <div ref={managerMotion.stageRef} key={managerMotion.editorTransition.key} className={`connection-editor-profile-stage ${managerMotion.editorTransition.kind}`}>
          <div className="connection-editor-scroll">
            {editorTab === "connection" && <div className={`form-grid connection-tab-panel${tabMotion === "backward" ? " tab-backward" : tabMotion === "forward" ? " tab-forward" : ""}`} role="tabpanel" aria-label="连接信息">
              <label className="span-2"><RequiredFieldLabel>名称</RequiredFieldLabel><input required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}/></label>
              <label className="span-2">分组<select value={editor.groupId ?? ""} onChange={(event) => setEditor({ ...editor, groupId: event.target.value || null })}><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              <label><RequiredFieldLabel>主机</RequiredFieldLabel><ExactTextInput required value={editor.host} onChange={(event) => setEditor({ ...editor, host: event.target.value })}/></label>
              <label><RequiredFieldLabel>端口</RequiredFieldLabel><input required type="number" min="1" max="65535" value={editor.port} onChange={(event) => setEditor({ ...editor, port: Number(event.target.value) })}/></label>
              <label className="span-2"><RequiredFieldLabel>用户名</RequiredFieldLabel><ExactTextInput required autoComplete="username" value={editor.username} onChange={(event) => setEditor({ ...editor, username: event.target.value })}/></label>
            </div>}
            {editorTab === "authentication" && <div className={`form-grid connection-tab-panel connection-auth-panel${tabMotion === "forward" ? " tab-forward" : tabMotion === "backward" ? " tab-backward" : ""}`} role="tabpanel" aria-label="认证方式">
              <label className="span-2">认证方式<select value={editor.authPreference} onChange={(event) => {
                const authPreference = event.target.value as ProfileInput["authPreference"];
                setEditor({ ...editor, authPreference, credentialId: authPreference === "manual" || authPreference === "sshAgent" ? null : editor.credentialId });
              }}><option value="password">密码凭证</option><option value="privateKey">私钥凭证</option><option value="sshAgent">SSH Agent（推荐）</option><option value="manual">手动选择</option></select></label>
              {(editor.authPreference === "password" || editor.authPreference === "privateKey") && <><p className="callout span-2">连接只保存凭证引用；实际{editor.authPreference === "password" ? "密码" : "私钥"}由加密凭证库提供。应用每次启动后需要先解锁凭证库。</p><div className="credential-reference-field span-2"><label>引用凭证{vaultStatus.unlocked ? <select value={editor.credentialId ?? ""} onChange={(event) => setEditor({ ...editor, credentialId: event.target.value || null })}><option value="">未选择凭证</option>{credentials.filter((item) => item.kind === editor.authPreference).map((item) => <option value={item.id} key={item.id}>{item.name}{item.detail ? ` · ${item.detail}` : ""}</option>)}</select> : <button type="button" className="credential-reference-locked" aria-label={`解锁后选择凭证，当前：${linkedCredential?.name ?? (editor.credentialId ? "已关联凭证" : "未选择凭证")}`} disabled={!vaultStatus.initialized || vaultStatus.legacy} onClick={() => setCredentialUnlockOpen(true)}><span>{linkedCredential?.name ?? (editor.credentialId ? "已关联凭证" : "未选择凭证")}{linkedCredential?.detail ? ` · ${linkedCredential.detail}` : ""}</span><Icon name="lock" size={12}/></button>}</label><Button className="credential-manage-button" onClick={() => setCredentialManagerOpen(true)}><Icon name="key" size={13}/>管理凭证</Button></div>{!vaultStatus.unlocked && <p className="dialog-note span-2">当前关联凭证仍可查看；更改选择前需要解锁凭证库。</p>}</>}
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
          </div></div>
          <footer className="dialog-actions connection-editor-actions dialog-actions-with-status"><DialogActionStatus message={profileStorageUnsupported ? "" : message}/><div className="connection-footer-buttons">{selected && <Button variant="danger" onClick={() => requestDelete(profiles.filter((profile) => selectedIds.has(profile.id)))}>{selectedIds.size > 1 ? `删除 ${selectedIds.size} 项` : "删除"}</Button>}<Button variant="primary" className={`connection-save-button ${saveState}`} data-state={saveState} disabled={saveState !== "idle" || profileStorageUnsupported} aria-busy={saveState === "saving" || undefined} aria-live="polite" onClick={() => void save()}><span key={saveState} className="connection-save-content">{saveState === "saving" && <span className="connection-save-spinner" aria-hidden="true"/>}{saveState === "success" && <Icon name="checkCircle" size={12}/>}<span>{saveState === "saving" ? "保存中…" : saveState === "success" ? "保存成功" : "保存配置"}</span></span></Button></div></footer>
        </div>
      </div>
    </DialogFrame>
    {saveFeedback && <ConnectionSaveFeedbackBubble
      feedback={saveFeedback}
      getTarget={() => profileElementsRef.current.get(saveFeedback.profileId) ?? null}
    />}
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
      <footer className={`dialog-actions group-editor-actions${groupEditor === "new" ? " end" : ""}`}>{groupEditor !== "new" && <Button variant="danger" onClick={() => { setGroupEditor(null); setGroupDeleteRequested(groupEditor); }}>删除分组</Button>}<div><Button onClick={() => setGroupEditor(null)}>取消</Button><Button variant="primary" onClick={() => void saveGroup()}>{groupEditor === "new" ? "创建分组" : "保存分组"}</Button></div></footer>
    </DialogFrame>}
    {groupDeleteRequested && <DialogFrame title="删除分组？" subtitle={groupDeleteRequested.name} compact onClose={() => setGroupDeleteRequested(null)}>
      <p className="confirm-copy">该分组内的连接不会被删除，而会自动移到“未分组”。</p>
      <footer className="dialog-actions end"><Button onClick={() => setGroupDeleteRequested(null)}>取消</Button><Button variant="dangerSolid" data-dialog-autofocus onClick={() => void removeGroup()}>确认删除</Button></footer>
    </DialogFrame>}
    {deleteRequested && <DialogFrame title={deleteRequested.length > 1 ? `删除 ${deleteRequested.length} 个连接？` : "删除连接？"} subtitle={deleteRequested.length > 1 ? deleteRequested.map((profile) => profile.name).join("、") : deleteRequested[0].name} compact dismissible={!deleteBusy} onClose={() => { if (!deleteBusy) setDeleteRequested(null); }}>
      <p className="confirm-copy">删除后将同时移除{deleteRequested.length > 1 ? "这些连接" : "此连接"}及其关联的网络转发规则；共享凭证保持不变。此操作无法撤销。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={deleteMessage}/><div><Button disabled={deleteBusy} onClick={() => setDeleteRequested(null)}>取消</Button><Button variant="dangerSolid" data-dialog-autofocus loading={deleteBusy} onClick={() => void remove()}>{deleteBusy ? "正在删除…" : "确认删除"}</Button></div></footer>
    </DialogFrame>}
    {clearStorageRequested && <DialogFrame title="清除旧配置？" subtitle="连接配置版本不受支持" compact dismissible={!clearStorageBusy} onClose={() => { if (!clearStorageBusy) setClearStorageRequested(false); }}>
      <p className="confirm-copy">将永久删除旧版连接配置和全部网络转发规则。凭证库与 Workspace 保持不变。此操作无法撤销。</p>
      <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={clearStorageMessage}/><div><Button disabled={clearStorageBusy} onClick={() => setClearStorageRequested(false)}>取消</Button><Button variant="dangerSolid" data-dialog-autofocus loading={clearStorageBusy} onClick={() => void clearUnsupportedStorage()}>{clearStorageBusy ? "正在清除…" : "确认清除"}</Button></div></footer>
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
