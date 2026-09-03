import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { useDialogCloseTransition } from "../components/dialogs/useDialogCloseTransition";
import { ExactTextInput } from "../components/ExactTextInput";
import { Icon } from "../components/Icon";
import { listRemoteGitDirectory, type GitDirectoryEntry, type GitDirectoryListing } from "../lib/tauri/git";
import { listLocalDirectory, listLocalRoots } from "../lib/tauri/files";
import { fileErrorMessage, formatPermissions } from "../files/fileBrowserModel";
import { displayLocalPath, parentPath } from "../files/path";

const pickerRowHeight = 30;
const pickerVirtualThreshold = 160;
const pickerOverscan = 7;
const pickerFallbackRows = 18;

interface PickerRange {
  start: number;
  end: number;
}

type LoadMode = "initial" | "navigate" | "history" | "refresh";

type GitRepositoryPickerDialogProps = {
  initialPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
} & ({
  mode: "local";
  onSelectSystemDirectory: () => Promise<string | null>;
} | {
  mode?: "remote";
  sessionId: string;
  profileId: string;
});

export function GitRepositoryPickerDialog(props: GitRepositoryPickerDialogProps) {
  const { initialPath, onClose, onSelect } = props;
  const local = props.mode === "local";
  const remoteSessionId = local ? null : props.sessionId;
  const remoteProfileId = local ? null : props.profileId;
  const [path, setPath] = useState(initialPath);
  const [pathDraft, setPathDraft] = useState(local ? displayLocalPath(initialPath) : initialPath);
  const [listing, setListing] = useState<GitDirectoryListing | null>(null);
  const [showLocalRoots, setShowLocalRoots] = useState(false);
  const [forwardPaths, setForwardPaths] = useState<string[]>([]);
  const [editingPath, setEditingPath] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [range, setRange] = useState<PickerRange>({ start: 0, end: pickerFallbackRows + pickerOverscan });
  const [loading, setLoading] = useState(false);
  const [selectingSystem, setSelectingSystem] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const listScroll = useRef<HTMLDivElement>(null);
  const { closing, closeWithTransition } = useDialogCloseTransition();

  const entries = listing?.entries ?? [];
  const virtualized = entries.length > pickerVirtualThreshold;
  const visibleStart = virtualized ? Math.min(range.start, entries.length) : 0;
  const visibleEnd = virtualized ? Math.min(Math.max(range.end, visibleStart), entries.length) : entries.length;
  const visibleEntries = entries.slice(visibleStart, visibleEnd);
  const parent = showLocalRoots ? null : parentPath(path, local);
  const forwardPath = forwardPaths[forwardPaths.length - 1] ?? null;
  const currentPathDraft = local ? displayLocalPath(path) : path;
  const selectablePath = selectedPath ?? (local
    ? listing && !showLocalRoots && pathDraft.trim() === currentPathDraft ? path : ""
    : validPath(pathDraft) ? pathDraft.trim() : "");
  const displayPath = showLocalRoots ? "此电脑" : local ? displayLocalPath(path) : path;
  const canNavigateUp = !showLocalRoots && Boolean(parent || (local && path !== "/"));

  const updateRange = useCallback((container: HTMLElement, count: number) => {
    const next = pickerRange(container.scrollTop, container.clientHeight, count);
    setRange((current) => current.start === next.start && current.end === next.end ? current : next);
  }, []);

  const load = useCallback(async (nextPath: string, mode: LoadMode): Promise<boolean> => {
    const trimmedPath = nextPath.trim();
    if (!validPath(trimmedPath)) {
      setError(local ? "请输入有效的本机目录路径" : "请输入有效的远程目录路径");
      return false;
    }
    const currentRequest = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = local
        ? localDirectoryListing(await listLocalDirectory(trimmedPath))
        : await listRemoteGitDirectory(remoteSessionId!, remoteProfileId!, trimmedPath);
      if (request.current !== currentRequest) return false;
      setListing(next);
      setPath(next.path);
      setPathDraft(local ? displayLocalPath(next.path) : next.path);
      setShowLocalRoots(false);
      setEditingPath(false);
      if (mode !== "refresh") setSelectedPath(null);
      setRange({ start: 0, end: pickerFallbackRows + pickerOverscan });
      requestAnimationFrame(() => {
        if (listScroll.current) listScroll.current.scrollTop = 0;
      });
      if (mode === "initial") {
        setForwardPaths([]);
      }
      return true;
    } catch (reason) {
      if (request.current === currentRequest) setError(directoryErrorMessage(reason, local));
      return false;
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [local, remoteProfileId, remoteSessionId]);

  const openLocalRoots = useCallback(async (mode: LoadMode): Promise<boolean> => {
    if (!local) return false;
    const currentRequest = ++request.current;
    setLoading(true);
    setError("");
    try {
      const roots = await listLocalRoots();
      if (request.current !== currentRequest) return false;
      setListing({
        path: "",
        entries: roots.map((root) => ({ name: root.name, path: root.path, isSymlink: false, modifiedAt: null, permissionMode: null })),
      });
      setShowLocalRoots(true);
      setEditingPath(false);
      if (mode !== "refresh") setSelectedPath(null);
      setRange({ start: 0, end: pickerFallbackRows + pickerOverscan });
      requestAnimationFrame(() => {
        if (listScroll.current) listScroll.current.scrollTop = 0;
      });
      return true;
    } catch (reason) {
      if (request.current === currentRequest) setError(directoryErrorMessage(reason, true));
      return false;
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [local]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load(initialPath, "initial"));
    return () => {
      cancelAnimationFrame(frame);
      request.current += 1;
    };
  }, [initialPath, load]);

  const closeDialog = useCallback(() => closeWithTransition(onClose), [closeWithTransition, onClose]);
  const selectPath = useCallback((nextPath: string) => closeWithTransition(() => onSelect(nextPath)), [closeWithTransition, onSelect]);

  useLayoutEffect(() => {
    const container = listScroll.current;
    if (!container) return;
    const update = () => updateRange(container, entries.length);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [entries.length, updateRange]);

  async function navigate(nextPath: string) {
    if (!await load(nextPath, "navigate")) return;
    setForwardPaths([]);
  }

  async function navigateUp() {
    const previous = path;
    const loaded = parent ? await load(parent, "history") : await openLocalRoots("history");
    if (!loaded) return;
    setForwardPaths((current) => [...current, previous]);
  }

  async function navigateForward() {
    if (!forwardPath || !await load(forwardPath, "history")) return;
    setForwardPaths((current) => current[current.length - 1] === forwardPath ? current.slice(0, -1) : current);
  }

  function submitPath(event: FormEvent) {
    event.preventDefault();
    void navigate(pathDraft);
  }

  async function selectWithSystemDialog() {
    if (!local || props.mode !== "local") return;
    setSelectingSystem(true);
    try {
      const selected = await props.onSelectSystemDirectory();
      if (selected) selectPath(selected);
    } catch (reason) {
      setError(directoryErrorMessage(reason, true));
    } finally {
      setSelectingSystem(false);
    }
  }

  return createPortal(<DialogFrame
    title={local ? "选择本机仓库目录" : "选择远程仓库目录"}
    subtitle={local ? "浏览本机目录，或使用系统目录选择器" : "浏览服务器目录，或直接输入远程路径"}
    className="git-repository-picker-dialog"
    closing={closing}
    dismissible={!selectingSystem}
    onClose={closeDialog}
  >
    <div className="git-repository-picker">
      <nav className="git-repository-picker-toolbar" aria-label={`${local ? "本机" : "远程"}目录导航`}>
        <button type="button" aria-label="返回上级目录" title="返回上级目录" disabled={!canNavigateUp || loading} onClick={() => void navigateUp()}><Icon name="back" size={14}/></button>
        <button type="button" aria-label="前进到下一目录" title={forwardPath ? `前进到 ${forwardPath}` : "没有可前进的目录"} disabled={!forwardPath || loading} onClick={() => void navigateForward()}><Icon name="forward" size={14}/></button>
        <div className="git-repository-picker-path-shell" data-editing={editingPath || undefined}>
          {editingPath ? <form className="git-repository-picker-path" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setEditingPath(false); }} onSubmit={submitPath}>
            <span className="sr-only">{local ? "本机仓库路径" : "远程仓库路径"}</span>
            <ExactTextInput
              data-dialog-autofocus
              autoFocus
              aria-label={local ? "本机仓库路径" : "远程仓库路径"}
              value={pathDraft}
              maxLength={4096}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setPathDraft(currentPathDraft);
                setEditingPath(false);
              }}
            />
          </form> : <button
            data-dialog-autofocus
            className="git-repository-picker-path-display"
            type="button"
            title={`${displayPath} · 单击编辑`}
            onClick={() => {
              setSelectedPath(null);
              setPathDraft(currentPathDraft);
              setEditingPath(true);
            }}
          >{displayPath}</button>}
        </div>
        <button type="button" aria-label="刷新目录" aria-busy={loading || undefined} title="刷新目录" disabled={loading} onClick={() => void (showLocalRoots ? openLocalRoots("refresh") : load(path, "refresh"))}><Icon name="refresh" size={14}/></button>
      </nav>

      <div className="git-repository-picker-directory-stage">
        <div className="git-repository-picker-columns" aria-label="目录信息列">
          <span>名称</span><span>{local ? "类型" : "权限"}</span><span>修改时间</span>
        </div>
        <div
          ref={listScroll}
          className="git-repository-picker-list-scroll"
          data-loading={loading || undefined}
          aria-busy={loading || undefined}
          onPointerEnter={() => setEditingPath(false)}
          onScroll={(event) => updateRange(event.currentTarget, entries.length)}
        >
          {listing && <div
            className={`git-repository-picker-list${virtualized ? " virtualized" : ""}`}
            role="list"
            aria-label={showLocalRoots ? "本机根目录" : `${local ? "本机" : "远程"}目录 ${local ? displayLocalPath(listing.path) : listing.path}`}
            aria-setsize={entries.length}
            style={virtualized ? { height: entries.length * pickerRowHeight } : undefined}
          >
            {visibleEntries.map((entry, visibleIndex) => {
              const index = visibleStart + visibleIndex;
              return <DirectoryRow
                key={entry.path}
                entry={entry}
                index={index}
                count={entries.length}
                virtualized={virtualized}
                selected={selectedPath === entry.path}
                disabled={loading}
                local={local}
                onSelect={() => {
                  setEditingPath(false);
                  setSelectedPath(entry.path);
                }}
                onOpen={() => void navigate(entry.path)}
              />;
            })}
          </div>}
          {!listing && !loading && <div className="git-repository-picker-empty"><Icon name="files" size={22}/><strong>无法显示目录</strong><span>{local ? "可以输入其他已有路径，或使用系统选择器" : "仍可在上方直接输入远程路径"}</span></div>}
          {listing && !loading && entries.length === 0 && <div className="git-repository-picker-empty"><Icon name="files" size={22}/><strong>此目录没有子目录</strong><span>{local ? "可以选择当前目录，或输入其他已有路径" : "可以选择当前目录，或直接输入其他路径"}</span></div>}
          {loading && <div className="git-repository-picker-loading" role="status" aria-live="polite"><span className="git-repository-picker-spinner"/><span>正在读取{local ? "本机" : "远程"}目录…</span></div>}
        </div>
      </div>

      <div className={`git-repository-picker-feedback${error ? " error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
        {error ? <><span title={error}>{error}</span><small>{local ? "可以输入其他已有路径，或使用系统选择器" : "仍可直接输入远程路径并选择"}</small></> : <span>{local ? "仅浏览本机目录；系统位置和新建文件夹可使用系统选择器" : "目录浏览不会读取、上传、删除或修改远程文件"}</span>}
      </div>

      <footer className="git-repository-picker-footer" data-local={local || undefined}>
        <div><span>选择路径</span><code title={selectablePath || pathDraft}>{selectablePath || "请输入有效路径"}</code></div>
        <div>{local && <Button loading={selectingSystem} disabled={loading || closing} onClick={() => void selectWithSystemDialog()}>{selectingSystem ? "正在选择…" : "使用系统选择器"}</Button>}<Button variant="danger" disabled={selectingSystem || closing} onClick={closeDialog}>取消</Button><Button variant="primary" disabled={!selectablePath || selectingSystem || closing} onClick={() => selectablePath && selectPath(selectablePath)}>选择此路径</Button></div>
      </footer>
    </div>
  </DialogFrame>, document.body);
}

function DirectoryRow({ entry, index, count, virtualized, selected, disabled, local, onSelect, onOpen }: {
  entry: GitDirectoryEntry;
  index: number;
  count: number;
  virtualized: boolean;
  selected: boolean;
  disabled: boolean;
  local: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return <div
    className="git-repository-picker-row-shell"
    style={virtualized ? { transform: `translateY(${index * pickerRowHeight}px)` } : undefined}
  >
    <button
      type="button"
      role="listitem"
      aria-label={`目录 ${entry.name}，${local ? "类型 文件夹" : `权限 ${formatPermissions(entry.permissionMode)}`}，修改时间 ${formatModifiedAt(entry.modifiedAt)}`}
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={count}
      data-selected={selected || undefined}
      title={`${entry.path} · 双击打开`}
      disabled={disabled}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
        }
        if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="git-repository-picker-name"><Icon name="files" size={14}/><span>{entry.name}</span>{entry.isSymlink && <small>链接</small>}</span>
      <span className={local ? "git-repository-picker-type" : "git-repository-picker-permission"}>{local ? "文件夹" : formatPermissions(entry.permissionMode)}</span>
      <span className="git-repository-picker-time">{formatModifiedAt(entry.modifiedAt)}</span>
    </button>
  </div>;
}

function formatModifiedAt(value: number | null): string {
  return value === null ? "—" : new Date(value * 1000).toLocaleString();
}

function pickerRange(scrollTop: number, clientHeight: number, count: number): PickerRange {
  if (count <= pickerVirtualThreshold) return { start: 0, end: count };
  const visibleStart = Math.min(count - 1, Math.max(0, Math.floor(scrollTop / pickerRowHeight)));
  const viewportRows = clientHeight > 0 ? Math.ceil(clientHeight / pickerRowHeight) : pickerFallbackRows;
  return {
    start: Math.max(0, visibleStart - pickerOverscan),
    end: Math.min(count, visibleStart + viewportRows + pickerOverscan + 1),
  };
}

function validPath(path: string): boolean {
  const trimmed = path.trim();
  return trimmed.length > 0 && trimmed.length <= 4096 && !trimmed.includes("\0");
}

function directoryErrorMessage(error: unknown, local: boolean): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  if (error instanceof Error) return error.message;
  return local ? fileErrorMessage(error) : "无法浏览远程目录";
}

function localDirectoryListing(listing: Awaited<ReturnType<typeof listLocalDirectory>>): GitDirectoryListing {
  return {
    path: listing.path,
    entries: listing.entries.filter((entry) => entry.isDirectory).map((entry) => ({
      name: entry.name,
      path: entry.path,
      isSymlink: entry.isSymlink,
      modifiedAt: entry.modifiedAt,
      permissionMode: entry.permissionMode,
    })),
  };
}
