import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";

import { Icon } from "../components/Icon";
import { Button, StatusBadge } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { ExactTextInput } from "../components/ExactTextInput";
import { copyImageUrlToClipboard } from "../lib/tauri/clipboard";
import { copyFile, createEntry, deleteEntry, listLocalDirectory, listLocalRoots, listRemoteDirectory, readBinaryFile, readTextFile, renameEntry, writeTextFile, type DirectoryListing, type FileEntry, type LocalRoot } from "../lib/tauri/files";
import { cancelTransfer, downloadDirectory, downloadFile, selectDownloadDirectory, selectDownloadPath, selectUploadFiles, selectUploadFolder, uploadDroppedEntries, uploadSelectedEntries, type TransferEvent } from "../lib/tauri/transfers";
import type { FileRuntime } from "../workspace/WorkspaceProvider";
import { FileList, FileSortHeader } from "./FileList";
import { FILE_LIST_PADDING, FILE_ROW_HEIGHT, FILE_VIRTUAL_FALLBACK_ROWS, FILE_VIRTUAL_OVERSCAN, copyName, fileErrorMessage, fileListAnchor, fileVirtualRange, fitContextMenu, formatSize, imageMime, previewKindFor, sortEntries, type PreviewKind, type SortKey, type SortState, type VirtualRange } from "./fileBrowserModel";
import { displayLocalPath, isWindowsDriveRoot, parentPath } from "./path";

type FileViewMode = "preview" | "edit";
type PreviewState = { entry: FileEntry; kind: PreviewKind; mode: FileViewMode; loading: boolean; error: string; content: string; original: string; revision: string; imageUrl: string };
type TransferState = { transferId: string; status: "starting" | "running" | "completed" | "cancelled" | "failed"; transferred: number; total: number; message: string; direction: "download" | "upload" };
type NameOperation = { kind: "copy" | "rename" | "createFile" | "createDirectory"; entry: FileEntry | null; value: string; error: string; busy: boolean };
type DeleteOperation = { entries: FileEntry[]; error: string; busy: boolean };
type ContextMenuState = { entry: FileEntry; anchorX: number; anchorY: number; x: number; y: number; placement: "above" | "below" };
type UploadMenuState = { anchorRight: number; anchorY: number; x: number; y: number; placement: "above" | "below" };
type DirectoryLocation = { scrollTop: number; selectedPath: string | null; anchorPath: string | null; anchorOffset: number };
type PendingDirectoryLocation = { key: string; location: DirectoryLocation };

const LOCAL_ROOTS_LOCATION = "\0local-roots";

const CodeEditor = lazy(() => import("./CodeEditor").then((module) => ({ default: module.CodeEditor })));
const MarkdownPreview = lazy(() => import("./MarkdownPreview").then((module) => ({ default: module.MarkdownPreview })));

function FileLoadingState({ label }: { label: string }) {
  return <div className="file-loading-state" role="status" aria-live="polite">
    <span className="file-loading-popover"><span className="file-loading-spinner" aria-hidden="true"/><span>{label}</span></span>
  </div>;
}

export function FileBrowserPane({ initialPath, runtime, onPathChange }: { initialPath: string; runtime: FileRuntime; onPathChange: (path: string) => void }) {
  const [path, setPath] = useState(initialPath);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [localRoots, setLocalRoots] = useState<LocalRoot[]>([]);
  const [showLocalRoots, setShowLocalRoots] = useState(false);
  const [forwardPaths, setForwardPaths] = useState<string[]>([]);
  const [virtualRange, setVirtualRange] = useState<VirtualRange>({ start: 0, end: FILE_VIRTUAL_FALLBACK_ROWS + FILE_VIRTUAL_OVERSCAN });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState(displayLocalPath(initialPath));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState<{ error: string } | null>(null);
  const [leaveConfirmation, setLeaveConfirmation] = useState(false);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [operationMessage, setOperationMessage] = useState("");
  const [nameOperation, setNameOperation] = useState<NameOperation | null>(null);
  const [deleteOperation, setDeleteOperation] = useState<DeleteOperation | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploadMenu, setUploadMenu] = useState<UploadMenuState | null>(null);
  const [selectingUpload, setSelectingUpload] = useState(false);
  const request = useRef(0);
  const previewRequest = useRef(0);
  const listScroll = useRef<HTMLDivElement>(null);
  const directoryLocations = useRef(new Map<string, DirectoryLocation>());
  const pendingDirectoryLocation = useRef<PendingDirectoryLocation | null>(null);
  const lastLoadedInputPath = useRef<string | null>(null);
  const lastLoadedRuntime = useRef<string | null>(null);
  const pathRef = useRef(path);
  const listingRef = useRef(listing);
  const selectedPathRef = useRef(selectedPath);
  const showLocalRootsRef = useRef(showLocalRoots);
  const savedScroll = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const uploadMenuPointerActive = useRef(false);
  const kind = runtime?.kind;
  const sessionId = runtime?.sessionId;
  const status = runtime?.status;
  const sessionIdRef = useRef(sessionId);
  const connectionError = kind === "sftp" && status === "failed" ? runtime.notice.trim() || "文件连接失败" : "";
  const displayedEntries = useMemo(() => sortEntries(listing?.entries ?? [], sort), [listing, sort]);
  const rootEntries = useMemo<FileEntry[]>(() => localRoots.map((root) => ({
    name: root.name,
    path: root.path,
    isDirectory: true,
    isSymlink: false,
    size: 0,
    modifiedAt: null,
    permissionMode: null,
  })), [localRoots]);
  const displayedRootEntries = useMemo(() => sortEntries(rootEntries, sort), [rootEntries, sort]);
  const activeEntries = showLocalRoots ? displayedRootEntries : displayedEntries;
  const contextEntries = contextMenu
    ? selectedPaths.has(contextMenu.entry.path) ? activeEntries.filter((entry) => selectedPaths.has(entry.path)) : [contextMenu.entry]
    : [];
  const activeEntryIndexes = useMemo(() => new Map(activeEntries.map((entry, index) => [entry.path, index])), [activeEntries]);
  const activeEntriesRef = useRef(activeEntries);
  pathRef.current = path;
  listingRef.current = listing;
  selectedPathRef.current = selectedPath;
  showLocalRootsRef.current = showLocalRoots;
  activeEntriesRef.current = activeEntries;
  sessionIdRef.current = sessionId;

  const updateVirtualRange = useCallback((container: HTMLElement, entryCount: number) => {
    const next = fileVirtualRange(container.scrollTop, container.clientHeight, entryCount);
    setVirtualRange((current) => current.start === next.start && current.end === next.end ? current : next);
  }, []);

  const rememberDirectoryLocation = useCallback(() => {
    const key = showLocalRootsRef.current ? LOCAL_ROOTS_LOCATION : listingRef.current?.path ?? pathRef.current;
    const container = listScroll.current;
    const anchor = container ? fileListAnchor(container.scrollTop, activeEntriesRef.current) : null;
    directoryLocations.current.set(key, {
      scrollTop: container?.scrollTop ?? 0,
      selectedPath: selectedPathRef.current,
      anchorPath: anchor?.path ?? null,
      anchorOffset: anchor?.offset ?? 0,
    });
  }, []);

  const prepareDirectoryLocation = useCallback((key: string) => {
    const location = directoryLocations.current.get(key) ?? { scrollTop: 0, selectedPath: null, anchorPath: null, anchorOffset: 0 };
    pendingDirectoryLocation.current = { key, location };
    selectedPathRef.current = location.selectedPath;
    setSelectedPath(location.selectedPath);
    setSelectedPaths(location.selectedPath ? new Set([location.selectedPath]) : new Set());
  }, []);

  const load = useCallback(async (nextPath: string, returnToRootsOnError = false) => {
    const currentRequest = ++request.current;
    if (kind === "sftp" && (!sessionId || status !== "connected")) {
      setEditingPath(false);
      setLoading(false);
      setError("");
      return false;
    }
    rememberDirectoryLocation();
    setEditingPath(false);
    setShowLocalRoots(false);
    showLocalRootsRef.current = false;
    setLoading(true);
    setError("");
    try {
      const next = kind === "local" ? await listLocalDirectory(nextPath) : await listRemoteDirectory(sessionId!, nextPath);
      if (request.current !== currentRequest) return false;
      lastLoadedInputPath.current = nextPath;
      lastLoadedRuntime.current = `${kind ?? "unknown"}:${sessionId ?? ""}`;
      pathRef.current = next.path; listingRef.current = next;
      prepareDirectoryLocation(next.path);
      setPath(next.path); setPathDraft(kind === "local" ? displayLocalPath(next.path) : next.path); setListing(next); setEditingPath(false); onPathChange(next.path);
      return true;
    } catch (reason) {
      if (request.current === currentRequest) {
        setError(fileErrorMessage(reason));
        if (returnToRootsOnError) { setShowLocalRoots(true); showLocalRootsRef.current = true; }
      }
      return false;
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [kind, onPathChange, prepareDirectoryLocation, rememberDirectoryLocation, sessionId, status]);

  const openLocalRoots = useCallback(async () => {
    if (kind !== "local") return false;
    const currentRequest = ++request.current;
    rememberDirectoryLocation();
    setEditingPath(false);
    setContextMenu(null);
    setShowLocalRoots(true);
    showLocalRootsRef.current = true;
    setLoading(true);
    setError("");
    try {
      const roots = await listLocalRoots();
      if (request.current !== currentRequest) return false;
      prepareDirectoryLocation(LOCAL_ROOTS_LOCATION);
      setLocalRoots(roots);
      return true;
    } catch (reason) {
      if (request.current === currentRequest) setError(fileErrorMessage(reason));
      return false;
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [kind, prepareDirectoryLocation, rememberDirectoryLocation]);

  useEffect(() => {
    const runtimeKey = `${kind ?? "unknown"}:${sessionId ?? ""}`;
    const sameLoadedLocation = !showLocalRootsRef.current
      && lastLoadedRuntime.current === runtimeKey
      && (initialPath === pathRef.current || initialPath === lastLoadedInputPath.current);
    if (sameLoadedLocation) return;
    const frame = requestAnimationFrame(() => void load(initialPath));
    return () => { cancelAnimationFrame(frame); };
  }, [initialPath, kind, load, sessionId]);

  useEffect(() => () => { request.current += 1; }, []);

  useLayoutEffect(() => {
    const pending = pendingDirectoryLocation.current;
    const key = showLocalRoots ? LOCAL_ROOTS_LOCATION : listing?.path;
    const container = listScroll.current;
    if (!pending || !key || pending.key !== key || !container) return;
    pendingDirectoryLocation.current = null;
    const anchorIndex = pending.location.anchorPath ? activeEntryIndexes.get(pending.location.anchorPath) : undefined;
    container.scrollTop = anchorIndex === undefined
      ? pending.location.scrollTop
      : FILE_LIST_PADDING + anchorIndex * FILE_ROW_HEIGHT - pending.location.anchorOffset;
    updateVirtualRange(container, activeEntries.length);
  }, [activeEntries.length, activeEntryIndexes, listing, showLocalRoots, updateVirtualRange]);

  useLayoutEffect(() => {
    const container = listScroll.current;
    if (!container) return;
    const update = () => updateVirtualRange(container, activeEntries.length);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeEntries.length, updateVirtualRange]);

  useEffect(() => {
    if (!contextMenu) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const close = (event: globalThis.PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest(".file-context-menu")) setContextMenu(null); };
    const keydown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", keydown); };
  }, [contextMenu]);

  useEffect(() => {
    if (!uploadMenu) return;
    const frame = requestAnimationFrame(() => uploadMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus());
    const close = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && (event.target.closest(".file-upload-menu") || event.target.closest("[data-file-upload-trigger]"))) return;
      setUploadMenu(null);
      requestAnimationFrame(() => uploadButtonRef.current?.focus());
    };
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setUploadMenu(null);
      requestAnimationFrame(() => uploadButtonRef.current?.focus());
    };
    const resetPointer = () => { uploadMenuPointerActive.current = false; };
    window.addEventListener("pointerdown", close);
    window.addEventListener("pointerup", resetPointer);
    window.addEventListener("pointercancel", resetPointer);
    window.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("pointerup", resetPointer);
      window.removeEventListener("pointercancel", resetPointer);
      window.removeEventListener("keydown", keydown);
    };
  }, [uploadMenu]);

  useLayoutEffect(() => {
    if (!uploadMenu || !uploadMenuRef.current) return;
    const rect = uploadMenuRef.current.getBoundingClientRect();
    const fitted = fitContextMenu(uploadMenu.anchorRight - rect.width, uploadMenu.anchorY, rect.width, rect.height, window.innerWidth, window.innerHeight);
    if (uploadMenu.x === fitted.x && uploadMenu.y === fitted.y && uploadMenu.placement === fitted.placement) return;
    setUploadMenu((current) => current ? { ...current, ...fitted } : current);
  }, [uploadMenu]);

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
      if (document.querySelector(".dialog-scrim")) { setDropActive(false); return; }
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
        setTransfer({ transferId: "", status: "failed", transferred: 0, total: 0, message: fileErrorMessage(reason), direction: "upload" });
      });
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => setDropActive(false));
    return () => { disposed = true; unlisten?.(); setDropActive(false); };
  }, [kind, load, path, sessionId, status]);

  async function openFile(entry: FileEntry, requestedMode: FileViewMode) {
    if (entry.isDirectory || entry.isSymlink) return;
    setOperationMessage("");
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
      if (previewRequest.current === currentRequest) setPreview((current) => current?.entry.path === entry.path ? { ...current, loading: false, error: fileErrorMessage(reason) } : current);
    }
  }

  function leavePreview() {
    previewRequest.current += 1;
    if (preview?.imageUrl) URL.revokeObjectURL(preview.imageUrl);
    setSaveConfirmation(null);
    setLeaveConfirmation(false);
    setPreview(null);
    requestAnimationFrame(() => { if (listScroll.current) listScroll.current.scrollTop = savedScroll.current; });
  }

  function requestLeavePreview() {
    if (preview?.mode === "edit" && preview.content !== preview.original) {
      setLeaveConfirmation(true);
      return;
    }
    leavePreview();
  }

  function requestPreviewSave() {
    if (!preview || preview.mode !== "edit" || preview.kind === "image" || preview.loading || preview.content === preview.original) return;
    setSaveConfirmation({ error: "" });
  }

  async function confirmPreviewSave() {
    if (!preview || !saveConfirmation || saving || preview.mode !== "edit" || preview.kind === "image" || preview.loading || preview.content === preview.original) return;
    const requested = preview;
    setSaving(true); setPreview((current) => current ? { ...current, error: "" } : current);
    setSaveConfirmation({ error: "" });
    try {
      const saved = await writeTextFile(kind === "sftp" ? sessionId : null, requested.entry.path, requested.content, requested.revision);
      setPreview((current) => current?.entry.path === requested.entry.path ? { ...current, original: saved.content, content: saved.content, revision: saved.revision } : current);
      setSaveConfirmation(null);
    } catch (reason) {
      setSaveConfirmation({ error: fileErrorMessage(reason) });
    } finally { setSaving(false); }
  }

  function selectEntry(entry: FileEntry, additive: boolean) {
    if (!additive) {
      selectedPathRef.current = entry.path;
      setSelectedPath(entry.path);
      setSelectedPaths(new Set([entry.path]));
      return;
    }
    const next = new Set(selectedPaths);
    if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
    let nextActivePath = selectedPath;
    if (next.has(entry.path)) nextActivePath = entry.path;
    else if (selectedPath === entry.path) nextActivePath = activeEntries.find((item) => next.has(item.path))?.path ?? null;
    selectedPathRef.current = nextActivePath;
    setSelectedPath(nextActivePath);
    setSelectedPaths(next);
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, entry: FileEntry) {
    event.preventDefault();
    if (!selectedPaths.has(entry.path)) selectEntry(entry, false);
    showContextMenu(entry, event.clientX, event.clientY);
  }

  function openContextMenuFromKeyboard(event: KeyboardEvent<HTMLElement>, entry: FileEntry) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    if (!selectedPaths.has(entry.path)) selectEntry(entry, false);
    const rect = event.currentTarget.getBoundingClientRect(); showContextMenu(entry, rect.left + 18, rect.top + 18);
  }

  function showContextMenu(entry: FileEntry, anchorX: number, anchorY: number) {
    setUploadMenu(null);
    setContextMenu({ entry, anchorX, anchorY, x: anchorX, y: anchorY, placement: "below" });
  }

  function handleContextMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(["ArrowDown", "ArrowUp", "Home", "End"] as string[]).includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
          : (currentIndex + 1) % items.length;
    items[nextIndex].focus();
  }

  function handleUploadMenuBlur(event: FocusEvent<HTMLDivElement>) {
    if (uploadMenuPointerActive.current) return;
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && !event.currentTarget.contains(nextFocus)) setUploadMenu(null);
  }

  async function copyPath(entry: FileEntry) {
    setContextMenu(null);
    try {
      await writeClipboardText(kind === "local" ? displayLocalPath(entry.path) : entry.path);
      setOperationMessage("路径已复制");
    } catch {
      setOperationMessage("复制路径失败");
    }
  }

  async function copyImage(entry: FileEntry, existingUrl?: string) {
    setContextMenu(null);
    setOperationMessage("");
    let temporaryUrl = "";
    try {
      let imageUrl = existingUrl;
      if (!imageUrl) {
        const bytes = await readBinaryFile(kind === "sftp" ? sessionId : null, entry.path);
        temporaryUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime(entry.name) }));
        imageUrl = temporaryUrl;
      }
      await copyImageUrlToClipboard(imageUrl);
      setOperationMessage("图片已复制");
    } catch (reason) {
      setOperationMessage(`复制图片失败：${fileErrorMessage(reason)}`);
    } finally {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
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
      setTransfer({ transferId: "", status: "failed", transferred: 0, total: 0, message: fileErrorMessage(reason), direction: "download" });
    }
  }

  function toggleUploadMenu() {
    if (uploadMenu) {
      setUploadMenu(null);
      return;
    }
    const rect = uploadButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu(null);
    setEditingPath(false);
    setUploadMenu({ anchorRight: rect.right, anchorY: rect.bottom + 4, x: rect.right - 164, y: rect.bottom + 4, placement: "below" });
  }

  async function startSelectedUpload(selection: "files" | "folder") {
    if (kind !== "sftp" || status !== "connected" || !sessionId) return;
    const targetPath = pathRef.current;
    const targetSessionId = sessionId;
    setUploadMenu(null);
    setSelectingUpload(true);
    setOperationMessage("");
    try {
      const paths = selection === "files"
        ? await selectUploadFiles()
        : await selectUploadFolder().then((folder) => folder ? [folder] : []);
      if (paths.length === 0) return;
      setTransfer({ transferId: "", status: "starting", transferred: 0, total: 0, message: "正在扫描本地文件…", direction: "upload" });
      const transferId = await uploadSelectedEntries(targetSessionId, paths, targetPath, (event) => {
        updateTransfer(event, "upload");
        if (event.type === "completed" && pathRef.current === targetPath && sessionIdRef.current === targetSessionId) void load(targetPath);
      });
      setTransfer((current) => current ? { ...current, transferId } : current);
    } catch (reason) {
      setTransfer({ transferId: "", status: "failed", transferred: 0, total: 0, message: fileErrorMessage(reason), direction: "upload" });
    } finally {
      setSelectingUpload(false);
      requestAnimationFrame(() => uploadButtonRef.current?.focus());
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
      setNameOperation((current) => current ? { ...current, busy: false, error: fileErrorMessage(reason) } : current);
    }
  }

  async function confirmDelete() {
    if (!deleteOperation || deleteOperation.busy) return;
    setDeleteOperation({ ...deleteOperation, busy: true, error: "" });
    const requestedEntries = deleteOperation.entries;
    const results = await Promise.allSettled(requestedEntries.map((entry) => deleteEntry(kind === "sftp" ? sessionId : null, entry.path)));
    const failedEntries = requestedEntries.filter((_, index) => results[index].status === "rejected");
    const firstFailure = results.find((result) => result.status === "rejected");
    const deletedCount = requestedEntries.length - failedEntries.length;
    selectedPathRef.current = null;
    setSelectedPath(null);
    setSelectedPaths(new Set());
    await load(path);
    if (failedEntries.length > 0) {
      const failedPaths = new Set(failedEntries.map((entry) => entry.path));
      selectedPathRef.current = failedEntries[0].path;
      setSelectedPath(failedEntries[0].path);
      setSelectedPaths(failedPaths);
      setDeleteOperation({
        entries: failedEntries,
        busy: false,
        error: `${deletedCount > 0 ? `已删除 ${deletedCount} 个项目，` : ""}${failedEntries.length} 个项目删除失败：${firstFailure?.status === "rejected" ? fileErrorMessage(firstFailure.reason) : "文件操作失败"}`,
      });
      return;
    }
    setDeleteOperation(null);
    setOperationMessage(requestedEntries.length > 1 ? `已删除 ${requestedEntries.length} 个项目` : "删除完成");
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
  const visiblePath = kind === "local" ? displayLocalPath(path) : path;
  const driveRoot = kind === "local" && isWindowsDriveRoot(path);
  const forwardPath = forwardPaths[forwardPaths.length - 1] ?? null;

  async function navigateTo(nextPath: string, returnToRootsOnError = false) {
    if (await load(nextPath, returnToRootsOnError)) setForwardPaths([]);
  }

  async function navigateUp() {
    const previousPath = path;
    const succeeded = driveRoot ? await openLocalRoots() : parent ? await load(parent) : false;
    if (succeeded) setForwardPaths((current) => [...current, previousPath]);
  }

  async function navigateForward() {
    if (!forwardPath) return;
    const succeeded = await load(forwardPath, showLocalRoots);
    if (!succeeded) return;
    setForwardPaths((current) => current[current.length - 1] === forwardPath ? current.slice(0, -1) : current);
  }

  if (preview) {
    const dirty = preview.mode === "edit" && preview.content !== preview.original;
    const previewDisplayPath = kind === "local" ? displayLocalPath(preview.entry.path) : preview.entry.path;
    return <div className="file-browser file-preview">
      <header className="file-preview-toolbar">
        <button aria-label="返回文件夹" title="返回文件夹" onClick={requestLeavePreview}><Icon name="back" size={14}/></button>
        <div className="file-preview-identity"><strong>{preview.entry.name}{dirty && <span className="file-dirty-indicator" aria-label="有未保存的修改">*</span>}</strong><small title={previewDisplayPath}>{previewDisplayPath}</small></div>
        {preview.mode === "edit" && <StatusBadge tone="warning" presentation="tag" size="compact">实验功能</StatusBadge>}
        <span className="file-view-mode">{preview.mode === "preview" ? "预览" : "编辑"}</span>
        {preview.mode === "preview" && <button className="file-edit-button" disabled={preview.kind === "image"} title={preview.kind === "image" ? "此文件类型不支持编辑" : "编辑文件（实验功能）"} onClick={() => setPreview((current) => current && current.kind !== "image" ? { ...current, mode: "edit" } : current)}><Icon name="edit" size={11}/><span>编辑</span></button>}
        {preview.mode === "edit" && <button className="file-cancel-button" onClick={requestLeavePreview}><Icon name="close" size={10}/><span>取消</span></button>}
        {preview.mode === "edit" && <button className="file-save-button" aria-label={saving ? "正在保存" : dirty ? "保存" : "已保存"} aria-busy={saving || undefined} title={saving ? "正在保存" : dirty ? "保存文件" : "文件已保存"} disabled={!dirty || saving || preview.loading} onClick={requestPreviewSave}><Icon name={dirty || saving ? "save" : "check"} size={11}/><span>保存</span></button>}
      </header>
      {preview.error && <div className="file-preview-message error" role="alert">{preview.error}</div>}
      <main className="file-preview-content">
        {preview.loading && <FileLoadingState label="正在读取文件…"/>}
        {!preview.loading && preview.kind === "image" && preview.imageUrl && <div className="file-image-preview" onContextMenu={(event) => { event.preventDefault(); showContextMenu(preview.entry, event.clientX, event.clientY); }}><img src={preview.imageUrl} alt={preview.entry.name}/></div>}
        {!preview.loading && preview.mode === "preview" && preview.kind === "markdown" && <Suspense fallback={<FileLoadingState label="正在加载预览…"/>}><MarkdownPreview content={preview.content}/></Suspense>}
        {!preview.loading && preview.kind !== "image" && (preview.mode === "edit" || preview.kind !== "markdown") && <Suspense fallback={<FileLoadingState label="正在加载文件…"/>}><CodeEditor value={preview.content} language={preview.kind} readOnly={preview.mode === "preview"} onChange={(content) => setPreview((current) => current ? { ...current, content } : current)} onSave={requestPreviewSave}/></Suspense>}
      </main>
      {operationMessage && <div className="file-preview-operation" role="status" aria-label="图片操作状态" aria-live="polite">{operationMessage}</div>}
      {contextMenu && preview.kind === "image" && preview.imageUrl && <div ref={menuRef} className="file-context-menu" data-placement={contextMenu.placement} role="menu" aria-label={`${preview.entry.name} 图片菜单`} style={{ left: contextMenu.x, top: contextMenu.y }} onKeyDown={handleContextMenuKeyDown} onContextMenu={(event) => event.preventDefault()}>
        <button role="menuitem" onClick={() => void copyImage(preview.entry, preview.imageUrl)}><Icon name="copy" size={13}/><span>复制图片</span></button>
        <button role="menuitem" onClick={() => void copyPath(preview.entry)}><Icon name="copy" size={13}/><span>复制路径</span></button>
      </div>}
      {saveConfirmation && <DialogFrame title="覆盖保存文件？" subtitle={preview.entry.name} compact dismissible={!saving} onClose={() => { if (!saving) setSaveConfirmation(null); }}>
        <div className="file-preview-confirmation">
          <p className="confirm-copy">保存后，当前文件的现有内容将被替换。若没有其他备份，此操作无法撤销。</p>
          <div className="file-preview-confirmation-target"><span>目标文件</span><code title={previewDisplayPath}>{previewDisplayPath}</code></div>
        </div>
        <footer className="dialog-actions dialog-actions-with-status"><DialogActionStatus message={saveConfirmation.error}/><div><Button disabled={saving} onClick={() => setSaveConfirmation(null)}>取消</Button><Button variant="dangerSolid" loading={saving} onClick={() => void confirmPreviewSave()}>{saving ? "正在保存…" : "确认覆盖"}</Button></div></footer>
      </DialogFrame>}
      {leaveConfirmation && <DialogFrame title="放弃未保存的修改？" subtitle={preview.entry.name} compact onClose={() => setLeaveConfirmation(false)}>
        <div className="file-preview-confirmation">
          <p className="confirm-copy">当前修改尚未保存。退出编辑后，这些修改将丢失且无法恢复。</p>
          <div className="file-preview-confirmation-target"><span>正在编辑</span><code title={previewDisplayPath}>{previewDisplayPath}</code></div>
        </div>
        <footer className="dialog-actions end"><Button onClick={() => setLeaveConfirmation(false)}>继续编辑</Button><Button variant="dangerSolid" onClick={leavePreview}>放弃并退出</Button></footer>
      </DialogFrame>}
    </div>;
  }

  const entries = listing?.entries ?? [];
  const folderCount = entries.filter((entry) => entry.isDirectory).length;
  const fileCount = entries.length - folderCount;
  const transferActive = transfer?.status === "starting" || transfer?.status === "running";

  return <div className="file-browser">
    <nav className="file-browser-navigation" data-upload-action={kind === "sftp" || undefined} aria-label="文件夹导航">
      <button aria-label="返回上级文件夹" title="返回上级" disabled={showLocalRoots || (!parent && !driveRoot) || loading} onClick={() => void navigateUp()}><Icon name="back" size={14}/></button>
      <button aria-label="前进到下一目录" title={forwardPath ? `前进到 ${kind === "local" ? displayLocalPath(forwardPath) : forwardPath}` : "没有可前进的目录"} disabled={!forwardPath || loading} onClick={() => void navigateForward()}><Icon name="forward" size={14}/></button>
      <div className="file-browser-path-shell" data-editing={editingPath || undefined}>
        {showLocalRoots ? <span className="file-browser-path file-browser-location-label">本机</span> : editingPath ? <form className="file-browser-path-form" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setEditingPath(false); }} onSubmit={(event) => { event.preventDefault(); void navigateTo(pathDraft); }}>
          <ExactTextInput aria-label="文件夹路径" autoFocus value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setPathDraft(visiblePath); setEditingPath(false); } }}/>
        </form> : <button className="file-browser-path" title={`${visiblePath} · 单击编辑`} onClick={() => { setPathDraft(visiblePath); setEditingPath(true); }}>{visiblePath}</button>}
      </div>
      <button aria-label="创建文件" title="创建文件" disabled={showLocalRoots || loading || (kind === "sftp" && status !== "connected")} onClick={() => requestCreate("createFile")}><Icon name="filePlus" size={14}/></button>
      <button aria-label="创建文件夹" title="创建文件夹" disabled={showLocalRoots || loading || (kind === "sftp" && status !== "connected")} onClick={() => requestCreate("createDirectory")}><Icon name="folderPlus" size={14}/></button>
      {kind === "sftp" && <button ref={uploadButtonRef} data-file-upload-trigger aria-label="上传到当前目录" aria-haspopup="menu" aria-expanded={Boolean(uploadMenu)} aria-busy={selectingUpload || undefined} title="上传到当前目录" disabled={status !== "connected" || loading || selectingUpload || transferActive} onClick={toggleUploadMenu}><Icon name="upload" size={14}/></button>}
      <button aria-label={showLocalRoots ? "刷新本机位置" : "刷新文件夹"} aria-busy={loading || undefined} title="刷新" disabled={loading} onClick={() => showLocalRoots ? void openLocalRoots() : void load(path)}><Icon name="refresh" size={14}/></button>
    </nav>
    {!connectionError && error && (listing || (showLocalRoots && localRoots.length > 0)) && <div className="file-browser-inline-error" role="alert">{error}</div>}
    <div className="file-browser-content" ref={listScroll} onPointerEnter={() => setEditingPath(false)} onScroll={(event) => { setEditingPath(false); updateVirtualRange(event.currentTarget, activeEntries.length); }}>
      <div className="file-browser-columns" aria-label="文件排序">
        <FileSortHeader label="名称" sortKey="name" sort={sort} onChange={cycleSort}/>
        <FileSortHeader label="大小" sortKey="size" sort={sort} onChange={cycleSort}/>
        <span className="file-browser-column-label file-permission-column">权限</span>
        <FileSortHeader label="修改时间" sortKey="modifiedAt" sort={sort} onChange={cycleSort}/>
      </div>
      {showLocalRoots && loading && <FileLoadingState label="正在读取本机位置…"/>}
      {showLocalRoots && !loading && error && localRoots.length === 0 && <div className="file-browser-state error"><Icon name="files" size={22}/><span>{error}</span><button onClick={() => void openLocalRoots()}>重试</button></div>}
      {showLocalRoots && !loading && !error && localRoots.length === 0 && <div className="file-browser-state">没有可用的本机位置</div>}
      {showLocalRoots && !loading && localRoots.length > 0 && <FileList entries={displayedRootEntries} range={virtualRange} ariaLabel="本机根目录" selectedPaths={selectedPaths} onSelect={(entry) => selectEntry(entry, false)} onOpen={(entry) => void navigateTo(entry.path, true)} onContextMenu={(event) => event.preventDefault()} onContextMenuKey={() => undefined}/>}
      {!showLocalRoots && loading && !listing && <FileLoadingState label="正在读取文件夹…"/>}
      {!showLocalRoots && !connectionError && error && !listing && <div className="file-browser-state error"><Icon name="files" size={22}/><span>{error}</span><button onClick={() => void load(path)}>重试</button></div>}
      {!showLocalRoots && !error && listing?.entries.length === 0 && <div className="file-browser-state">此文件夹为空</div>}
      {!showLocalRoots && listing && <FileList entries={displayedEntries} range={virtualRange} ariaLabel={`文件夹 ${listing.path}`} selectedPaths={selectedPaths} onSelect={selectEntry} onOpen={(entry) => entry.isDirectory ? void navigateTo(entry.path) : void openFile(entry, "preview")} onContextMenu={openContextMenu} onContextMenuKey={openContextMenuFromKeyboard}/>}
      {!showLocalRoots && dropActive && <div className="file-upload-drop-overlay" role="status"><Icon name="upload" size={24}/><strong>上传到当前目录</strong><span>{visiblePath}</span><small>释放鼠标以上传文件或文件夹</small></div>}
    </div>
    {uploadMenu && <div ref={uploadMenuRef} className="file-context-menu file-upload-menu" data-placement={uploadMenu.placement} role="menu" aria-label="选择上传内容" style={{ left: uploadMenu.x, top: uploadMenu.y }} onPointerDownCapture={() => { uploadMenuPointerActive.current = true; }} onBlur={handleUploadMenuBlur} onKeyDown={handleContextMenuKeyDown} onContextMenu={(event) => event.preventDefault()}>
      <button role="menuitem" onClick={() => void startSelectedUpload("files")}><Icon name="file" size={13}/><span>上传文件…</span></button>
      <button role="menuitem" onClick={() => void startSelectedUpload("folder")}><Icon name="files" size={13}/><span>上传文件夹…</span></button>
    </div>}
    {contextMenu && <div ref={menuRef} className="file-context-menu" data-placement={contextMenu.placement} role="menu" aria-label={contextEntries.length > 1 ? `${contextEntries.length} 个已选项目菜单` : `${contextMenu.entry.name} 文件菜单`} style={{ left: contextMenu.x, top: contextMenu.y }} onKeyDown={handleContextMenuKeyDown} onContextMenu={(event) => event.preventDefault()}>
      {contextEntries.length === 1 && contextMenu.entry.isDirectory && <button role="menuitem" onClick={() => { setContextMenu(null); void navigateTo(contextMenu.entry.path); }}><Icon name="files" size={13}/><span>打开</span></button>}
      {contextEntries.length === 1 && !contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && <button role="menuitem" onClick={() => { setContextMenu(null); void openFile(contextMenu.entry, "preview"); }}><Icon name="eye" size={13}/><span>预览</span></button>}
      {contextEntries.length === 1 && !contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && previewKindFor(contextMenu.entry.name) !== "image" && <button role="menuitem" className="file-context-edit" onClick={() => { setContextMenu(null); void openFile(contextMenu.entry, "edit"); }}><Icon name="edit" size={13}/><span>编辑</span><StatusBadge tone="warning" presentation="tag" size="compact">实验</StatusBadge></button>}
      {contextEntries.length === 1 && kind === "sftp" && !contextMenu.entry.isSymlink && <button role="menuitem" onClick={() => void startDownload(contextMenu.entry)}><Icon name="download" size={13}/><span>下载到本地…</span></button>}
      {contextEntries.length === 1 && <button role="menuitem" onClick={() => void copyPath(contextMenu.entry)}><Icon name="copy" size={13}/><span>复制路径</span></button>}
      {contextEntries.length === 1 && !contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && previewKindFor(contextMenu.entry.name) === "image" && <button role="menuitem" onClick={() => void copyImage(contextMenu.entry)}><Icon name="copy" size={13}/><span>复制图片</span></button>}
      {contextEntries.length === 1 && <div className="file-context-menu-separator" role="separator"/>}
      {contextEntries.length === 1 && !contextMenu.entry.isDirectory && !contextMenu.entry.isSymlink && <button role="menuitem" onClick={() => requestNameOperation("copy", contextMenu.entry)}><Icon name="copy" size={13}/><span>复制文件…</span></button>}
      {contextEntries.length === 1 && <button role="menuitem" onClick={() => requestNameOperation("rename", contextMenu.entry)}><Icon name="edit" size={13}/><span>改名…</span></button>}
      <button role="menuitem" className="danger" onClick={() => { setContextMenu(null); setDeleteOperation({ entries: contextEntries, error: "", busy: false }); }}><Icon name="trash" size={13}/><span>{contextEntries.length > 1 ? `删除 ${contextEntries.length} 个项目` : "删除"}</span></button>
    </div>}
    <footer className={`file-browser-statusbar${transfer ? ` ${transfer.status}` : ""}`} role="status" aria-label="文件状态">
      {transferActive && transfer ? <>
        <span className="file-browser-transfer-label">{transfer.message}</span>
        {transfer.total > 0 ? <progress className="file-browser-transfer-progress" aria-label={`${transfer.direction === "upload" ? "上传" : "下载"}进度`} value={transfer.transferred} max={transfer.total}/> : <progress className="file-browser-transfer-progress" aria-label={`${transfer.direction === "upload" ? "上传" : "下载"}进度`}/>}
        <small>{transfer.total > 0 ? `${formatSize(transfer.transferred)} / ${formatSize(transfer.total)}` : "准备中"}</small>
        {transfer.transferId && sessionId && <button onClick={() => void cancelTransfer(sessionId, transfer.transferId)}>取消</button>}
      </> : <>
        <span>{selectedPaths.size > 1 ? `${selectedPaths.size} 项已选择` : showLocalRoots ? loading ? "正在读取本机位置…" : `${localRoots.length} 个文件夹 · 0 个文件` : listing ? `${folderCount} 个文件夹 · ${fileCount} 个文件` : loading ? "正在读取目录…" : "暂无目录统计"}</span>
        {(transfer || operationMessage) && <span className="file-browser-transfer-result">{transfer?.message || operationMessage}</span>}
        {(transfer || operationMessage) && <button aria-label="关闭操作状态" onClick={() => { setTransfer(null); setOperationMessage(""); }}><Icon name="close" size={10}/></button>}
      </>}
    </footer>
    {nameOperation && <DialogFrame title={nameOperation.kind === "copy" ? "复制文件" : nameOperation.kind === "rename" ? "改名" : nameOperation.kind === "createFile" ? "创建文件" : "创建文件夹"} subtitle={nameOperation.entry?.name ?? path} compact onClose={nameOperation.busy ? () => undefined : () => setNameOperation(null)}>
      <form className="file-name-operation" onSubmit={(event) => void submitNameOperation(event)}>
        <label>{nameOperation.kind === "copy" ? "副本名称" : nameOperation.kind === "rename" ? "新名称" : nameOperation.kind === "createFile" ? "文件名称" : "文件夹名称"}<ExactTextInput data-dialog-autofocus aria-label={nameOperation.kind === "copy" ? "副本名称" : nameOperation.kind === "rename" ? "新名称" : nameOperation.kind === "createFile" ? "文件名称" : "文件夹名称"} value={nameOperation.value} onChange={(event) => setNameOperation({ ...nameOperation, value: event.target.value, error: "" })}/></label>
        {nameOperation.error && <p className="inline-message error" role="alert">{nameOperation.error}</p>}
        <footer className="dialog-actions end"><Button disabled={nameOperation.busy} onClick={() => setNameOperation(null)}>取消</Button><Button type="submit" variant="primary" loading={nameOperation.busy} disabled={!nameOperation.value.trim() || (nameOperation.kind === "rename" && nameOperation.value === nameOperation.entry?.name)}>{nameOperation.busy ? "处理中…" : nameOperation.kind === "copy" ? "创建副本" : nameOperation.kind === "rename" ? "保存名称" : nameOperation.kind === "createFile" ? "创建文件" : "创建文件夹"}</Button></footer>
      </form>
    </DialogFrame>}
    {deleteOperation && <DialogFrame title={deleteOperation.entries.length > 1 ? `删除 ${deleteOperation.entries.length} 个项目？` : `删除${deleteOperation.entries[0].isDirectory ? "文件夹" : deleteOperation.entries[0].isSymlink ? "链接" : "文件"}？`} subtitle={deleteOperation.entries.length > 1 ? deleteOperation.entries.map((entry) => entry.name).join("、") : deleteOperation.entries[0].name} compact onClose={deleteOperation.busy ? () => undefined : () => setDeleteOperation(null)}>
      <p className="confirm-copy">{deleteOperation.entries.length > 1 ? "这些项目将被永久删除，其中的文件夹及全部内容将被永久删除；链接指向的目标会保留。此操作无法撤销。" : deleteOperation.entries[0].isDirectory ? "文件夹及其中的全部内容将被永久删除，此操作无法撤销。" : deleteOperation.entries[0].isSymlink ? "只会删除此链接，不会删除链接指向的目标。此操作无法撤销。" : "文件将被永久删除，此操作无法撤销。"}</p>
      {deleteOperation.error && <p className="inline-message error" role="alert">{deleteOperation.error}</p>}
      <footer className="dialog-actions end"><Button disabled={deleteOperation.busy} onClick={() => setDeleteOperation(null)}>取消</Button><Button variant="dangerSolid" data-dialog-autofocus loading={deleteOperation.busy} onClick={() => void confirmDelete()}>{deleteOperation.busy ? "删除中…" : "确认删除"}</Button></footer>
    </DialogFrame>}
  </div>;
}
