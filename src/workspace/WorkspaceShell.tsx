import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Icon, type IconName } from "../components/Icon";
import { ConnectionDialog } from "../components/dialogs/ConnectionDialog";
import { CredentialDialog } from "../components/dialogs/CredentialDialog";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { HelpDialog } from "../components/dialogs/InfoDialogs";
import { SettingsDialog } from "../components/dialogs/SettingsDialog";
import { ConnectionAuthDialog } from "../components/dialogs/ConnectionAuthDialog";
import { MasterPasswordDialog, type MasterPasswordMode } from "../components/dialogs/MasterPasswordDialog";
import { TerminalLockChoiceDialog, TerminalLockScreen } from "../components/dialogs/TerminalLockDialogs";
import { getVaultStatus, lockVault, onVaultStatusChanged, type VaultStatus } from "../lib/tauri/credentials";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { closeCurrentWindow, minimizeCurrentWindow, startDraggingCurrentWindow, toggleMaximizeCurrentWindow } from "../lib/tauri/window";
import { WorkspaceCanvas, type ConnectionOwner } from "./LayoutView";
import { resolveConfiguredAuth } from "./configuredAuth";
import { openFileWindowAction } from "./fileWindow";
import type { Workspace } from "./model";
import { useWorkspace } from "./WorkspaceProvider";

type Tool = "connections" | "credentials" | "settings" | "help";
interface CloseRequest { title: string; detail: string; ids: string[]; execute: () => void }

export function WorkspaceShell() {
  const { document, activeWorkspace, dispatch, runtimes, fileRuntimes, connectBlock, connectFileBlock, connectedCount, closeSessions, blocksForWorkspace, acceptBlockHostKey, rejectBlockHostKey, acceptFileHostKey, rejectFileHostKey, storageNotice, dismissStorageNotice } = useWorkspace();
  const [tool, setTool] = useState<Tool | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null);
  const [authRequest, setAuthRequest] = useState<{ owner: ConnectionOwner; blockId: string; profile: ConnectionProfile } | null>(null);
  const [vaultUnlockRequest, setVaultUnlockRequest] = useState<{ owner: ConnectionOwner; blockId: string; profile: ConnectionProfile; mode: MasterPasswordMode } | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [vaultLockBusy, setVaultLockBusy] = useState(false);
  const [vaultLockError, setVaultLockError] = useState("");
  const [lockChoiceOpen, setLockChoiceOpen] = useState(false);
  const [terminalLocked, setTerminalLocked] = useState(false);
  const [draggedWorkspace, setDraggedWorkspace] = useState<string | null>(null);
  const workspaceDragRef = useRef<{ id: string; pointerId: number; x: number; y: number; active: boolean } | null>(null);
  const workspaceDragCleanupRef = useRef<(() => void) | null>(null);
  const automaticAttemptsRef = useRef(new Set<string>());
  const terminalHostPrompt = Object.entries(runtimes).find(([, runtime]) => runtime.hostKeyPrompt);
  const fileHostPrompt = Object.entries(fileRuntimes).find(([, runtime]) => runtime.hostKeyPrompt);
  const hostPrompt = terminalHostPrompt
    ? { owner: "terminal" as const, blockId: terminalHostPrompt[0], prompt: terminalHostPrompt[1].hostKeyPrompt! }
    : fileHostPrompt
      ? { owner: "files" as const, blockId: fileHostPrompt[0], prompt: fileHostPrompt[1].hostKeyPrompt! }
      : null;

  function requestClose(request: CloseRequest) {
    if (connectedCount(request.ids) === 0) {
      void closeSessions(request.ids).then(request.execute);
    } else {
      setCloseRequest(request);
    }
  }

  function closeBlock(blockId: string) {
    const fileBlock = activeWorkspace.layout && blockId && findBlockType(activeWorkspace, blockId) === "files";
    requestClose({ title: fileBlock ? "关闭文件窗口？" : "关闭终端？", detail: fileBlock ? "活动文件连接会同时断开。" : "活动终端会话会同时断开，终端缓冲不会保留。", ids: [blockId], execute: () => dispatch({ type: "closeBlock", workspaceId: activeWorkspace.id, blockId }) });
  }

  function closeWorkspace(workspace: Workspace) {
    const ids = blocksForWorkspace(workspace);
    requestClose({ title: `关闭 ${workspace.name}？`, detail: "Workspace 内的布局和所有终端会话会同时关闭。", ids, execute: () => dispatch({ type: "closeWorkspace", workspaceId: workspace.id }) });
  }

  function commitRename() {
    if (!renaming) return;
    dispatch({ type: "renameWorkspace", workspaceId: renaming.id, name: renaming.value });
    setRenaming(null);
  }

  function beginWorkspaceDrag(event: ReactPointerEvent<HTMLDivElement>, workspaceId: string) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("input,.workspace-tab-close")) return;
    workspaceDragCleanupRef.current?.();
    const origin = { id: workspaceId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
    workspaceDragRef.current = origin;
    const move = (pointer: PointerEvent) => {
      const state = workspaceDragRef.current;
      if (!state || pointer.pointerId !== state.pointerId) return;
      if (!state.active && Math.hypot(pointer.clientX - state.x, pointer.clientY - state.y) < 8) return;
      workspaceDragRef.current = { ...state, active: true };
      setDraggedWorkspace(workspaceId);
    };
    const finish = () => {
      workspaceDragRef.current = null; setDraggedWorkspace(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (workspaceDragCleanupRef.current === finish) workspaceDragCleanupRef.current = null;
    };
    const end = (pointer: PointerEvent) => {
      if (pointer.pointerId !== workspaceDragRef.current?.pointerId) return;
      if (workspaceDragRef.current?.active) {
        const target = globalThis.document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-workspace-id]")?.dataset.workspaceId;
        if (target && target !== workspaceId) dispatch({ type: "reorderWorkspace", workspaceId, targetWorkspaceId: target });
      }
      finish();
    };
    const cancel = (pointer: PointerEvent) => {
      if (pointer.pointerId === workspaceDragRef.current?.pointerId) finish();
    };
    workspaceDragCleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }

  function beginWindowDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,[data-workspace-id]")) return;
    void startDraggingCurrentWindow();
  }

  useEffect(() => () => workspaceDragCleanupRef.current?.(), []);

  useEffect(() => {
    let disposed = false;
    let statusEventReceived = false;
    let unlisten: (() => void) | undefined;
    void onVaultStatusChanged((event) => {
      if (disposed) return;
      statusEventReceived = true;
      setVaultStatus((current) => ({ initialized: current?.initialized ?? true, unlocked: event.unlocked, legacy: current?.legacy ?? false }));
      setVaultLockError("");
    }).then((value) => { if (disposed) value(); else unlisten = value; }).catch(() => undefined);
    void getVaultStatus().then((status) => {
      if (!disposed && !statusEventReceived) setVaultStatus(status);
    }).catch(() => undefined);
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isEditable(event.target)) return;
      if (terminalLocked) {
        if (event.key.toLowerCase() === "t" && !event.shiftKey) {
          event.preventDefault(); dispatch({ type: "addWorkspace" });
        } else if (/^[1-9]$/.test(event.key) && !event.shiftKey) {
          const workspace = document.workspaces[Number(event.key) - 1];
          if (workspace) { event.preventDefault(); dispatch({ type: "selectWorkspace", workspaceId: workspace.id }); }
        } else if ((event.key === "[" || event.key === "]") && event.shiftKey) {
          event.preventDefault();
          const index = document.workspaces.findIndex((workspace) => workspace.id === activeWorkspace.id);
          const offset = event.key === "]" ? 1 : -1;
          const workspace = document.workspaces[(index + offset + document.workspaces.length) % document.workspaces.length];
          dispatch({ type: "selectWorkspace", workspaceId: workspace.id });
        }
        return;
      }
      if (event.key.toLowerCase() === "t" && !event.shiftKey) {
        event.preventDefault(); dispatch({ type: "addWorkspace" });
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault(); setTool("connections");
      } else if (event.key.toLowerCase() === "d") {
        event.preventDefault(); dispatch({ type: "splitBlock", workspaceId: activeWorkspace.id, blockId: activeWorkspace.activeBlockId, direction: event.shiftKey ? "vertical" : "horizontal" });
      } else if (/^[1-9]$/.test(event.key) && !event.shiftKey) {
        const workspace = document.workspaces[Number(event.key) - 1];
        if (workspace) { event.preventDefault(); dispatch({ type: "selectWorkspace", workspaceId: workspace.id }); }
      } else if ((event.key === "[" || event.key === "]") && event.shiftKey) {
        event.preventDefault();
        const index = document.workspaces.findIndex((workspace) => workspace.id === activeWorkspace.id);
        const offset = event.key === "]" ? 1 : -1;
        const workspace = document.workspaces[(index + offset + document.workspaces.length) % document.workspaces.length];
        dispatch({ type: "selectWorkspace", workspaceId: workspace.id });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [document.workspaces, activeWorkspace.id, activeWorkspace.activeBlockId, dispatch, terminalLocked]);

  async function confirmClose() {
    if (!closeRequest) return;
    await closeSessions(closeRequest.ids);
    closeRequest.execute();
    setCloseRequest(null);
  }

  async function requestConfiguredConnection(owner: ConnectionOwner, blockId: string, profile: ConnectionProfile) {
    const key = `${owner}:${blockId}`;
    if (automaticAttemptsRef.current.has(key)) return;
    automaticAttemptsRef.current.add(key);
    const showAuthentication = () => {
      automaticAttemptsRef.current.delete(key);
      setAuthRequest({ owner, blockId, profile });
    };
    try {
      if (profile.authPreference !== "sshAgent" && profile.authPreference !== "manual" && profile.credentialId) {
        const status = await getVaultStatus();
        if (!status.unlocked) {
          if (status.legacy) {
            showAuthentication();
            return;
          }
          automaticAttemptsRef.current.delete(key);
          setVaultUnlockRequest({ owner, blockId, profile, mode: status.initialized ? "unlock" : "initialize" });
          return;
        }
      }
      const auth = await resolveConfiguredAuth(profile);
      if (!auth) { showAuthentication(); return; }
      if (owner === "terminal") await connectBlock(blockId, profile, auth, showAuthentication);
      else await connectFileBlock(blockId, profile, auth, showAuthentication);
    } catch {
      showAuthentication();
    } finally {
      automaticAttemptsRef.current.delete(key);
    }
  }

  async function applyLockScope(scope: "vault" | "terminalAndVault") {
    if (!vaultStatus?.initialized || vaultStatus.legacy || vaultLockBusy || (scope === "vault" && !vaultStatus.unlocked)) return;
    setVaultLockBusy(true);
    setVaultLockError("");
    try {
      if (vaultStatus.unlocked) await lockVault();
      setVaultStatus((current) => ({ initialized: current?.initialized ?? true, unlocked: false, legacy: current?.legacy ?? false }));
      setLockChoiceOpen(false);
      if (scope === "terminalAndVault") {
        setTool(null);
        setTerminalLocked(true);
      }
    } catch (error) {
      setVaultLockError(errorMessage(error));
    } finally {
      setVaultLockBusy(false);
    }
  }

  function closeVaultAwareTool() {
    setTool(null);
    void getVaultStatus().then(setVaultStatus).catch(() => undefined);
  }

  const terminalLockLabel = vaultLockBusy
    ? "正在锁定终端"
    : !vaultStatus
      ? "正在读取凭证库状态"
      : vaultStatus.legacy
        ? "请先清除旧版凭证库"
        : !vaultStatus.initialized
          ? "请先初始化凭证库"
        : "锁定终端";

  return <main className="app-shell">
    <header className="app-chrome" onPointerDown={beginWindowDrag}>
      <div className="app-brand" aria-label="Qterm">
        <Icon name="terminal" size={15}/><span>Qterm</span>
      </div>
      <nav className="workspace-tab-strip" aria-label="工作区">
        {document.workspaces.map((workspace) => <div key={workspace.id} data-workspace-id={workspace.id} className={`workspace-tab${workspace.id === activeWorkspace.id ? " selected" : ""}${draggedWorkspace === workspace.id ? " dragging" : ""}`} onPointerDown={(event) => beginWorkspaceDrag(event, workspace.id)}>
          {renaming?.id === workspace.id ? <div className="workspace-tab-rename"><Icon name="workspace" size={13}/><input autoFocus aria-label={`重命名 ${workspace.name}`} value={renaming.value} onChange={(event) => setRenaming({ ...renaming, value: event.target.value })} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") commitRename(); if (event.key === "Escape") setRenaming(null); }}/></div>
            : <button className="workspace-tab-select" onClick={() => dispatch({ type: "selectWorkspace", workspaceId: workspace.id })} onDoubleClick={() => setRenaming({ id: workspace.id, value: workspace.name })}><Icon name="workspace" size={13}/><span>{workspace.name}</span></button>}
          {document.workspaces.length > 1 && <button className="workspace-tab-close" aria-label={`关闭 ${workspace.name}`} onClick={() => closeWorkspace(workspace)}><Icon name="close" size={12}/></button>}
        </div>)}
        <button className="new-workspace-tab" aria-label="新建工作区" title="新建 Workspace (⌘T)" onClick={() => dispatch({ type: "addWorkspace" })}><Icon name="plus" size={14}/></button>
      </nav>
      <div className="window-controls" aria-label="窗口控制">
        <button aria-label="最小化窗口" title="最小化" onClick={() => void minimizeCurrentWindow()}><Icon name="windowMinimize" size={14}/></button>
        <button aria-label="最大化或还原窗口" title="最大化或还原" onClick={() => void toggleMaximizeCurrentWindow()}><Icon name="windowMaximize" size={12}/></button>
        <button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => void closeCurrentWindow()}><Icon name="close" size={14}/></button>
      </div>
    </header>

    <section className="workspace-stage">
      <div className="workspace-stage-content" inert={terminalLocked ? true : undefined} aria-hidden={terminalLocked || undefined}>
        <div className="workspace-canvases">
          {document.workspaces.map((workspace) => {
            const visible = workspace.id === activeWorkspace.id;
            return <div key={workspace.id} className={`workspace-canvas-stage${visible ? " visible" : ""}`} aria-hidden={!visible}><WorkspaceCanvas workspace={workspace} visible={visible} onRequestClose={closeBlock} onRequestAuthConnection={(owner, blockId, profile) => void requestConfiguredConnection(owner, blockId, profile)}/></div>;
          })}
        </div>
        <aside className="utility-rail" aria-label="工具">
          <RailButton tool="connections" icon="connections" label="链接管理" active={tool === "connections"} onClick={setTool}/>
          <RailButton tool="credentials" icon="key" label="凭证管理" active={tool === "credentials"} onClick={setTool}/>
          <RailActionButton icon="files" label="文件管理" onClick={() => dispatch(openFileWindowAction(activeWorkspace))}/>
          <RailActionButton icon="terminal" label="打开终端" onClick={() => dispatch({ type: "splitBlock", workspaceId: activeWorkspace.id, blockId: activeWorkspace.activeBlockId, direction: "horizontal" })}/>
          <span className="rail-spacer"/>
          <RailActionButton icon="lock" label="锁定终端" accessibleLabel={terminalLockLabel} title={terminalLockLabel} disabled={!vaultStatus?.initialized || vaultStatus.legacy || vaultLockBusy} onClick={() => { setVaultLockError(""); setLockChoiceOpen(true); }}/>
          <RailButton tool="settings" icon="settings" label="系统设置" active={tool === "settings"} onClick={setTool}/>
          <RailButton tool="help" icon="help" label="系统帮助" active={tool === "help"} onClick={setTool}/>
        </aside>
      </div>
      {terminalLocked && (
        <TerminalLockScreen onUnlocked={() => {
          setVaultStatus({ initialized: true, unlocked: true, legacy: false });
          setTerminalLocked(false);
        }}/>
      )}
    </section>

    {tool === "connections" && <ConnectionDialog onClose={closeVaultAwareTool}/>}
    {tool === "credentials" && <CredentialDialog onClose={closeVaultAwareTool}/>}
    {authRequest && (
      <ConnectionAuthDialog profile={authRequest.profile} onClose={() => setAuthRequest(null)} onConnect={async (auth) => {
        const request = authRequest;
        if (request.owner === "terminal") await connectBlock(request.blockId, request.profile, auth);
        else await connectFileBlock(request.blockId, request.profile, auth);
      }}/>
    )}
    {vaultUnlockRequest && <MasterPasswordDialog mode={vaultUnlockRequest.mode} onClose={() => setVaultUnlockRequest(null)} onSuccess={() => {
      const request = vaultUnlockRequest;
      setVaultStatus({ initialized: true, unlocked: true, legacy: false });
      setVaultUnlockRequest(null);
      void requestConfiguredConnection(request.owner, request.blockId, request.profile);
    }}/>}
    {tool === "settings" && <SettingsDialog onClose={() => setTool(null)}/>}
    {tool === "help" && <HelpDialog onClose={() => setTool(null)}/>}
    {lockChoiceOpen && <TerminalLockChoiceDialog vaultUnlocked={Boolean(vaultStatus?.unlocked)} busy={vaultLockBusy} message={vaultLockError} onClose={() => { setLockChoiceOpen(false); setVaultLockError(""); }} onLockVault={() => void applyLockScope("vault")} onLockTerminalAndVault={() => void applyLockScope("terminalAndVault")}/>}
    {closeRequest && <DialogFrame title={closeRequest.title} subtitle="未保存的终端输出无法恢复" onClose={() => setCloseRequest(null)}><p className="confirm-copy">{closeRequest.detail}</p><p className="callout">将断开 {connectedCount(closeRequest.ids)} 个活动会话。</p><footer className="dialog-actions end"><button className="secondary-button" onClick={() => setCloseRequest(null)}>取消</button><button className="danger-button filled" onClick={() => void confirmClose()}>关闭并断开</button></footer></DialogFrame>}
    {hostPrompt && <DialogFrame title="确认主机身份" subtitle="首次连接需要核对主机密钥" onClose={() => void (hostPrompt.owner === "terminal" ? rejectBlockHostKey(hostPrompt.blockId) : rejectFileHostKey(hostPrompt.blockId))}><p className="confirm-copy">请通过可信渠道核对以下指纹：</p><code className="fingerprint">{hostPrompt.prompt.algorithm}<br/>{hostPrompt.prompt.fingerprint}</code><footer className="dialog-actions end"><button className="danger-button" onClick={() => void (hostPrompt.owner === "terminal" ? rejectBlockHostKey(hostPrompt.blockId) : rejectFileHostKey(hostPrompt.blockId))}>拒绝</button><button className="primary-button" onClick={() => void (hostPrompt.owner === "terminal" ? acceptBlockHostKey(hostPrompt.blockId) : acceptFileHostKey(hostPrompt.blockId))}>信任并继续</button></footer></DialogFrame>}
    {storageNotice && <div className="global-notice" role="status"><span>{storageNotice}</span><button aria-label="关闭提示" onClick={dismissStorageNotice}><Icon name="close" size={13}/></button></div>}
  </main>;
}

function RailButton({ tool, icon, label, active, onClick }: { tool: Tool; icon: IconName; label: string; active: boolean; onClick: (tool: Tool | null) => void }) {
  return <button className={`rail-button${active ? " active" : ""}`} aria-label={label} aria-pressed={active} onClick={() => onClick(active ? null : tool)}><Icon name={icon}/><span className="rail-button-label">{label}</span></button>;
}

function RailActionButton({ icon, label, accessibleLabel = label, title, disabled = false, onClick }: { icon: IconName; label: string; accessibleLabel?: string; title?: string; disabled?: boolean; onClick: () => void }) {
  return <button className="rail-button" aria-label={accessibleLabel} title={title} disabled={disabled} onClick={onClick}><Icon name={icon}/><span className="rail-button-label">{label}</span></button>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable=true]"));
}

function findBlockType(workspace: Workspace, blockId: string): "terminal" | "files" | null {
  const visit = (node: Workspace["layout"]): "terminal" | "files" | null => node.type === "split"
    ? visit(node.first) ?? visit(node.second)
    : node.blockId === blockId ? node.type : null;
  return visit(workspace.layout);
}
