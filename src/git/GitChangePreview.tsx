import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "../components/Button";
import { DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";
import { previewKindFor } from "../files/fileBrowserModel";
import {
  gitError,
  type GitChange,
  type GitChangeDiff,
  type GitCommit,
  type GitCommitFile,
  type GitCommitFileDiff,
  type GitConflictVersion,
  type GitDiffSource,
} from "../lib/tauri/git";
import { presentGitFileStatus } from "./gitStatus";

const GitChangeComparison = lazy(() => import("./editor/GitChangeComparison").then((module) => ({ default: module.GitChangeComparison })));

interface WorkingTreePreviewProps {
  changes: GitChange[];
  initialChange: GitChange;
  repositoryName: string;
  onLoad: (path: string, staged: boolean) => Promise<GitChangeDiff>;
  onClose: () => void;
}

interface CommitPreviewProps {
  commit: GitCommit;
  files: GitCommitFile[];
  initialFile: GitCommitFile;
  repositoryName: string;
  onLoadCommit: (path: string) => Promise<GitCommitFileDiff>;
  onClose: () => void;
}

type GitChangePreviewProps = WorkingTreePreviewProps | CommitPreviewProps;

interface PreviewEntry {
  key: string;
  path: string;
  originalPath: string | null;
  status: string;
  context: string;
  staged?: boolean;
}

interface PreviewDetail {
  path: string;
  before: GitConflictVersion;
  after: GitConflictVersion;
  beforeLabel: string;
  afterLabel: string;
}

export function GitChangePreview(props: GitChangePreviewProps) {
  const commitMode = isCommitPreview(props);
  const sourceEntries = commitMode ? props.files : props.changes;
  const commitOid = commitMode ? props.commit.oid : null;
  const entries = useMemo<PreviewEntry[]>(() => commitMode
    ? (sourceEntries as GitCommitFile[]).map((file) => ({
      key: commitFileKey(file),
      path: file.path,
      originalPath: file.originalPath,
      status: file.status,
      context: `提交 ${commitOid?.slice(0, 7)}`,
    }))
    : (sourceEntries as GitChange[]).filter((change) => !change.conflict).map((change) => ({
      key: changeKey(change),
      path: change.path,
      originalPath: change.originalPath,
      status: change.status,
      context: change.staged ? "已暂存" : "工作区",
      staged: change.staged,
    })), [commitMode, commitOid, sourceEntries]);
  const initialEntry = commitMode
    ? entries.find((entry) => entry.key === commitFileKey(props.initialFile))
    : entries.find((entry) => entry.key === changeKey(props.initialChange));
  const [selectedKey, setSelectedKey] = useState(initialEntry?.key ?? entries[0]?.key ?? "");
  const selectedIndex = Math.max(0, entries.findIndex((entry) => entry.key === selectedKey));
  const selected = entries[selectedIndex] ?? initialEntry ?? entries[0];
  const selectedStatus = selected ? presentGitFileStatus(selected.status, { context: commitMode ? "commit" : "change" }) : null;
  const [detail, setDetail] = useState<PreviewDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(selected));
  const [message, setMessage] = useState("");
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadSequence = useRef(0);
  const loaderRef = useRef<(entry: PreviewEntry) => Promise<PreviewDetail>>(() => Promise.reject(new Error("预览尚未初始化")));
  const loadWorking = commitMode ? null : props.onLoad;
  const loadCommit = commitMode ? props.onLoadCommit : null;

  useEffect(() => {
    loaderRef.current = commitMode
      ? async (entry) => normalizeCommitDiff(await loadCommit!(entry.path))
      : async (entry) => normalizeChangeDiff(await loadWorking!(entry.path, Boolean(entry.staged)));
  }, [commitMode, loadCommit, loadWorking]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const request = ++loadSequence.current;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setMessage("");
      setDetail(null);
      try {
        const next = await loaderRef.current(selected);
        if (!cancelled && request === loadSequence.current) setDetail(next);
      } catch (reason) {
        if (!cancelled && request === loadSequence.current) setMessage(gitError(reason).message);
      } finally {
        if (!cancelled && request === loadSequence.current) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [reloadNonce, selected]);

  function select(entry: PreviewEntry) {
    setSelectedKey(entry.key);
    setFilesExpanded(false);
  }

  function move(offset: number) {
    if (entries.length < 2) return;
    const next = (selectedIndex + offset + entries.length) % entries.length;
    setSelectedKey(entries[next].key);
  }

  const badge = commitMode ? `提交 ${props.commit.oid.slice(0, 7)}` : selected?.context ?? "工作区";
  return <DialogFrame
    title="预览 Git 更改"
    subtitle={commitMode ? `${props.repositoryName} · ${props.commit.subject}` : props.repositoryName}
    onClose={props.onClose}
    wide
    className="git-change-preview-dialog"
    scrimClassName="git-change-preview-scrim"
    headerActions={<StatusBadge tone={commitMode || selected?.staged ? "success" : "neutral"} size="compact">{badge}</StatusBadge>}
  >
    <div className="git-change-preview-workbench">
      <header className="git-change-preview-toolbar">
        <button type="button" className="git-change-preview-files-toggle" aria-label={filesExpanded ? "收起更改文件" : "展开更改文件"} aria-expanded={filesExpanded} onClick={() => setFilesExpanded((value) => !value)}><Icon name="files" size={14}/></button>
        <div className="git-change-preview-path"><strong>{selected?.path ?? "没有可预览的文件"}</strong>{selected?.originalPath && <span>{selected.originalPath} → {selected.path}</span>}</div>
        {selectedStatus && <span className="git-change-preview-status" aria-label={`Git 状态：${selectedStatus.label}`}>{selectedStatus.label}</span>}
        <div className="git-change-preview-navigation"><button type="button" aria-label="上一个更改" disabled={entries.length < 2} onClick={() => move(-1)}><Icon name="back" size={12}/></button><span className="git-change-preview-counter" aria-label={`第 ${entries.length ? selectedIndex + 1 : 0} 个更改，共 ${entries.length} 个`}><strong className="git-change-preview-counter-current">{entries.length ? selectedIndex + 1 : 0}</strong><span className="git-change-preview-counter-separator" aria-hidden="true">/</span><span className="git-change-preview-counter-total">{entries.length}</span></span><button type="button" aria-label="下一个更改" disabled={entries.length < 2} onClick={() => move(1)}><Icon name="forward" size={12}/></button></div>
      </header>
      <div className="git-change-preview-stage">
        <aside className="git-change-preview-file-popover" data-open={filesExpanded || undefined} aria-hidden={!filesExpanded} inert={!filesExpanded || undefined}>
          <div className="git-change-preview-file-title">更改文件 <span>{entries.length}</span></div>
          <div className="git-change-preview-file-list">{entries.map((entry) => {
            const status = presentGitFileStatus(entry.status, { context: commitMode ? "commit" : "change" });
            return <button type="button" key={entry.key} aria-current={entry.key === selected?.key} aria-label={`${entry.path} ${entry.context} ${status.label}`} onClick={() => select(entry)}><Icon name="file" size={13}/><span>{entry.path}</span><small>{entry.context}</small><b>{status.label}</b></button>;
          })}</div>
        </aside>
        <main className="git-change-preview-main">
          {loading && <div className="git-change-preview-state" role="status">正在读取差异…</div>}
          {!loading && message && <div className="git-change-preview-state error" role="alert"><strong>无法读取更改</strong><span>{message}</span><button type="button" onClick={() => setReloadNonce((value) => value + 1)}>重试</button></div>}
          {!loading && !message && detail && <DiffContent detail={detail}/>} 
          {!loading && !message && !detail && <div className="git-change-preview-state empty" role="status"><strong>没有可显示的差异</strong><span>文件可能已变化，请刷新仓库状态后重试。</span></div>}
        </main>
      </div>
    </div>
  </DialogFrame>;
}

function DiffContent({ detail }: { detail: PreviewDetail }) {
  const language = useMemo(() => {
    const kind = previewKindFor(detail.path);
    return kind === "image" ? "text" : kind;
  }, [detail.path]);
  const comparable = comparableText(detail.before) && comparableText(detail.after);
  return <div className="git-change-preview-diff">
    <div className="git-change-preview-source-headings"><span>{detail.beforeLabel}</span><span>{detail.afterLabel}</span></div>
    {comparable
      ? <Suspense fallback={<div className="git-change-preview-state">正在加载差异编辑器…</div>}><GitChangeComparison before={detail.before.content ?? ""} after={detail.after.content ?? ""} beforeLabel={detail.beforeLabel} afterLabel={detail.afterLabel} language={language}/></Suspense>
      : <div className="git-change-preview-fallback"><VersionCard label={detail.beforeLabel} version={detail.before}/><VersionCard label={detail.afterLabel} version={detail.after}/></div>}
  </div>;
}

function VersionCard({ label, version }: { label: string; version: GitConflictVersion }) {
  return <section><strong>{label}</strong><span>{versionLabel(version)}</span><small>{version.size} B{version.mode ? ` · ${version.mode.toString(8)}` : ""}</small></section>;
}

function normalizeChangeDiff(detail: GitChangeDiff): PreviewDetail {
  if (!detail) throw new Error("Git 未返回更改差异");
  return { path: detail.path, before: detail.before, after: detail.after, beforeLabel: sourceLabel(detail.beforeSource), afterLabel: sourceLabel(detail.afterSource) };
}

function normalizeCommitDiff(detail: GitCommitFileDiff): PreviewDetail {
  if (!detail) throw new Error("Git 未返回提交文件差异");
  return {
    path: detail.path,
    before: detail.before,
    after: detail.after,
    beforeLabel: detail.parentOid ? `父提交 ${detail.parentOid.slice(0, 7)}` : "空树",
    afterLabel: `提交 ${detail.commitOid.slice(0, 7)}`,
  };
}

function comparableText(version: GitConflictVersion) {
  return version.kind === "text" || version.kind === "missing";
}

function versionLabel(version: GitConflictVersion) {
  if (version.kind === "missing") return "该版本不存在";
  if (version.kind === "binary") return "二进制内容，不提供文本差异";
  if (version.kind === "unsupported") return "内容过大或文件类型不受支持";
  return "文本内容";
}

function sourceLabel(source: GitDiffSource) {
  return source === "head" ? "HEAD" : source === "index" ? "暂存区" : "工作区";
}

function changeKey(change: Pick<GitChange, "path" | "staged">) {
  return `${change.staged ? "staged" : "unstaged"}:${change.path}`;
}

function commitFileKey(file: Pick<GitCommitFile, "path" | "status" | "originalPath">) {
  return `${file.status}:${file.originalPath ?? ""}:${file.path}`;
}

function isCommitPreview(props: GitChangePreviewProps): props is CommitPreviewProps {
  return "commit" in props;
}
