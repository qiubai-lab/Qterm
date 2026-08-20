import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";

import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { copyFile, createEntry, deleteEntry, listLocalDirectory, listRemoteDirectory, readBinaryFile, readTextFile, renameEntry, writeTextFile, type DirectoryListing, type FileEntry } from "../lib/tauri/files";
import { cancelTransfer, downloadDirectory, downloadFile, selectDownloadDirectory, selectDownloadPath, uploadDroppedEntries, type TransferEvent } from "../lib/tauri/transfers";
import type { FileRuntime } from "../workspace/WorkspaceProvider";
import type { EditorLanguage } from "./CodeEditor";
import { parentPath } from "./path";

type PreviewKind = EditorLanguage | "image";
type FileViewMode = "preview" | "edit";
type PreviewState = { entry: FileEntry; kind: PreviewKind; mode: FileViewMode; loading: boolean; error: string; content: string; original: string; revision: string; imageUrl: string };
type TransferState = { transferId: string; status: "starting" | "running" | "completed" | "cancelled" | "failed"; transferred: number; total: number; message: string; direction: "download" | "upload" };
type NameOperation = { kind: "copy" | "rename" | "createFile" | "createDirectory"; entry: FileEntry | null; value: string; error: string; busy: boolean };
type DeleteOperation = { entry: FileEntry; error: string; busy: boolean };
type SortKey = "name" | "size" | "modifiedAt";
type SortDirection = "ascending" | "descending";
type SortState = { key: SortKey; direction: SortDirection } | null;
type ContextMenuState = { entry: FileEntry; anchorX: number; anchorY: number; x: number; y: number; placement: "above" | "below" };

const CodeEditor = lazy(() => import("./CodeEditor").then((module) => ({ default: module.CodeEditor })));
const MarkdownPreview = lazy(() => import("./MarkdownPreview").then((module) => ({ default: module.MarkdownPreview })));

export function FileBrowserPane({ initialPath, runtime, onPathChange }: { initialPath: string; runtime: FileRuntime; onPathChange: (path: string) => void }) {
  const [path, setPath] = useState(initialPath);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState(initialPath);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [saving, setSaving] = useState(false);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [operationMessage, setOperationMessage] = useState("");
  const [nameOperation, setNameOperation] = useState<NameOperation | null>(null);
  const [deleteOperation, setDeleteOperation] = useState<DeleteOperation | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const request = useRef(0);
  const previewRequest = useRef(0);
  const listScroll = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const kind = runtime?.kind;
  const sessionId = runtime?.sessionId;
  const status = runtime?.status;
  const connectionError = kind === "sftp" && status === "failed" ? runtime.notice.trim() || "文件连接失败" : "";
  const displayedEntries = useMemo(() => sortEntries(listing?.entries ?? [], sort), [listing, sort]);

  const load = useCallback(async (nextPath: string) => {
    const currentRequest = ++request.current;
    if (kind === "sftp" && (!sessionId || status !== "connected")) {
      setEditingPath(false);
      setLoading(false);
      setError("");
      return;
    }
    setEditingPath(false);
    setLoading(true);
    setError("");
    try {
      const next = kind === "local" ? await listLocalDirectory(nextPath) : await listRemoteDirectory(sessionId!, nextPath);
      if (request.current !== currentRequest) return;
      setPath(next.path); setPathDraft(next.path); setListing(next); setSelectedPath(null); setEditingPath(false); onPathChange(next.path);
    } catch (reason) {
      if (request.current === currentRequest) setError(errorMessage(reason));
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [kind, onPathChange, sessionId, status]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load(initialPath));
    return () => { cancelAnimationFrame(frame); request.current += 1; };
  }, [initialPath, load]);

  useEffect(() => {
    if (!contextMenu) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const close = (event: globalThis.PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest(".file-context-menu")) setContextMenu(null); };
    const keydown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", keydown); };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const fitted = fitContextMenu(contextMenu.anchorX, contextMenu.anchorY, rect.width, rect.height, window.innerWidth, window.innerHeight);
    if (contextMenu.x === fitted.x && contextMenu.y === fitted.y && contextMenu.placement === fitted.placement) return;
    setContextMenu((current) => current ? { ...current, ...fitted } : current);
  }, [contextMenu]);

  useEffect(() => () => { if (preview?.imageUrl) URL.revokeObjectURL(preview.imageUrl); }, [preview?.imageUrl]);

  useEffect(() => {
    if (kind !== "sftp" || status !== "connected" || !sessionId) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const insideContent = (position: { x: number; y: number }) => {
      const rect = listScroll.current?.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const x = position.x / ratio;
      const y = position.y / ratio;
      return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    };
    void getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "leave") { setDropActive(false); return; }
      const inside = insideContent(payload.position);
      if (payload.type === "enter" || payload.type === "over") { setDropActive(inside); return; }
      setDropActive(false);
      if (!inside || payload.paths.length === 0) return;
      setTransfer({ transferId: "", status: "starting", transferred: 0, total: 0, message: "正在扫描本地文件…", direction: "upload" });
      void uploadDroppedEntries(sessionId, payload.paths, path, (transferEvent) => {
        updateTransfer(transferEvent, "upload");
        if (transferEvent.type === "completed") void load(path);
      }).then((transferId) => setTransfer((current) => current ? { ...current, transferId } : current)).catch((reason) => {
        setTransfer({ transferId: "", status: "failed", transferred: 0, total: 0, message: errorMessage(reason), direction: "upload" });
      });
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => setDropActive(false));
    return () => { disposed = true; unlisten?.(); setDropActive(false); };
  }, [kind, load, path, sessionId, status]);

  async function openFile(entry: FileEntry, requestedMode: FileViewMode) {
    if (entry.isDirectory || entry.isSymlink) return;
    const previewKind = previewKindFor(entry.name);
    const mode = previewKind === "image" ? "preview" : requestedMode;
    const currentRequest = ++previewRequest.current;
    savedScroll.current = listScroll.current?.scrollTop ?? 0;
    setPreview({ entry, kind: previewKind, mode, loading: true, error: "", content: "", original: "", revision: "", imageUrl: "" });
    try {
      if (previewKind === "image") {
        const bytes = await readBinaryFile(kind === "sftp" ? sessionId : null, entry.path);
        if (previewRequest.current !== currentRequest) return;
        const imageUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime(entry.name) }));
        setPreview((current) => current?.entry.path === entry.path ? { ...current, loading: false, imageUrl } : current);
      } else {
        const document = await readTextFile(kind === "sftp" ? sessionId : null, entry.path);
        if (previewRequest.current !== currentRequest) return;
        setPreview((current) => current?.entry.path === entry.path ? { ...current, loading: false, content: document.content, original: document.content, revision: document.revision } : current);
      }
    } catch (reason) {
      if (previewRequest.current === currentRequest) setPreview((current) => current?.entry.path === entry.path ? { ...current, loading: false, error: errorMessage(reason) } : current);
    }
  }

  function leavePreview() {
    previewRequest.current += 1;
    if (preview?.imageUrl) URL.revokeObjectURL(preview.imageUrl);
    setPreview(null);
    requestAnimationFrame(() => { if (listScroll.current) listScroll.current.scrollTop = savedScroll.current; });
  }

  function closePreview() {
    if (preview?.mode === "edit" && preview.content !== preview.original && !window.confirm("文件有未保存的修改，确定放弃吗？")) return;
    leavePreview();
  }

  async function savePreview() {
    if (!preview || preview.mode !== "edit" || preview.kind === "image" || preview.loading || preview.content === preview.original) return;
    setSaving(true); setPreview((current) => current ? { ...current, error: "" } : current);
    try {
      const saved = await writeTextFile(kind === "sftp" ? sessionId : null, preview.entry.path, preview.content, preview.revision);
      setPreview((current) => current?.entry.path === preview.entry.path ? { ...current, original: saved.content, content: saved.content, revision: saved.revision } : current);
    } catch (reason) {
      setPreview((current) => current ? { ...current, error: errorMessage(reason) } : current);
    } finally { setSaving(false); }
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, entry: FileEntry) {
    event.preventDefault(); setSelectedPath(entry.path);
    showContextMenu(entry, event.clientX, event.clientY);
  }

  function openContextMenuFromKeyboard(event: KeyboardEvent<HTMLElement>, entry: FileEntry) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setSelectedPath(entry.path); showContextMenu(entry, rect.left + 18, rect.top + 18);
  }

  function showContextMenu(entry: FileEntry, anchorX: number, anchorY: number) {
    setContextMenu({ entry, anchorX, anchorY, x: anchorX, y: anchorY, placement: "below" });
  }

  async function copyPath(entry: FileEntry) {
    setContextMenu(null);
    try {
      await writeClipboardText(entry.path);
      setOperationMessage("路径已复制");
    } catch {
      setOperationMessage("复制路径失败");
    }
  }

  async function startDownload(entry: FileEntry) {
    if (!sessionId || kind !== "sftp") return;
    setContextMenu(null);
    const localPath = entry.isDirectory ? await selectDownloadDirectory(entry.name) : await selectDownloadPath(entry.name);
    if (!localPath) return;
    setTransfer({ transferId: "", status: "starting", transferred: 0, total: 0, message: entry.isDirectory ? "正在扫描远程文件夹…" : "正在准备下载…", direction: "download" });
    try {
      const transferId = entry.isDirectory
        ? await downloadDirectory(sessionId, entry.path, localPath, (event) => updateTransfer(event, "download"))
        : await downloadFile(sessionId, entry.path, localPath, (event) => updateTransfer(event, "download"));
      setTransfer((current) => current ? { ...current, transferId } : current);
    } catch (reason) {
      setTransfer({ transferId: "", status: "failed", transferred: 0, total: 0, message: errorMessage(reason), direction: "download" });
    }
  }

  function updateTransfer(event: TransferEvent, direction: "download" | "upload") {
    setTransfer((current) => {
      const action = direction === "upload" ? "上传" : "下载";
      const base: TransferState = current ?? { transferId: "", status: "starting", transferred: 0, total: 0, message: "", direction };
      if (event.type === "started") return { ...base, direction, status: "running", total: event.totalBytes, message: `正在${action}…` };
      if (event.type === "progress") return { ...base, direction, status: "running", transferred: event.transferredBytes, total: event.totalBytes, message: `正在${action}…` };
      if (event.type === "completed") return { ...base, direction, status: "completed", message: `${action}完成` };
      if (event.type === "cancelled") return { ...base, direction, status: "cancelled", message: `${action}已取消` };
      return { ...base, status: "failed", message: event.message };
    });
  }

  function requestNameOperation(kind: "copy" | "rename", entry: FileEntry) {
    setContextMenu(null);
    setNameOperation({ kind, entry, value: kind === "copy" ? copyName(entry.name) : entry.name, error: "", busy: false });
  }

  function requestCreate(kind: "createFile" | "createDirectory") {
    setEditingPath(false);
    setOperationMessage("");
    setNameOperation({ kind, entry: null, value: "", error: "", busy: false });
  }

  async function submitNameOperation(event: FormEvent) {
    event.preventDefault();
    if (!nameOperation || nameOperation.busy) return;
    setNameOperation({ ...nameOperation, busy: true, error: "" });
    try {
      const activeSession = kind === "sftp" ? sessionId : null;
      if (nameOperation.kind === "createFile" || nameOperation.kind === "createDirectory") {
        await createEntry(activeSession, path, nameOperation.value, nameOperation.kind === "createDirectory");
      } else if (nameOperation.kind === "copy") {
        await copyFile(activeSession, nameOperation.entry!.path, nameOperation.value);
      } else {
        await renameEntry(activeSession, nameOperation.entry!.path, nameOperation.value);
      }
      setNameOperation(null);
      setOperationMessage(nameOperation.kind === "copy" ? "文件复制完成" : nameOperation.kind === "rename" ? "改名完成" : nameOperation.kind === "createFile" ? "文件创建完成" : "文件夹创建完成");
      await load(path);
    } catch (reason) {
      setNameOperation((current) => current ? { ...current, busy: false, error: errorMessage(reason) } : current);
    }
  }

  async function confirmDelete() {
    if (!deleteOperation || deleteOperation.busy) return;
    setDeleteOperation({ ...deleteOperation, busy: true, error: "" });
    try {
      await deleteEntry(kind === "sftp" ? sessionId : null, deleteOperation.entry.path);
      setDeleteOperation(null);
      setOperationMessage("删除完成");
      await load(path);
    } catch (reason) {
      setDeleteOperation((current) => current ? { ...current, busy: false, error: errorMessage(reason) } : current);
    }
  }

  function cycleSort(key: SortKey) {
    setEditingPath(false);
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "ascending" };
      if (current.direction === "ascending") return { key, direction: "descending" };
      return null;
    });
  }

  const parent = parentPath(path, runtime?.kind === "local");
  if (preview) {
    const dirty = preview.mode === "edit" && preview.content !== preview.original;
    return <div className="file-browser file-preview">
      <header className="file-preview-toolbar">
        <button aria-label="返回文件夹" title="返回文件夹" onClick={closePreview}><Icon name="back" size={14}/></button>
        <div className="file-preview-identity"><strong>{preview.entry.name}{dirty && <span className="file-dirty-indicator" aria-label="有未保存的修改">*</span>}</strong><small title={preview.entry.path}>{preview.entry.path}</small></div>
        {preview.mode === "edit" && <span className="file-experimental-badge">实验功能</span>}
        <span className="file-view-mode">{preview.mode === "preview" ? "预览" : "编辑"}</span>
        {preview.mode === "preview" && <button className="file-edit-button" disabled={preview.kind === "image"} title={preview.kind === "image" ? "此文件类型不支持编辑" : "编辑文件（实验功能）"} onClick={() => setPreview((current) => current && current.kind !== "image" ? { ...current, mode: "edit" } : current)}><Icon name="edit" size={11}/><span>编辑</span></button>}
        {preview.mode === "edit" && <button className="file-cancel-button" onClick={leavePreview}><Icon name="close" size={10}/><span>取消</span></button>}
        {preview.mode === "edit" && <button className="file-save-button" aria-label={saving ? "正在保存" : dirty ? "保存" : "已保存"} title={saving ? "正在保存" : dirty ? "保存文件" : "文件已保存"} disabled={!dirty || saving || preview.loading} onClick={() => void savePreview()}><Icon name={dirty || saving ? "save" : "check"} size={11}/><span>保存</span></button>}
      </header>
      {preview.error && <div className="file-preview-message error" role="alert">{preview.error}</div>}
      <main className="file-preview-content">
        {preview.loading && <div className="file-browser-state">正在读取文件…</div>}
        {!preview.loading && preview.kind === "image" && preview.imageUrl && <div className="file-image-preview"><img src={preview.imageUrl} alt={preview.entry.name}/></div>}
        {!preview.loading && preview.mode === "preview" && preview.kind === "markdown" && <Suspense fallback={<div className="file-browser-state">正在加载预览…</div>}><MarkdownPreview content={preview.content}/></Suspense>}
        {!preview.loading && preview.kind !== "image" && (preview.mode === "edit" || preview.kind !== "markdown") && <Suspense fallback={<div className="file-browser-state">正在加载文件…</div>}><CodeEditor value={preview.content} language={preview.kind} readOnly={preview.mode === "preview"} onChange={(content) => setPreview((current) => current ? { ...current, content } : current)} onSave={() => void savePreview()}/></Suspense>}
      </main>
    </div>;
  }

  const entries = listing?.entries ?? [];
  const folderCount = entries.filter((entry) => entry.isDirectory).length;
  const fileCount = entries.length - folderCount;
  const transferActive = transfer?.status === "starting" || transfer?.status === "running";

  return <div className="file-browser">
    <nav className="file-browser-navigation" aria-label="文件夹导航">
      <button aria-label="返回上级文件夹" title="返回上级" disabled={!parent || loading} onClick={() => parent && void load(parent)}><Icon name="back" size={14}/></button>
      <div className="file-browser-path-shell" data-editing={editingPath || undefined}>
        {editingPath ? <form className="file-browser-path-form" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setEditingPath(false); }} onSubmit={(event) => { event.preventDefault(); void load(pathDraft); }}>
          <input aria-label="文件夹路径" autoFocus value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setPathDraft(path); setEditingPath(false); } }}/>
        </form> : <button className="file-browser-path" title={`${path} · 单击编辑`} onClick={() => { setPathDraft(path); setEditingPath(true); }}>{path}</button>}
      </div>
      <button aria-label="创建文件" title="创建文件" disabled={loading || (kind === "sftp" && status !== "connected")} onClick={() => requestCreate("createFile")}><Icon name="filePlus" size={14}/></button>
      <button aria-label="创建文件夹" title="创建文件夹" disabled={loading || (kind === "sftp" && status !== "connected")} onClick={() => requestCreate("createDirectory")}><Icon name="folderPlus" size={14}/></button>
      <button aria-label="刷新文件夹" title="刷新" disabled={loading} onClick={() => void load(path)}><Icon name="refresh" size={14}/></button>
    </nav>
    {connectionError && <div className="file-browser-inline-error" role="alert">{connectionError}</div>}
    {!connectionError && error && listing && <div className="file-browser-inline-error" role="alert">{error}</div>}
    <div className="file-browser-content" ref={listScroll} onPointerEnter={() => setEditingPath(false)} onScroll={() => setEditingPath(false)}>
      <div className="file-browser-columns" aria-label="文件排序">
        <FileSortHeader label="名称" sortKey="name" sort={sort} onChange={cycleSort}/>
        <FileSortHeader label="大小" sortKey="size" sort={sort} onChange={cycleSort}/>
        <span className="file-browser-column-label file-permission-column">权限</span>
        <FileSortHeader label="修改时间" sortKey="modifiedAt" sort={sort} onChange={cycleSort}/>
      </div>
      {loading && !listing && <div className="file-browser-state">正在读取文件夹…</div>}
      {!connectionError && error && !listing && <div className="file-browser-state error"><Icon name="files" size={22}/><span>{error}</span><button onClick={() => void load(path)}>重试</button></div>}
      {!error && listing?.entries.length === 0 && <div className="file-browser-state">此文件夹为空</div>}
      {listing && <div className="file-list" role="list" aria-label={`文件夹 ${listing.path}`}>{displayedEntries.map((entry) => <FileRow key={entry.path} entry={entry} selected={selectedPath === entry.path} onSelect={() => setSelectedPath(entry.path)} onOpen={() => entry.isDirectory ? void load(entry.path) : void openFile(entry, "preview")} onContextMenu={(event) => openContextMenu(event, entry)} onContextMenuKey={(event) => openContextMenuFromKeyboard(event, entry)}/>)}</div>}
      {dropActive && <div className="file-upload-drop-overlay" role="status"><Icon name="upload" size={24}/><strong>上传到当前目录</strong><span>{path}</span><small>释放鼠标以上传文件或文件夹</small></div>}
    </div>
    {contextMenu && <div ref={menuRef} className="file-context-menu" data-placement={contextMenu.placement} role="menu" aria-label={`${contextMenu.entry.name} 文件菜单`} style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()}>
      {!contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && <button role="menuitem" onClick={() => { setContextMenu(null); void openFile(contextMenu.entry, "preview"); }}>预览</button>}
      {!contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && previewKindFor(contextMenu.entry.name) !== "image" && <button role="menuitem" className="file-context-edit" onClick={() => { setContextMenu(null); void openFile(contextMenu.entry, "edit"); }}><span>编辑</span><small>实验</small></button>}
      {kind === "sftp" && !contextMenu.entry.isSymlink && <button role="menuitem" onClick={() => void startDownload(contextMenu.entry)}>下载到本地…</button>}
      <button role="menuitem" onClick={() => void copyPath(contextMenu.entry)}>复制路径</button>
      <div className="file-context-menu-separator" role="separator"/>
      {!contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && <button role="menuitem" onClick={() => requestNameOperation("copy", contextMenu.entry)}>复制文件…</button>}
      <button role="menuitem" onClick={() => requestNameOperation("rename", contextMenu.entry)}>改名…</button>
      <button role="menuitem" className="danger" onClick={() => { setContextMenu(null); setDeleteOperation({ entry: contextMenu.entry, error: "", busy: false }); }}>删除</button>
    </div>}
    <footer className={`file-browser-statusbar${transfer ? ` ${transfer.status}` : ""}`} role="status" aria-label="文件状态">
      {transferActive && transfer ? <>
        <span className="file-browser-transfer-label">{transfer.message}</span>
        {transfer.total > 0 ? <progress className="file-browser-transfer-progress" aria-label={`${transfer.direction === "upload" ? "上传" : "下载"}进度`} value={transfer.transferred} max={transfer.total}/> : <progress className="file-browser-transfer-progress" aria-label={`${transfer.direction === "upload" ? "上传" : "下载"}进度`}/>}
        <small>{transfer.total > 0 ? `${formatSize(transfer.transferred)} / ${formatSize(transfer.total)}` : "准备中"}</small>
        {transfer.transferId && sessionId && <button onClick={() => void cancelTransfer(sessionId, transfer.transferId)}>取消</button>}
      </> : <>
        <span>{listing ? `${folderCount} 个文件夹 · ${fileCount} 个文件` : loading ? "正在读取目录…" : "暂无目录统计"}</span>
        {(transfer || operationMessage) && <span className="file-browser-transfer-result">{transfer?.message || operationMessage}</span>}
        {(transfer || operationMessage) && <button aria-label="关闭操作状态" onClick={() => { setTransfer(null); setOperationMessage(""); }}><Icon name="close" size={10}/></button>}
      </>}
    </footer>
    {nameOperation && <DialogFrame title={nameOperation.kind === "copy" ? "复制文件" : nameOperation.kind === "rename" ? "改名" : nameOperation.kind === "createFile" ? "创建文件" : "创建文件夹"} subtitle={nameOperation.entry?.name ?? path} compact onClose={nameOperation.busy ? () => undefined : () => setNameOperation(null)}>
      <form className="file-name-operation" onSubmit={(event) => void submitNameOperation(event)}>
        <label>{nameOperation.kind === "copy" ? "副本名称" : nameOperation.kind === "rename" ? "新名称" : nameOperation.kind === "createFile" ? "文件名称" : "文件夹名称"}<input data-dialog-autofocus aria-label={nameOperation.kind === "copy" ? "副本名称" : nameOperation.kind === "rename" ? "新名称" : nameOperation.kind === "createFile" ? "文件名称" : "文件夹名称"} value={nameOperation.value} onChange={(event) => setNameOperation({ ...nameOperation, value: event.target.value, error: "" })}/></label>
        {nameOperation.error && <p className="inline-message error" role="alert">{nameOperation.error}</p>}
        <footer className="dialog-actions end"><button type="button" className="secondary-button" disabled={nameOperation.busy} onClick={() => setNameOperation(null)}>取消</button><button className="primary-button" disabled={nameOperation.busy || !nameOperation.value.trim() || (nameOperation.kind === "rename" && nameOperation.value === nameOperation.entry?.name)}>{nameOperation.busy ? "处理中…" : nameOperation.kind === "copy" ? "创建副本" : nameOperation.kind === "rename" ? "保存名称" : nameOperation.kind === "createFile" ? "创建文件" : "创建文件夹"}</button></footer>
      </form>
    </DialogFrame>}
    {deleteOperation && <DialogFrame title={`删除${deleteOperation.entry.isDirectory ? "文件夹" : deleteOperation.entry.isSymlink ? "链接" : "文件"}？`} subtitle={deleteOperation.entry.name} compact onClose={deleteOperation.busy ? () => undefined : () => setDeleteOperation(null)}>
      <p className="confirm-copy">{deleteOperation.entry.isDirectory ? "文件夹及其中的全部内容将被永久删除，此操作无法撤销。" : deleteOperation.entry.isSymlink ? "只会删除此链接，不会删除链接指向的目标。此操作无法撤销。" : "文件将被永久删除，此操作无法撤销。"}</p>
      {deleteOperation.error && <p className="inline-message error" role="alert">{deleteOperation.error}</p>}
      <footer className="dialog-actions end"><button className="secondary-button" disabled={deleteOperation.busy} onClick={() => setDeleteOperation(null)}>取消</button><button className="danger-button filled" data-dialog-autofocus disabled={deleteOperation.busy} onClick={() => void confirmDelete()}>{deleteOperation.busy ? "删除中…" : "确认删除"}</button></footer>
    </DialogFrame>}
  </div>;
}

function FileSortHeader({ label, sortKey, sort, onChange }: { label: string; sortKey: SortKey; sort: SortState; onChange: (key: SortKey) => void }) {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const action = direction === "ascending" ? "已升序，点击降序排列" : direction === "descending" ? "已降序，点击恢复默认排序" : "默认顺序，点击升序排列";
  return <button className="file-browser-sort-button" aria-label={`${label}，${action}`} aria-pressed={Boolean(direction)} data-sort-direction={direction ?? undefined} title={`${label}：${action}`} onClick={() => onChange(sortKey)}>
    <span>{label}</span><span className="file-sort-indicator" aria-hidden="true">{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span>
  </button>;
}

function FileRow({ entry, selected, onSelect, onOpen, onContextMenu, onContextMenuKey }: { entry: FileEntry; selected: boolean; onSelect: () => void; onOpen: () => void; onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void; onContextMenuKey: (event: KeyboardEvent<HTMLButtonElement>) => void }) {
  return <button className="file-row" data-selected={selected || undefined} role="listitem" title={entry.path} onClick={() => { if (!entry.isDirectory && selected) onOpen(); else onSelect(); }} onDoubleClick={() => { if (entry.isDirectory) onOpen(); }} onContextMenu={onContextMenu} onKeyDown={(event) => { onContextMenuKey(event); if (event.key === "Enter") onOpen(); }}>
    <span className="file-name"><Icon name={entry.isDirectory ? "files" : "file"} size={14}/><span>{entry.name}</span>{entry.isSymlink && <small>链接</small>}</span>
    <span>{entry.isDirectory ? "—" : formatSize(entry.size)}</span><span className="file-permission file-permission-column">{formatPermissions(entry.permissionMode)}</span><span>{entry.modifiedAt ? new Date(entry.modifiedAt * 1000).toLocaleString() : "—"}</span>
  </button>;
}

function previewKindFor(name: string): PreviewKind {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) return "image";
  if (["md", "markdown", "mdown"].includes(extension)) return "markdown";
  if (extension === "json") return "json";
  if (["yaml", "yml"].includes(extension)) return "yaml";
  return "text";
}

function imageMime(name: string): string {
  const extension = name.toLowerCase().split(".").pop();
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension ?? "png"}`;
}

const fileNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortEntries(entries: FileEntry[], sort: SortState): FileEntry[] {
  if (!sort) return entries;
  const factor = sort.direction === "ascending" ? 1 : -1;
  return entries.map((entry, index) => ({ entry, index })).sort((left, right) => {
    if (left.entry.isDirectory !== right.entry.isDirectory) return left.entry.isDirectory ? -1 : 1;
    if (sort.key === "modifiedAt") {
      if (left.entry.modifiedAt === null && right.entry.modifiedAt !== null) return 1;
      if (left.entry.modifiedAt !== null && right.entry.modifiedAt === null) return -1;
    }
    const comparison = sort.key === "name"
      ? fileNameCollator.compare(left.entry.name, right.entry.name)
      : sort.key === "size"
        ? left.entry.size - right.entry.size
        : (left.entry.modifiedAt ?? 0) - (right.entry.modifiedAt ?? 0);
    return comparison === 0 ? left.index - right.index : comparison * factor;
  }).map(({ entry }) => entry);
}

function formatPermissions(mode: number | null | undefined): string {
  if (mode == null) return "—";
  const value = mode & 0o7777;
  const execute = (bit: number, special: number, active: string, inactive: string) => value & special ? value & bit ? active : inactive : value & bit ? "x" : "-";
  return [
    value & 0o400 ? "r" : "-", value & 0o200 ? "w" : "-", execute(0o100, 0o4000, "s", "S"),
    value & 0o040 ? "r" : "-", value & 0o020 ? "w" : "-", execute(0o010, 0o2000, "s", "S"),
    value & 0o004 ? "r" : "-", value & 0o002 ? "w" : "-", execute(0o001, 0o1000, "t", "T"),
  ].join("");
}

function fitContextMenu(anchorX: number, anchorY: number, menuWidth: number, menuHeight: number, viewportWidth: number, viewportHeight: number) {
  const gap = 6;
  const maxLeft = Math.max(gap, viewportWidth - menuWidth - gap);
  const maxTop = Math.max(gap, viewportHeight - menuHeight - gap);
  const placement = anchorY + menuHeight + gap > viewportHeight ? "above" : "below";
  const preferredTop = placement === "above" ? anchorY - menuHeight : anchorY;
  return {
    x: Math.min(Math.max(anchorX, gap), maxLeft),
    y: Math.min(Math.max(preferredTop, gap), maxTop),
    placement,
  } as const;
}

function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} - 副本${name.slice(dot)}` : `${name} - 副本`;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : "文件操作失败";
}
