import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";

import { cancelPrivateKeyCredential, clearVault, commitPrivateKeyCredential, createPasswordCredential, deleteCredential, getCredentialPublicKey, getVaultStatus, listCredentials, onVaultStatusChanged, prepareDroppedPrivateKeyCredential, prepareGeneratedPrivateKeyCredential, preparePrivateKeyCredential, revealCredentialPassword, type CredentialKind, type CredentialSummary, type GeneratedPrivateKeyAlgorithm, type PrivateKeyDraft, type VaultStatus } from "../../lib/tauri/credentials";
import { Icon } from "../Icon";
import { RequiredFieldLabel } from "../RequiredFieldLabel";
import { ChangeMasterPasswordDialog } from "./ChangeMasterPasswordDialog";
import { DialogFrame } from "./DialogFrame";
import { MasterPasswordDialog, type MasterPasswordMode } from "./MasterPasswordDialog";
import { RecoveryMasterPasswordDialog } from "./RecoveryMasterPasswordDialog";

type View =
  | { type: "empty" }
  | { type: "detail"; item: CredentialSummary }
  | { type: "create"; kind: CredentialKind };

type FeedbackTone = "success" | "error";
type CredentialFeedbackInput = {
  message: string;
  tone: FeedbackTone;
} & (
  | { scope: "item"; itemId: string }
  | { scope: "manager" }
);
type CredentialFeedback = CredentialFeedbackInput & { id: number };

const feedbackDuration = { success: 2_600, error: 4_200 } satisfies Record<FeedbackTone, number>;

export function CredentialDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [masterMode, setMasterMode] = useState<MasterPasswordMode | null>(null);
  const [items, setItems] = useState<CredentialSummary[]>([]);
  const [view, setView] = useState<View>({ type: "empty" });
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [privateKeyDialog, setPrivateKeyDialog] = useState<"generate" | null>(null);
  const [privateKeyDropState, setPrivateKeyDropState] = useState<"idle" | "active" | "invalid">("idle");
  const [privateKeyDraft, setPrivateKeyDraft] = useState<PrivateKeyDraft | null>(null);
  const [generationAlgorithm, setGenerationAlgorithm] = useState<GeneratedPrivateKeyAlgorithm>("ed25519");
  const [generationComment, setGenerationComment] = useState("");
  const [feedback, setFeedback] = useState<CredentialFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState<CredentialSummary | null>(null);
  const [clearRequested, setClearRequested] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [changeRequested, setChangeRequested] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<{ id: string; value: string } | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<{ id: string; value: string } | null>(null);
  const [publicKeyBusyId, setPublicKeyBusyId] = useState<string | null>(null);
  const revealRequestRef = useRef(0);
  const publicKeyRequestRef = useRef(0);
  const feedbackIdRef = useRef(0);
  const feedbackTimerRef = useRef<number | null>(null);
  const itemElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const managerAnchorRef = useRef<HTMLDivElement>(null);
  const privateKeyDropRef = useRef<HTMLButtonElement>(null);
  const prepareKeyRef = useRef<(path?: string) => Promise<void>>(async () => undefined);
  const privateKeyDraftRef = useRef<PrivateKeyDraft | null>(null);

  const clearFeedback = useCallback(() => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    setFeedback(null);
  }, []);

  const showFeedback = useCallback((next: CredentialFeedbackInput) => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    const id = ++feedbackIdRef.current;
    setFeedback({ ...next, id });
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback((current) => current?.id === id ? null : current);
      if (feedbackIdRef.current === id) feedbackTimerRef.current = null;
    }, feedbackDuration[next.tone]);
  }, []);

  const showItemFeedback = useCallback((itemId: string, message: string, tone: FeedbackTone = "success") => {
    showFeedback({ scope: "item", itemId, message, tone });
  }, [showFeedback]);

  const showManagerFeedback = useCallback((message: string, tone: FeedbackTone = "success") => {
    showFeedback({ scope: "manager", message, tone });
  }, [showFeedback]);

  const refresh = useCallback(async (preferredId?: string) => {
    const next = await getVaultStatus();
    setStatus(next);
    if (next.legacy) {
      setMasterMode(null);
      setItems([]);
      setView({ type: "empty" });
      return;
    }
    if (!next.initialized) {
      setMasterMode("initialize");
      setItems([]);
      return;
    }
    if (!next.unlocked) {
      setMasterMode(null);
      setItems([]);
      setView({ type: "empty" });
      return;
    }
    const nextItems = await listCredentials();
    setItems(nextItems);
    if (preferredId) {
      const selected = nextItems.find((item) => item.id === preferredId);
      if (selected) setView({ type: "detail", item: selected });
    } else {
      setView((current) => {
        if (current.type !== "detail") return current;
        const selected = nextItems.find((item) => item.id === current.item.id);
        return selected ? { type: "detail", item: selected } : { type: "empty" };
      });
    }
  }, []);

  async function masterSucceeded() {
    setMasterMode(null);
    try { await refresh(); } catch (error) { showManagerFeedback(errorMessage(error), "error"); }
  }

  function start(kind: CredentialKind) {
    const pendingDraft = privateKeyDraftRef.current;
    if (pendingDraft) void cancelPrivateKeyCredential(pendingDraft.id);
    privateKeyDraftRef.current = null;
    setPrivateKeyDraft(null);
    clearPasswordReveal();
    clearPublicKey();
    setView({ type: "create", kind });
    setName(""); setSecret(""); setPassphrase(""); clearFeedback();
  }

  async function savePassword() {
    if (busy) return;
    setBusy(true); clearFeedback();
    try {
      const created = await createPasswordCredential(name, secret);
      setSecret("");
      await refresh(created.id);
      showItemFeedback(created.id, "密码凭证已加密保存");
    } catch (error) { showManagerFeedback(errorMessage(error), "error"); } finally { setBusy(false); }
  }

  async function prepareKey(path?: string) {
    if (busy) return;
    setBusy(true); setPrivateKeyDropState("idle"); clearFeedback();
    try {
      const draft = path ? await prepareDroppedPrivateKeyCredential(path) : await preparePrivateKeyCredential();
      if (draft) { privateKeyDraftRef.current = draft; setPrivateKeyDraft(draft); }
    } catch (error) { showManagerFeedback(errorMessage(error), "error"); } finally { setBusy(false); }
  }
  useEffect(() => { prepareKeyRef.current = prepareKey; });
  useEffect(() => () => { const draft = privateKeyDraftRef.current; if (draft) void cancelPrivateKeyCredential(draft.id); }, []);

  useEffect(() => {
    if (view.type !== "create" || view.kind !== "privateKey") return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const insideDropzone = (position: { x: number; y: number }) => {
      const rect = privateKeyDropRef.current?.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const x = position.x / ratio;
      const y = position.y / ratio;
      return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    };
    void getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "leave") { setPrivateKeyDropState("idle"); return; }
      const inside = insideDropzone(payload.position);
      if (payload.type === "enter" || payload.type === "over") {
        setPrivateKeyDropState(inside && !busy ? "active" : "idle");
        return;
      }
      setPrivateKeyDropState("idle");
      if (!inside || busy) return;
      if (payload.paths.length !== 1) { setPrivateKeyDropState("invalid"); return; }
      void prepareKeyRef.current(payload.paths[0]);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => setPrivateKeyDropState("idle"));
    return () => { disposed = true; unlisten?.(); setPrivateKeyDropState("idle"); };
  }, [busy, name, passphrase, view]);

  async function prepareGeneratedKey() {
    if (busy) return;
    setBusy(true); clearFeedback();
    try {
      const draft = await prepareGeneratedPrivateKeyCredential(generationAlgorithm, generationComment);
      privateKeyDraftRef.current = draft;
      setPrivateKeyDraft(draft);
      setGenerationComment("");
      setPrivateKeyDialog(null);
    } catch (error) { showManagerFeedback(errorMessage(error), "error"); } finally { setBusy(false); }
  }

  async function savePrivateKey() {
    if (busy || !name.trim() || !privateKeyDraft) return;
    setBusy(true); clearFeedback();
    try {
      const created = await commitPrivateKeyCredential(privateKeyDraft.id, name, privateKeyDraft.source === "file" ? passphrase : undefined);
      privateKeyDraftRef.current = null;
      setPrivateKeyDraft(null);
      setPassphrase("");
      await refresh(created.id);
      showItemFeedback(created.id, "私钥已加密保存");
      void generatePublicKey(created);
    } catch (error) { showManagerFeedback(errorMessage(error), "error"); } finally { setBusy(false); }
  }

  function cancelPrivateKeyDraft() {
    const draft = privateKeyDraftRef.current;
    privateKeyDraftRef.current = null;
    setPrivateKeyDraft(null);
    if (draft) void cancelPrivateKeyCredential(draft.id);
    setView({ type: "empty" });
  }

  async function remove() {
    if (!deleteRequested || busy) return;
    const item = deleteRequested; setBusy(true); clearFeedback();
    try {
      await deleteCredential(item.id);
      clearPasswordReveal();
      clearPublicKey();
      setDeleteRequested(null);
      setView({ type: "empty" });
      await refresh();
      showManagerFeedback(`已删除“${item.name}”，相关连接已解除引用`);
    } catch (error) { showManagerFeedback(errorMessage(error), "error"); } finally { setBusy(false); }
  }

  async function clear() {
    if (busy || clearConfirmation !== "确认清除") return;
    setBusy(true); clearFeedback();
    try {
      await clearVault(clearConfirmation);
      setClearConfirmation(""); setClearRequested(false);
      if (status?.legacy) {
        await refresh();
        showManagerFeedback("旧版凭证库已清除，请保存新的恢复密钥并重新初始化");
      } else onClose();
    }
    catch (error) { showManagerFeedback(errorMessage(error), "error"); } finally { setBusy(false); }
  }

  const clearPasswordReveal = useCallback(() => {
    revealRequestRef.current += 1;
    setRevealedPassword(null);
    setRevealingId(null);
  }, []);

  const clearPublicKey = useCallback(() => {
    publicKeyRequestRef.current += 1;
    setPublicKey(null);
    setPublicKeyBusyId(null);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    queueMicrotask(() => {
      if (!disposed) void refresh().catch((error) => showManagerFeedback(errorMessage(error), "error"));
    });
    void onVaultStatusChanged(() => {
      if (disposed) return;
      clearPasswordReveal();
      clearPublicKey();
      setSecret("");
      setPassphrase("");
      setPrivateKeyDialog(null);
      setGenerationAlgorithm("ed25519");
      setGenerationComment("");
      setItems([]);
      setView({ type: "empty" });
      setChangeRequested(false);
      setDeleteRequested(null);
      setStatus((current) => ({ initialized: current?.initialized ?? true, unlocked: false, legacy: current?.legacy ?? false }));
      setMasterMode(null);
      clearFeedback();
    }).then((value) => { if (disposed) value(); else unlisten = value; }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, [clearFeedback, clearPasswordReveal, clearPublicKey, refresh, showManagerFeedback]);

  async function togglePasswordReveal(item: CredentialSummary) {
    if (revealedPassword?.id === item.id) { clearPasswordReveal(); return; }
    const request = ++revealRequestRef.current;
    setRevealingId(item.id); clearFeedback();
    try {
      const value = await revealCredentialPassword(item.id);
      if (revealRequestRef.current === request) setRevealedPassword({ id: item.id, value });
    } catch (error) {
      if (revealRequestRef.current === request) showItemFeedback(item.id, errorMessage(error), "error");
    } finally {
      if (revealRequestRef.current === request) setRevealingId(null);
    }
  }

  async function generatePublicKey(item: CredentialSummary) {
    const request = ++publicKeyRequestRef.current;
    setPublicKey(null);
    setPublicKeyBusyId(item.id);
    clearFeedback();
    try {
      const value = await getCredentialPublicKey(item.id);
      if (publicKeyRequestRef.current === request) setPublicKey({ id: item.id, value });
    } catch (error) {
      if (publicKeyRequestRef.current === request) showItemFeedback(item.id, errorMessage(error), "error");
    } finally {
      if (publicKeyRequestRef.current === request) setPublicKeyBusyId(null);
    }
  }

  async function copyPublicKey(itemId: string, value: string) {
    try {
      await writeClipboardText(value);
      showItemFeedback(itemId, "公钥已复制");
    } catch {
      showItemFeedback(itemId, "复制公钥失败", "error");
    }
  }

  function selectCredential(item: CredentialSummary) {
    clearPasswordReveal();
    setView({ type: "detail", item });
    clearFeedback();
    if (item.kind === "privateKey") void generatePublicKey(item);
    else clearPublicKey();
  }

  const blocked = Boolean(masterMode || deleteRequested || clearRequested || changeRequested || recoveryRequested || privateKeyDialog);
  const initialized = Boolean(status?.initialized);
  const legacy = Boolean(status?.legacy);
  const unlocked = Boolean(status?.unlocked);
  const headerActions = <>
    {initialized && <span className={`credential-lock-status${unlocked ? " unlocked" : ""}`}><span/>{unlocked ? "已解锁" : "已锁定"}</span>}
    {unlocked && <button className="secondary-button credential-header-button" onClick={() => { clearFeedback(); setChangeRequested(true); }}>修改主密码</button>}
    {initialized && !unlocked && <button className="secondary-button credential-header-button" onClick={() => { clearFeedback(); setRecoveryRequested(true); }}>使用恢复密钥重置</button>}
    {initialized && <button className="danger-button credential-header-button" disabled={busy} onClick={() => { clearFeedback(); setClearConfirmation(""); setClearRequested(true); }}>清除凭证库</button>}
  </>;

  return <>
    <DialogFrame title="凭证管理" subtitle="集中管理可迁移的密码与私钥" wide className="credential-dialog" onClose={blocked ? () => undefined : onClose} headerActions={headerActions}>
      <div className="credential-dialog-grid">
        <aside className="credential-list-pane">
          <div ref={managerAnchorRef} className="credential-sidebar-toolbar">
            <div className="credential-create-actions">
              <button data-dialog-autofocus disabled={!unlocked} onClick={() => start("password")}><Icon name="key" size={13}/>新建密码</button>
              <button disabled={!unlocked} onClick={() => start("privateKey")}><Icon name="file" size={13}/>导入私钥</button>
            </div>
          </div>
          <div className="credential-list" aria-label="凭证列表">
            {items.map((item) => <button ref={(element) => { if (element) itemElementsRef.current.set(item.id, element); else itemElementsRef.current.delete(item.id); }} type="button" className={`credential-item${view.type === "detail" && view.item.id === item.id ? " selected" : ""}`} key={item.id} onClick={() => selectCredential(item)}>
              <span className="credential-kind-icon"><Icon name={item.kind === "password" ? "key" : "file"} size={13}/></span>
              <span className="credential-item-copy"><strong>{item.name}</strong><small>{item.kind === "password" ? "密码" : `私钥${item.detail ? ` · ${item.detail}` : ""}`}</small></span>
            </button>)}
            {items.length === 0 && <div className="credential-list-empty"><Icon name={unlocked ? "key" : "lock"} size={18}/><span>{unlocked ? "暂无凭证" : "凭证库已锁定"}</span></div>}
          </div>
        </aside>

        <section className="credential-editor-pane">
          <div key={view.type === "detail" ? view.item.id : view.type === "create" ? view.kind : "empty"} className={`credential-editor-stage${view.type === "detail" && view.item.kind === "privateKey" ? " credential-detail-stage" : ""}${view.type === "create" && view.kind === "privateKey" ? " credential-private-key-stage" : ""}`}>
            {view.type === "create" && view.kind === "password" && <>
              <div className="credential-editor-heading"><span><Icon name="key" size={16}/></span><div><strong>新建密码凭证</strong><p>密码使用主密码保护，不写入连接配置。</p></div></div>
              <div className="credential-editor-form"><label><RequiredFieldLabel>凭证名称</RequiredFieldLabel><input data-dialog-autofocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：生产环境账户"/></label><label><RequiredFieldLabel>密码</RequiredFieldLabel><input required type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)}/></label></div>
              <footer className="dialog-actions credential-editor-actions"><button className="secondary-button" onClick={() => setView({ type: "empty" })}>取消</button><button className="primary-button" disabled={busy || !name.trim() || !secret} onClick={() => void savePassword()}>{busy ? "保存中…" : "保存凭证"}</button></footer>
            </>}

            {view.type === "create" && view.kind === "privateKey" && <>
              <div className="credential-editor-heading"><span><Icon name="key" size={16}/></span><div><strong>添加私钥凭证</strong><p>选择本地私钥文件，或在安全的 Rust 后端生成新密钥。</p></div></div>
              <div className="credential-private-key-create">
                <div className="credential-private-key-fixed-form"><label><RequiredFieldLabel>凭证名称</RequiredFieldLabel><input data-dialog-autofocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：部署私钥"/></label><label>私钥口令（可选）<input type="password" autoComplete="off" value={passphrase} disabled={privateKeyDraft?.source === "generated"} onChange={(event) => setPassphrase(event.target.value)} placeholder={privateKeyDraft?.source === "generated" ? "生成的私钥无需口令" : "加密私钥需要填写"}/></label></div>
                <div className="credential-private-key-actions">
                  <button ref={privateKeyDropRef} type="button" className={`credential-private-key-dropzone${privateKeyDraft?.source === "file" ? " selected" : ""}`} data-drop-state={privateKeyDropState} aria-pressed={privateKeyDraft?.source === "file"} disabled={busy || privateKeyDraft?.source === "generated"} onClick={() => void prepareKey()}><span><Icon name="file" size={19}/></span><span><strong>{privateKeyDraft?.source === "file" ? privateKeyDraft.label : busy ? "正在读取私钥…" : privateKeyDropState === "active" ? "松开以选择私钥文件" : "拖放私钥文件到这里或点击选择"}</strong><small>{privateKeyDraft?.source === "file" ? "已选择，点击保存后写入凭证库" : privateKeyDropState === "invalid" ? "一次只能拖入一个私钥文件" : "选择后可在保存前确认"}</small></span></button>
                  <button type="button" className={`credential-private-key-generate${privateKeyDraft?.source === "generated" ? " selected" : ""}`} aria-pressed={privateKeyDraft?.source === "generated"} disabled={busy || privateKeyDraft?.source === "file"} onClick={() => { setGenerationAlgorithm("ed25519"); setGenerationComment(""); setPrivateKeyDialog("generate"); }}><span><Icon name="key" size={19}/></span><span><strong>{privateKeyDraft?.source === "generated" ? `已生成 ${privateKeyDraft.label} 私钥` : "生成新私钥"}</strong><small>{privateKeyDraft?.source === "generated" ? "尚未保存，点击可重新生成" : "支持 Ed25519 与 ECDSA P-256"}</small></span></button>
                </div>
              </div>
              <footer className="dialog-actions credential-editor-actions credential-private-key-footer"><span className="credential-private-key-validation" aria-live="polite">{!name.trim() && !privateKeyDraft ? "请填写凭证名称并选择或生成私钥" : !name.trim() ? "请填写凭证名称" : !privateKeyDraft ? "请选择文件或生成私钥" : "可以保存"}</span><button className="secondary-button" disabled={busy} onClick={cancelPrivateKeyDraft}>取消</button><button className="primary-button" disabled={busy || !name.trim() || !privateKeyDraft} onClick={() => void savePrivateKey()}>{busy ? "保存中…" : "保存私钥"}</button></footer>
            </>}

            {view.type === "detail" && <><div className="credential-editor-heading"><span><Icon name={view.item.kind === "password" ? "key" : "file"} size={16}/></span><div><strong>{view.item.name}</strong><p>此凭证可由多个连接安全引用。</p></div></div>
              <div className="credential-detail-grid"><div><span>类型</span><strong>{view.item.kind === "password" ? "密码凭证" : "私钥凭证"}</strong></div>{view.item.detail && <div><span>密钥算法</span><strong>{view.item.detail}</strong></div>}<div><span>存储状态</span><strong>已加密</strong></div></div>
              {view.item.kind === "password" && <div className="password-field credential-password-field"><label>凭证密码</label><div className="password-input-shell"><input aria-label="凭证密码" readOnly type="text" value={revealedPassword?.id === view.item.id ? revealedPassword.value : "••••••••••••"}/><button type="button" className="password-visibility-button" aria-label={revealedPassword?.id === view.item.id ? "隐藏密码" : "显示密码"} aria-pressed={revealedPassword?.id === view.item.id} disabled={revealingId === view.item.id} onClick={() => void togglePasswordReveal(view.item)}><Icon name={revealedPassword?.id === view.item.id ? "eyeOff" : "eye"} size={14}/></button></div></div>}
              <div className="credential-detail-note"><Icon name="connections" size={15}/><p>删除凭证会解除连接引用，但不会删除连接本身。</p></div>
              {view.item.kind === "privateKey" && <section className="credential-public-key"><header><p><strong>OpenSSH 公钥</strong><span>可直接添加到服务器 authorized_keys</span></p><div className="credential-public-key-actions"><button type="button" className="icon-button credential-public-key-action" aria-label="重新生成公钥" title="重新生成公钥" disabled={publicKeyBusyId === view.item.id} onClick={() => void generatePublicKey(view.item)}><Icon name="refresh" size={13}/></button><button type="button" className="icon-button credential-public-key-action" aria-label="复制公钥" title="复制公钥" disabled={publicKeyBusyId === view.item.id || publicKey?.id !== view.item.id} onClick={() => { if (publicKey?.id === view.item.id) void copyPublicKey(view.item.id, publicKey.value); }}><Icon name="copy" size={13}/></button></div></header><textarea aria-label="OpenSSH 公钥" aria-busy={publicKeyBusyId === view.item.id} readOnly wrap="soft" value={publicKey?.id === view.item.id ? publicKey.value : publicKeyBusyId === view.item.id ? "正在生成公钥…" : "暂时无法生成公钥，请点击刷新按钮重试。"}/></section>}
              <footer className="dialog-actions credential-editor-actions"><button className="danger-button" onClick={() => { clearFeedback(); setDeleteRequested(view.item); }}>删除凭证</button></footer>
            </>}

            {view.type === "empty" && (unlocked ? <div className="credential-library-intro"><span><Icon name="key" size={23}/></span><h3>选择或创建凭证</h3><p>凭证正文由主密码加密，连接只保存引用。应用重启后需要重新解锁。</p><div><span>密码与私钥统一管理</span><span>可供多个连接复用</span><span>适合随 ~/.qterm 迁移</span></div></div> : legacy ? <div className="credential-library-intro credential-locked-gate"><span><Icon name="lock" size={23}/></span><h3>检测到旧版凭证库</h3><p>旧版凭证数据不会迁移。清除后可重新初始化，连接、分组和 Workspace 会保留。</p><button className="danger-button" onClick={() => { clearFeedback(); setClearConfirmation(""); setClearRequested(true); }}>清除旧版凭证库</button></div> : <div className="credential-library-intro credential-locked-gate"><span><Icon name="lock" size={23}/></span><h3>{initialized ? "凭证库已锁定" : "尚未初始化凭证库"}</h3><p>{initialized ? "解锁后可查看和管理凭证；忘记主密码时可使用恢复密钥重置。" : "设置主密码并保存恢复密钥后，即可安全保存密码与私钥。"}</p><button className="primary-button" onClick={() => { clearFeedback(); setMasterMode(initialized ? "unlock" : "initialize"); }}>{initialized ? "解锁凭证库" : "初始化凭证库"}</button></div>)}
          </div>
        </section>
      </div>
    </DialogFrame>
    {masterMode && <MasterPasswordDialog mode={masterMode} onSuccess={masterSucceeded} onClose={onClose}/>}
    {changeRequested && <ChangeMasterPasswordDialog
      onClose={() => setChangeRequested(false)}
      onSuccess={async () => {
        setChangeRequested(false);
        await refresh();
        showManagerFeedback("主密码已修改，凭证已完成迁移");
      }}
    />}
    {recoveryRequested && <RecoveryMasterPasswordDialog
      onClose={() => setRecoveryRequested(false)}
      onSuccess={async () => {
        setRecoveryRequested(false);
        await refresh();
        showManagerFeedback("主密码已重置，新的恢复密钥已保存，旧文件已失效");
      }}
    />}
    {privateKeyDialog === "generate" && <DialogFrame title="生成新私钥" subtitle="先生成候选密钥，确认后再保存" compact onClose={() => setPrivateKeyDialog(null)}><div className="credential-private-key-dialog-form"><label>密钥类型<select data-dialog-autofocus value={generationAlgorithm} onChange={(event) => setGenerationAlgorithm(event.target.value as GeneratedPrivateKeyAlgorithm)}><option value="ed25519">Ed25519（推荐）</option><option value="ecdsaP256">ECDSA P-256</option></select></label><label>公钥注释（可选）<input maxLength={80} value={generationComment} onChange={(event) => setGenerationComment(event.target.value)} placeholder="例如：deploy@example"/></label><p className="dialog-note">私钥只在 Rust 后端内存中生成；返回添加页确认名称并保存前，不会写入凭证库。</p></div><footer className="dialog-actions end"><button className="secondary-button" disabled={busy} onClick={() => setPrivateKeyDialog(null)}>取消</button><button className="primary-button" disabled={busy} onClick={() => void prepareGeneratedKey()}>{busy ? "生成中…" : "生成私钥"}</button></footer></DialogFrame>}
    {deleteRequested && <DialogFrame title="删除凭证？" subtitle={deleteRequested.name} compact onClose={() => setDeleteRequested(null)}><p className="confirm-copy">凭证将永久删除。引用它的连接会保留，但下次连接前需要重新选择凭证。</p><footer className="dialog-actions end"><button className="secondary-button" onClick={() => setDeleteRequested(null)}>取消</button><button data-dialog-autofocus className="danger-button filled" disabled={busy} onClick={() => void remove()}>确认删除</button></footer></DialogFrame>}
    {clearRequested && <DialogFrame title="清除整个凭证库？" subtitle="此操作无法撤销" compact onClose={() => setClearRequested(false)}><div className="destructive-confirmation"><p className="confirm-copy">主密钥、全部密码、私钥和连接中的凭证引用都会被清除，连接本身不会删除。</p><label>请输入“确认清除”以继续<input data-dialog-autofocus value={clearConfirmation} autoComplete="off" onChange={(event) => setClearConfirmation(event.target.value)}/></label></div><footer className="dialog-actions end"><button className="secondary-button" onClick={() => setClearRequested(false)}>取消</button><button className="danger-button filled" disabled={busy || clearConfirmation !== "确认清除"} onClick={() => void clear()}>永久清除</button></footer></DialogFrame>}
    {feedback && <CredentialFeedbackBubble feedback={feedback} getTarget={() => feedback.scope === "item" ? itemElementsRef.current.get(feedback.itemId) ?? null : managerAnchorRef.current}/>}
  </>;
}

function CredentialFeedbackBubble({ feedback, getTarget }: { feedback: CredentialFeedback; getTarget: () => HTMLElement | null }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    function updatePosition() {
      const target = getTarget();
      if (!target) { setPosition(null); return; }
      const rect = target.getBoundingClientRect();
      setPosition({
        left: Math.min(rect.right + 8, window.innerWidth - 290),
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
    <p
      className={`credential-feedback-bubble ${feedback.scope} ${feedback.tone}`}
      data-feedback-for={feedback.scope === "item" ? feedback.itemId : undefined}
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      style={position}
    >
      {feedback.message}
    </p>,
    document.body,
  );
}

function errorMessage(error: unknown) { return typeof error === "object" && error && "message" in error ? String(error.message) : "操作失败"; }
