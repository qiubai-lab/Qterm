import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";
import { listRemoteGitDirectory, type GitDirectoryEntry, type GitDirectoryListing } from "../lib/tauri/git";
import { parentPath } from "../files/path";

const pickerRowHeight = 30;
const pickerVirtualThreshold = 160;
const pickerOverscan = 7;
const pickerFallbackRows = 18;

interface PickerRange {
  start: number;
  end: number;
}

type LoadMode = "initial" | "navigate" | "history" | "refresh";

export function GitRepositoryPickerDialog({
  sessionId,
  profileId,
  initialPath,
  onClose,
  onSelect,
}: {
  sessionId: string;
  profileId: string;
  initialPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const [path, setPath] = useState(initialPath);
  const [pathDraft, setPathDraft] = useState(initialPath);
  const [listing, setListing] = useState<GitDirectoryListing | null>(null);
  const [backPaths, setBackPaths] = useState<string[]>([]);
  const [forwardPaths, setForwardPaths] = useState<string[]>([]);
  const [range, setRange] = useState<PickerRange>({ start: 0, end: pickerFallbackRows + pickerOverscan });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const listScroll = useRef<HTMLDivElement>(null);

  const entries = listing?.entries ?? [];
  const virtualized = entries.length > pickerVirtualThreshold;
  const visibleStart = virtualized ? Math.min(range.start, entries.length) : 0;
  const visibleEnd = virtualized ? Math.min(Math.max(range.end, visibleStart), entries.length) : entries.length;
  const visibleEntries = entries.slice(visibleStart, visibleEnd);
  const parent = parentPath(path, false);
  const selectablePath = validRemotePath(pathDraft) ? pathDraft.trim() : "";

  const updateRange = useCallback((container: HTMLElement, count: number) => {
    const next = pickerRange(container.scrollTop, container.clientHeight, count);
    setRange((current) => current.start === next.start && current.end === next.end ? current : next);
  }, []);

  const load = useCallback(async (nextPath: string, mode: LoadMode): Promise<boolean> => {
    const trimmedPath = nextPath.trim();
    if (!validRemotePath(trimmedPath)) {
      setError("请输入有效的远程目录路径");
      return false;
    }
    const currentRequest = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await listRemoteGitDirectory(sessionId, profileId, trimmedPath);
      if (request.current !== currentRequest) return false;
      setListing(next);
      setPath(next.path);
      setPathDraft(next.path);
      setRange({ start: 0, end: pickerFallbackRows + pickerOverscan });
      requestAnimationFrame(() => {
        if (listScroll.current) listScroll.current.scrollTop = 0;
      });
      if (mode === "initial") {
        setBackPaths([]);
        setForwardPaths([]);
      }
      return true;
    } catch (reason) {
      if (request.current === currentRequest) setError(directoryErrorMessage(reason));
      return false;
    } finally {
      if (request.current === currentRequest) setLoading(false);
    }
  }, [profileId, sessionId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load(initialPath, "initial"));
    return () => {
      cancelAnimationFrame(frame);
      request.current += 1;
    };
  }, [initialPath, load]);

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
    const previous = path;
    if (!await load(nextPath, "navigate")) return;
    if (previous !== nextPath) setBackPaths((current) => [...current, previous]);
    setForwardPaths([]);
  }

  async function navigateBack() {
    const next = backPaths[backPaths.length - 1];
    if (!next || !await load(next, "history")) return;
    setBackPaths((current) => current.slice(0, -1));
    setForwardPaths((current) => [...current, path]);
  }

  async function navigateForward() {
    const next = forwardPaths[forwardPaths.length - 1];
    if (!next || !await load(next, "history")) return;
    setForwardPaths((current) => current.slice(0, -1));
    setBackPaths((current) => [...current, path]);
  }

  function submitPath(event: FormEvent) {
    event.preventDefault();
    void navigate(pathDraft);
  }

  return <DialogFrame
    title="选择远程仓库目录"
    subtitle="浏览服务器目录，或直接输入远程路径"
    className="git-repository-picker-dialog"
    onClose={onClose}
  >
    <div className="git-repository-picker">
      <form className="git-repository-picker-toolbar" onSubmit={submitPath}>
        <button type="button" aria-label="后退" title="后退" disabled={backPaths.length === 0} onClick={() => void navigateBack()}><Icon name="back" size={13}/></button>
        <button type="button" aria-label="前进" title="前进" disabled={forwardPaths.length === 0} onClick={() => void navigateForward()}><Icon name="forward" size={13}/></button>
        <button type="button" aria-label="返回上级目录" title="返回上级目录" disabled={!parent} onClick={() => parent && void navigate(parent)}><Icon name="back" size={13}/></button>
        <label className="git-repository-picker-path">
          <span className="sr-only">远程仓库路径</span>
          <input data-dialog-autofocus aria-label="远程仓库路径" value={pathDraft} maxLength={4096} onChange={(event) => setPathDraft(event.target.value)} />
        </label>
        <button type="submit" aria-label="转到输入路径" title="转到输入路径" disabled={!validRemotePath(pathDraft)}><Icon name="forward" size={13}/></button>
        <button type="button" aria-label="刷新目录" title="刷新目录" onClick={() => void load(path, "refresh")}><Icon name="refresh" size={13}/></button>
      </form>

      <div
        ref={listScroll}
        className="git-repository-picker-list-scroll"
        data-loading={loading || undefined}
        onScroll={(event) => updateRange(event.currentTarget, entries.length)}
      >
        {listing && <div
          className={`git-repository-picker-list${virtualized ? " virtualized" : ""}`}
          role="list"
          aria-label={`远程目录 ${listing.path}`}
          aria-setsize={entries.length}
          style={virtualized ? { height: entries.length * pickerRowHeight } : undefined}
        >
          {visibleEntries.map((entry, visibleIndex) => {
            const index = visibleStart + visibleIndex;
            return <DirectoryRow key={entry.path} entry={entry} index={index} count={entries.length} virtualized={virtualized} onOpen={() => void navigate(entry.path)}/>;
          })}
        </div>}
        {!listing && !loading && <div className="git-repository-picker-empty"><Icon name="files" size={22}/><strong>无法显示目录</strong><span>仍可在上方直接输入远程路径</span></div>}
        {listing && !loading && entries.length === 0 && <div className="git-repository-picker-empty"><Icon name="files" size={22}/><strong>此目录没有子目录</strong><span>可以选择当前目录，或直接输入其他路径</span></div>}
        {loading && <div className="git-repository-picker-loading" role="status" aria-live="polite"><span className="git-repository-picker-spinner"/><span>正在读取远程目录…</span></div>}
      </div>

      <div className={`git-repository-picker-feedback${error ? " error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
        {error ? <><span title={error}>{error}</span><small>仍可直接输入远程路径并选择</small></> : <span>目录浏览不会读取、上传、删除或修改远程文件</span>}
      </div>

      <footer className="git-repository-picker-footer">
        <div><span>选择路径</span><code title={selectablePath || pathDraft}>{selectablePath || "请输入有效路径"}</code></div>
        <div><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!selectablePath} onClick={() => selectablePath && onSelect(selectablePath)}>选择此路径</Button></div>
      </footer>
    </div>
  </DialogFrame>;
}

function DirectoryRow({ entry, index, count, virtualized, onOpen }: {
  entry: GitDirectoryEntry;
  index: number;
  count: number;
  virtualized: boolean;
  onOpen: () => void;
}) {
  return <div
    role="listitem"
    aria-posinset={index + 1}
    aria-setsize={count}
    className="git-repository-picker-row-shell"
    style={virtualized ? { transform: `translateY(${index * pickerRowHeight}px)` } : undefined}
  >
    <button type="button" aria-label={`打开目录 ${entry.name}`} title={entry.path} onClick={onOpen}>
      <Icon name="files" size={14}/><span>{entry.name}</span>{entry.isSymlink && <small>链接</small>}<Icon name="forward" size={11}/>
    </button>
  </div>;
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

function validRemotePath(path: string): boolean {
  const trimmed = path.trim();
  return trimmed.length > 0 && trimmed.length <= 4096 && !trimmed.includes("\0");
}

function directoryErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : "无法浏览远程目录";
}
