import { useEffect, useMemo, useState } from "react";

import { getVaultStatus, type VaultStatus } from "../../lib/tauri/credentials";
import { importSshConfig, previewSshConfigImport, type SshConfigCandidate, type SshConfigImportResult, type SshConfigPreview } from "../../lib/tauri/profiles";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { DialogActionStatus, DialogFrame } from "./DialogFrame";
import { MasterPasswordDialog, type MasterPasswordMode } from "./MasterPasswordDialog";

type ImportTab = "connections" | "credentials";

export function SshConfigImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (result: SshConfigImportResult) => void | Promise<void> }) {
  const [preview, setPreview] = useState<SshConfigPreview | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [identityByAlias, setIdentityByAlias] = useState<Record<string, number | null>>({});
  const [passphraseByAlias, setPassphraseByAlias] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ImportTab>("connections");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [masterMode, setMasterMode] = useState<MasterPasswordMode | null>(null);

  async function chooseConfig() {
    if (selecting || busy) return;
    setSelecting(true);
    setMessage("");
    try {
      const nextPreview = await previewSshConfigImport();
      if (nextPreview) {
        setPreview(nextPreview);
        setSelected(defaultCandidateSelection(nextPreview.candidates));
        setIdentityByAlias({});
        setPassphraseByAlias({});
        setActiveTab("connections");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSelecting(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    void getVaultStatus().then((status) => { if (!disposed) setVaultStatus(status); }).catch((error) => { if (!disposed) setMessage(errorMessage(error)); });
    return () => { disposed = true; };
  }, []);

  const selectedCandidates = useMemo(() => preview?.candidates.filter((candidate) => selected.has(candidate.alias)) ?? [], [preview, selected]);
  const credentialCandidates = useMemo(() => selectedCandidates.filter((candidate) => candidate.identities.length > 0), [selectedCandidates]);

  function toggleCandidate(candidate: SshConfigCandidate) {
    if (!candidate.importable || busy) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidate.alias)) next.delete(candidate.alias);
      else next.add(candidate.alias);
      return next;
    });
  }

  function toggleIdentity(candidate: SshConfigCandidate) {
    if (vaultStatus?.legacy) {
      setMessage("旧版凭证库需要先在凭证管理中清除并重新初始化");
      return;
    }
    if (!vaultStatus?.unlocked) {
      setMasterMode(vaultStatus?.initialized ? "unlock" : "initialize");
      return;
    }
    const available = candidate.identities.filter((identity) => identity.status === "available");
    if (available.length === 0) return;
    setIdentityByAlias((current) => ({ ...current, [candidate.alias]: current[candidate.alias] == null ? available[0].index : null }));
  }

  async function masterSucceeded() {
    const status = await getVaultStatus();
    setVaultStatus(status);
    setMasterMode(null);
  }

  async function submit() {
    if (busy || !preview || selectedCandidates.length === 0) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await importSshConfig(preview.previewId, selectedCandidates.map((candidate) => ({
        alias: candidate.alias,
        identityFileIndex: identityByAlias[candidate.alias] ?? null,
        passphrase: identityByAlias[candidate.alias] == null ? null : passphraseByAlias[candidate.alias]?.trim() || null,
      })));
      await onImported(result);
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  if (!preview) {
    return <DialogFrame key="prompt" title="导入 SSH Config" subtitle="从已有配置快速创建连接" className="ssh-config-import-prompt" compact dismissible={!selecting} onClose={onClose}>
      <div className="ssh-config-import-prompt-copy">
        <span className="ssh-config-import-prompt-icon"><Icon name="file" size={22}/></span>
        <div><strong>选择现有 SSH Config</strong><p>你可以选择系统中的 <code>~/.ssh/config</code>，Qterm 将先预览连接信息，不会执行配置中的命令。</p></div>
      </div>
      <footer className="dialog-actions dialog-actions-with-status ssh-config-import-prompt-actions"><DialogActionStatus message={message}/><div><Button disabled={selecting} onClick={onClose}>取消</Button><Button variant="primary" data-dialog-autofocus loading={selecting} onClick={() => void chooseConfig()}>{selecting ? "正在选择…" : "选择配置"}</Button></div></footer>
    </DialogFrame>;
  }

  const managerHeaderActions = <>
    <span className="ssh-config-import-source-label" aria-label={`当前配置文件：${preview.sourceName}`} title={preview.sourceName}>
      <Icon name="file" size={11}/><span>{preview.sourceName}</span>
    </span>
    <Button size="compact" className="ssh-config-import-reselect" disabled={busy || selecting} onClick={() => void chooseConfig()}>
      <Icon name="refresh" size={11}/><span>{selecting ? "正在选择…" : "重新选择"}</span>
    </Button>
  </>;

  return <>
    <DialogFrame key="manager" title="导入 SSH Config" subtitle="连接与凭证分别确认后导入" headerActions={managerHeaderActions} className="ssh-config-import-dialog" wide dismissible={!busy && !selecting} onClose={onClose}>
      <div className="ssh-config-import-layout">
        {preview && <div className="connection-editor-tabs ssh-config-import-tabs" role="tablist" aria-label="导入内容" data-active={activeTab === "credentials" ? "authentication" : "connection"}>
          <span className="connection-editor-tab-indicator" aria-hidden="true"/>
          <button type="button" data-dialog-autofocus role="tab" aria-selected={activeTab === "connections"} tabIndex={activeTab === "connections" ? 0 : -1} onClick={() => setActiveTab("connections")} onKeyDown={(event) => { if (event.key === "ArrowRight") { setActiveTab("credentials"); (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus(); } }}><span>连接信息 · {selectedCandidates.length}/{preview.candidates.length}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === "credentials"} tabIndex={activeTab === "credentials" ? 0 : -1} onClick={() => setActiveTab("credentials")} onKeyDown={(event) => { if (event.key === "ArrowLeft") { setActiveTab("connections"); (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); } }}><span>凭证 · {credentialCandidates.length}</span></button>
        </div>}

        {preview && activeTab === "connections" && <section className="ssh-config-import-panel" role="tabpanel" aria-label="连接信息">
          <div className="ssh-config-import-list">
            {preview.candidates.length === 0 && <div className="ssh-config-import-empty"><Icon name="connections" size={24}/><strong>没有可导入的 Host</strong><p>通配与否定 Host 只作为默认规则，不会生成连接。</p></div>}
            {preview.warnings.map((warning) => <p className="ssh-config-import-global-warning" key={warning}>{warning}</p>)}
            {preview.candidates.map((candidate) => {
              const checked = selected.has(candidate.alias);
              return <article className={`ssh-config-import-item${checked ? " selected" : ""}${candidate.alreadyImported ? " imported" : ""}`} key={candidate.alias}>
                <label className="ssh-config-import-choice"><input type="checkbox" checked={checked} disabled={!candidate.importable || busy} onChange={() => toggleCandidate(candidate)}/><span><strong>{candidate.name}</strong><small>{candidate.username || "缺少用户名"}@{candidate.host}:{candidate.port}</small></span><em>{candidate.alreadyImported ? "已导入" : candidate.name !== candidate.alias ? "名称已区分" : candidate.importable ? "可导入" : "需修正"}</em></label>
                {candidate.warnings.length > 0 && <div className="ssh-config-import-details">{candidate.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
              </article>;
            })}
          </div>
        </section>}

        {preview && activeTab === "credentials" && <section className="ssh-config-import-panel" role="tabpanel" aria-label="凭证">
          <div className="ssh-config-import-credential-note"><Icon name="key" size={13}/><span>私钥默认不导入；只为已选连接逐项授权。相同公钥会复用已有凭证，同名不会被视为重复。</span></div>
          <div className="ssh-config-import-list">
            {credentialCandidates.length === 0 && <div className="ssh-config-import-empty"><Icon name="key" size={24}/><strong>没有待配置的私钥</strong><p>先在“连接信息”中选择包含 IdentityFile 的连接。</p></div>}
            {credentialCandidates.map((candidate) => {
              const availableIdentities = candidate.identities.filter((identity) => identity.status === "available");
              const identityIndex = identityByAlias[candidate.alias] ?? null;
              return <article className={`ssh-config-import-item ssh-config-credential-item${identityIndex !== null ? " selected" : ""}`} key={candidate.alias}>
                <div className="ssh-config-credential-heading"><span><strong>{candidate.name}</strong><small>{candidate.username}@{candidate.host}:{candidate.port}</small></span><em>{identityIndex !== null ? "将关联凭证" : "保持手动认证"}</em></div>
                <div className="ssh-config-key-option">
                  <label><input type="checkbox" checked={identityIndex !== null} disabled={availableIdentities.length === 0 || busy} onChange={() => toggleIdentity(candidate)}/><span>{identityIndex !== null ? "同时导入私钥" : "检测到 IdentityFile"}</span></label>
                  {availableIdentities.length > 1 && <select aria-label={`${candidate.alias} 私钥文件`} value={identityIndex ?? availableIdentities[0].index} disabled={busy || identityIndex === null} onChange={(event) => setIdentityByAlias((current) => ({ ...current, [candidate.alias]: Number(event.target.value) }))}>{availableIdentities.map((identity) => <option value={identity.index} key={identity.index}>{identity.fileName}</option>)}</select>}
                  {availableIdentities.length === 1 && <small>{availableIdentities[0].fileName}</small>}
                  {availableIdentities.length === 0 && <small>私钥路径不可用、过大或包含动态 token</small>}
                  {identityIndex !== null && <input aria-label={`${candidate.alias} 私钥口令`} type="password" autoComplete="off" placeholder="私钥口令（如有）" value={passphraseByAlias[candidate.alias] ?? ""} disabled={busy} onChange={(event) => setPassphraseByAlias((current) => ({ ...current, [candidate.alias]: event.target.value }))}/>} 
                </div>
              </article>;
            })}
          </div>
        </section>}

        <footer className="dialog-actions dialog-actions-with-status ssh-config-import-actions"><DialogActionStatus message={message}/><div><Button disabled={busy || selecting} onClick={onClose}>取消</Button><Button variant="primary" loading={busy} disabled={selecting || selectedCandidates.length === 0 || !preview} onClick={() => void submit()}>{busy ? "正在导入…" : `导入 ${selectedCandidates.length} 项`}</Button></div></footer>
      </div>
    </DialogFrame>
    {masterMode && <MasterPasswordDialog mode={masterMode} onClose={() => setMasterMode(null)} onSuccess={masterSucceeded}/>} 
  </>;
}

function errorMessage(error: unknown): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : "SSH Config 导入失败";
}

function defaultCandidateSelection(candidates: SshConfigCandidate[]): Set<string> {
  return new Set(candidates.filter((candidate) => candidate.importable).map((candidate) => candidate.alias));
}
