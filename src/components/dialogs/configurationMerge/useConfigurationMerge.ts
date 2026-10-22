import { useEffect, useRef, useState } from "react";
import { cancelConfigurationMerge, commitConfigurationMerge, CONFIGURATION_MERGED, previewConfigurationMerge, selectMergeSource, unlockMergeSourceCredentials, type MergeOptions, type MergePreview, type MergeScan } from "../../../lib/tauri/configurationMerge";
import { getVaultStatus } from "../../../lib/tauri/credentials";
import type { MasterPasswordMode } from "../MasterPasswordDialog";

const initialOptions: MergeOptions = { connections: false, network: false, credentials: false };
export function useConfigurationMerge() {
  const [step, setStep] = useState<"source" | "confirm" | "done">("source");
  const [scan, setScan] = useState<MergeScan | null>(null);
  const [options, setOptions] = useState(initialOptions);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [vaultMode, setVaultMode] = useState<MasterPasswordMode | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void cancelConfigurationMerge().catch(() => undefined); };
  }, []);

  async function perform(action: () => Promise<void>, credential = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setCredentialError("");
    try { await action(); }
    catch (reason) {
      if (mounted.current) (credential ? setCredentialError : setError)(typeof reason === "object" && reason && "message" in reason ? String(reason.message) : "合并配置失败，请重试");
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function refresh(next: MergeOptions, password = "") {
    setPreview(null);
    if (!Object.values(next).some(Boolean)) return;
    const result = await previewConfigurationMerge(next, password);
    if (mounted.current) setPreview(result);
  }
  function choose() {
    void perform(async () => {
      const result = await selectMergeSource();
      if (!mounted.current || !result) return;
      setScan(result); setPreview(null);
      const connections = !result.connections.error && result.connections.count > 0;
      setOptions({ connections, network: connections && !result.network.error && result.network.count > 0, credentials: false });
    });
  }
  function next() {
    setStep("confirm");
    void perform(() => refresh(options));
  }
  function requestCredentials() {
    void perform(async () => {
      const status = await getVaultStatus();
      if (!mounted.current) return;
      if (status.legacy) { setError("当前凭证库版本不支持合并"); return; }
      if (!status.unlocked) setVaultMode(status.initialized ? "unlock" : "initialize");
      else setUnlockOpen(true);
    });
  }
  function change(key: keyof MergeOptions, checked: boolean) {
    if (key === "credentials" && checked) { requestCredentials(); return; }
    const next = { ...options, [key]: checked, ...(key === "connections" && !checked ? { network: false } : {}) };
    setOptions(next);
    void perform(() => refresh(next));
  }
  function verify(password: string, onVerified: () => void) {
    void perform(async () => {
      const next = { ...options, credentials: true };
      setPreview(null);
      await unlockMergeSourceCredentials(password);
      if (!mounted.current) return;
      setOptions(next); onVerified();
      try { await refresh(next); }
      catch (reason) {
        if (mounted.current) setError(typeof reason === "object" && reason && "message" in reason ? String(reason.message) : "合并配置检查失败，请重试");
      }
    }, true);
  }
  function commit() {
    if (!preview?.changed) return;
    void perform(async () => {
      try { await commitConfigurationMerge(preview.token); }
      catch (reason) { setPreview(null); throw reason; }
      window.dispatchEvent(new Event(CONFIGURATION_MERGED));
      if (mounted.current) setStep("done");
    });
  }
  function back() { setStep("source"); setPreview(null); setOptions((old) => ({ ...old, credentials: false })); setError(""); }
  const needsCredentialVerification = options.credentials && /重新验证来源配置主密码|当前凭证库已锁定|请先初始化或解锁当前凭证库/.test(error);
  function retry() { if (needsCredentialVerification) requestCredentials(); else void perform(() => refresh(options)); }
  function closeUnlock() {
    setUnlockOpen(false); setCredentialError("");
    const next = { ...options, credentials: false };
    setOptions(next);
    void perform(() => refresh(next));
  }
  return { needsCredentialVerification, step, scan, options, preview, busy, error, credentialError, unlockOpen, vaultMode, setVaultMode, choose, change, next, commit, back, retry, verify,
    closeUnlock, completeUnlock: () => setUnlockOpen(false),
    currentVaultReady: () => { setVaultMode(null); setUnlockOpen(true); },
  };
}
