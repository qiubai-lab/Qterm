import { useEffect, useRef, useState } from "react";

import { cancelTransfer, downloadFile, selectDownloadPath, selectUploadFile, uploadFile, type TransferEvent } from "../../lib/tauri/transfers";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { findLeaf } from "../../workspace/layout";
import { Button } from "../Button";
import { ExactTextInput } from "../ExactTextInput";
import { DialogFrame } from "./DialogFrame";

export function TransferDialog({ onClose }: { onClose: () => void }) {
  const { activeBlockId, activeWorkspace, runtimes, fileRuntimes } = useWorkspace();
  const [mode, setMode] = useState<"upload" | "download">("upload");
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [transferId, setTransferId] = useState<string | null>(null);
  const [event, setEvent] = useState<TransferEvent | null>(null);
  const transferRef = useRef<string | null>(null);
  const finishedBeforeId = useRef(false);
  const activeLeaf = findLeaf(activeWorkspace.layout, activeBlockId);
  const terminalRuntime = activeLeaf?.type === "terminal" ? runtimes[activeLeaf.blockId] : null;
  const fileRuntime = activeLeaf?.type === "files" ? fileRuntimes[activeLeaf.blockId] : null;
  const sessionId = terminalRuntime?.kind === "ssh" ? terminalRuntime.sessionId : fileRuntime?.kind === "sftp" ? fileRuntime.sessionId : null;
  const progress = event?.type === "progress" ? Math.round(event.transferredBytes / Math.max(event.totalBytes, 1) * 100) : event?.type === "completed" ? 100 : 0;

  async function selectPath() {
    const path = mode === "upload" ? await selectUploadFile() : await selectDownloadPath();
    if (path) setLocalPath(path);
  }

  function onEvent(next: TransferEvent) {
    setEvent(next);
    if (["completed", "cancelled", "failed"].includes(next.type)) {
      finishedBeforeId.current = true;
      transferRef.current = null;
      setTransferId(null);
    }
  }

  async function start() {
    if (!sessionId) return;
    finishedBeforeId.current = false;
    const id = mode === "upload"
      ? await uploadFile(sessionId, localPath, remotePath, onEvent)
      : await downloadFile(sessionId, remotePath, localPath, onEvent);
    if (!finishedBeforeId.current) {
      transferRef.current = id;
      setTransferId(id);
    }
  }

  useEffect(() => () => {
    const id = transferRef.current;
    if (sessionId && id) void cancelTransfer(sessionId, id);
  }, [sessionId]);

  return <DialogFrame title="文件传输" subtitle="当前 Terminal Block · 单文件 SFTP" onClose={onClose}>
    <div className="segmented"><button className={mode === "upload" ? "selected" : ""} onClick={() => { setMode("upload"); setLocalPath(""); }}>上传</button><button className={mode === "download" ? "selected" : ""} onClick={() => { setMode("download"); setLocalPath(""); }}>下载</button></div>
    {!sessionId && <p className="callout">当前终端尚未连接 SSH。</p>}
    <label>远程路径<ExactTextInput value={remotePath} onChange={(input) => setRemotePath(input.target.value)} placeholder="/home/user/file.txt"/></label>
    <button className="path-button" disabled={!sessionId} onClick={() => void selectPath()}>选择{mode === "upload" ? "本地文件" : "保存位置"}<small>{localPath || "使用系统文件选择器"}</small></button>
    {event && <div className="transfer-progress"><div><span>{event.type}</span><span>{progress}%</span></div><progress max="100" value={progress}/></div>}
    <footer className="dialog-actions end">{transferId && sessionId ? <Button variant="danger" onClick={() => void cancelTransfer(sessionId, transferId)}>取消传输</Button> : <Button variant="primary" disabled={!sessionId || !localPath || !remotePath} onClick={() => void start()}>开始{mode === "upload" ? "上传" : "下载"}</Button>}</footer>
  </DialogFrame>;
}
