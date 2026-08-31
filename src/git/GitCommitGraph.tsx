import type { Dispatch, RefObject, SetStateAction } from "react";

import { Icon } from "../components/Icon";
import type { GitCommit, GitSnapshot } from "../lib/tauri/git";
import type { GitGraphRow } from "./gitGraph";
import { formatRelativeCommitTime, type GitCommitFilesState } from "./gitPaneTypes";
import { GitSection } from "./GitPaneSections";

const gitGraphLaneGap = 11;
const gitGraphLaneOffset = 7;

interface GitCommitGraphProps {
  snapshot: GitSnapshot | null;
  graphRows: GitGraphRow[];
  collapsed: boolean;
  activeCommitOid: string | null;
  expandedCommitKey: string | null;
  commitFilesCache: Record<string, GitCommitFilesState>;
  inspectedCommitOid?: string;
  tooltipId: string;
  commitAnchorRefs: RefObject<Map<string, HTMLButtonElement>>;
  setHoveredCommitOid: Dispatch<SetStateAction<string | null>>;
  setFocusedCommitOid: Dispatch<SetStateAction<string | null>>;
  getCommitFilesKey: (oid: string) => string | null;
  onToggle: () => void;
  onToggleCommit: (commit: GitCommit) => void;
  onRetryCommit: (commit: GitCommit) => void;
}

export function GitCommitGraph({
  snapshot,
  graphRows,
  collapsed,
  activeCommitOid,
  expandedCommitKey,
  commitFilesCache,
  inspectedCommitOid,
  tooltipId,
  commitAnchorRefs,
  setHoveredCommitOid,
  setFocusedCommitOid,
  getCommitFilesKey,
  onToggle,
  onToggleCommit,
  onRetryCommit,
}: GitCommitGraphProps) {
  return <GitSection className="git-graph-section" title="图表" collapsed={collapsed} onToggle={onToggle}>
    <div className="git-graph-scroll" role="list" aria-label="提交图表">
      {snapshot?.commits.map((commit, index) => {
        const cacheKey = getCommitFilesKey(commit.oid);
        const expanded = cacheKey === expandedCommitKey;
        const fileState = cacheKey ? commitFilesCache[cacheKey] : undefined;
        const retainDetails = expanded || Boolean(fileState);
        const graphRow = graphRows[index];
        return <div className="git-commit-entry" role="listitem" key={commit.oid}>
          <button
            ref={(node) => {
              if (node) commitAnchorRefs.current.set(commit.oid, node);
              else commitAnchorRefs.current.delete(commit.oid);
            }}
            type="button"
            className="git-commit-row"
            aria-pressed={commit.oid === activeCommitOid}
            aria-expanded={expanded}
            aria-describedby={inspectedCommitOid === commit.oid ? tooltipId : undefined}
            onPointerEnter={() => setHoveredCommitOid(commit.oid)}
            onPointerLeave={() => setHoveredCommitOid((value) => value === commit.oid ? null : value)}
            onFocus={() => setFocusedCommitOid(commit.oid)}
            onBlur={() => setFocusedCommitOid((value) => value === commit.oid ? null : value)}
            onClick={() => onToggleCommit(commit)}
          >
            <GitGraph row={graphRow}/>
            <span className="git-commit-card">
              <span className="git-commit-content"><span className="git-commit-summary"><span className="git-commit-expander"><Icon name="chevronDown" size={9}/></span><span className="git-commit-subject">{commit.subject}</span>{commit.decorations.length > 0 && <span className="git-decorations">{commit.decorations.slice(0, 3).map((decoration) => <span data-kind={gitDecorationKind(decoration)} key={decoration}><Icon name={decoration.includes("origin/") ? "network" : "git"} size={9}/><span className="git-decoration-label">{formatGitDecoration(decoration)}</span></span>)}</span>}</span><span className="git-commit-meta"><span>{commit.author}</span><span>{formatRelativeCommitTime(commit.timestamp)}</span><span>{commit.oid.slice(0, 7)}</span></span></span>
            </span>
          </button>
          <div className={`git-commit-details-shell${expanded ? " expanded" : ""}`} aria-hidden={!expanded} inert={!expanded || undefined}>
            <div className="git-commit-details">
              <GitGraphContinuation row={graphRow}/>
              <div className="git-commit-file-panel">{retainDetails && <GitCommitFiles commit={commit} state={fileState} onRetry={() => onRetryCommit(commit)}/>}</div>
            </div>
          </div>
          {index < snapshot.commits.length - 1 && <GitGraphBridge row={graphRow}/>}
        </div>;
      })}
      {snapshot && snapshot.commits.length === 0 && <div className="git-clean-state">提交后将在这里显示分支图</div>}
    </div>
  </GitSection>;
}

export function GitCommitTooltip({ commit, fileCount, tooltipId, tooltipRef }: {
  commit: GitCommit;
  fileCount?: number;
  tooltipId: string;
  tooltipRef: RefObject<HTMLDivElement | null>;
}) {
  const body = commit.body.trim();
  const exactTime = commit.timestamp ? new Date(commit.timestamp * 1000) : null;
  const authorMark = Array.from(commit.author.trim())[0]?.toLocaleUpperCase() ?? "?";
  const references = commit.decorations.map(formatGitDecoration).filter(Boolean);
  const parentSummary = commit.parents.length === 0 ? "初始提交" : `${commit.parents.length} 个父提交`;
  return <div ref={tooltipRef} id={tooltipId} className="git-commit-tooltip" role="tooltip" data-placement="below" style={{ visibility: "hidden" }}>
    <div className="git-commit-tooltip-author">
      <span className="git-commit-tooltip-avatar" aria-hidden="true">{authorMark}</span>
      <span><strong>{commit.author}</strong>{exactTime && <time dateTime={exactTime.toISOString()}>{formatCommitDateTime(commit.timestamp)}</time>}</span>
    </div>
    <strong className="git-commit-tooltip-subject">{commit.subject}</strong>
    {body && <div className="git-commit-tooltip-body">{body}</div>}
    <div className="git-commit-tooltip-context">
      <span>{parentSummary}</span>
      {fileCount !== undefined && <span>{fileCount} 个文件</span>}
      {references.length > 0 && <span>{references.join(" · ")}</span>}
    </div>
    <div className="git-commit-tooltip-footer"><Icon name="git" size={10}/><code>{commit.oid.slice(0, 8)}</code></div>
  </div>;
}

function GitGraph({ row }: { row: GitGraphRow }) {
  const centerY = 18;
  const width = gitGraphRailWidth(row.laneCount);
  return <span className="git-graph-rail"><svg className="git-graph-lanes" aria-hidden="true" width={width} height="36" viewBox={`0 0 ${width} 36`}>
    {row.incoming && <path data-color={row.currentColor} d={`M ${gitGraphLaneX(row.currentLane)} 0 L ${gitGraphLaneX(row.currentLane)} ${centerY}`}/>}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.from}:${segment.to}:${index}`} data-kind={segment.kind} data-color={segment.colorIndex} d={segment.kind === "through"
      ? `M ${gitGraphLaneX(segment.from)} 0 L ${gitGraphLaneX(segment.to)} 36`
      : `M ${gitGraphLaneX(segment.from)} ${centerY} C ${gitGraphLaneX(segment.from)} 25, ${gitGraphLaneX(segment.to)} 29, ${gitGraphLaneX(segment.to)} 36`}/>) }
    <circle data-color={row.currentColor} cx={gitGraphLaneX(row.currentLane)} cy={centerY} r="4"/>
  </svg></span>;
}

function GitGraphContinuation({ row }: { row: GitGraphRow }) {
  const width = gitGraphRailWidth(row.laneCount);
  return <span className="git-graph-continuation" aria-hidden="true" style={{ width: width + 8 }}><svg width={width}>
    {row.continuingLanes.map((lane) => <line key={`${lane.lane}:${lane.colorIndex}`} data-color={lane.colorIndex} x1={gitGraphLaneX(lane.lane)} y1="0" x2={gitGraphLaneX(lane.lane)} y2="100%"/>)}
  </svg></span>;
}

function GitGraphBridge({ row }: { row: GitGraphRow }) {
  const width = gitGraphRailWidth(row.laneCount);
  return <span className="git-graph-bridge" aria-hidden="true"><svg width={width} height="100%">
    {row.continuingLanes.map((lane) => <line key={`${lane.lane}:${lane.colorIndex}`} data-color={lane.colorIndex} x1={gitGraphLaneX(lane.lane)} y1="0" x2={gitGraphLaneX(lane.lane)} y2="100%"/>)}
  </svg></span>;
}

function GitCommitFiles({ commit, state, onRetry }: { commit: GitCommit; state?: GitCommitFilesState; onRetry: () => void }) {
  if (!state || state.status === "loading") return <div className="git-commit-files-state" role="status"><span className="git-commit-files-spinner"/>正在读取提交文件…</div>;
  if (state.status === "error") return <div className="git-commit-files-state error" role="alert"><span>{state.message ?? "无法读取提交文件"}</span><button type="button" onClick={onRetry}>重试</button></div>;
  if (state.files.length === 0) return <div className="git-commit-files-state empty" role="status">该提交没有可显示的文件变更</div>;
  const visible = state.files.slice(0, 500);
  return <div className="git-commit-files" role="list" aria-label={`${commit.subject} 的文件`}>
    {visible.map((file) => {
      const path = splitGitFilePath(file.path);
      const status = commitFileStatus(file.status);
      return <div className="git-commit-file-row" role="listitem" key={`${file.status}:${file.originalPath ?? ""}:${file.path}`} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
        <Icon name="file" size={12}/>
        <span className="git-commit-file-path"><span>{path.name}</span>{path.directory && <span className="git-commit-file-directory">{path.directory}</span>}{file.originalPath && <span className="git-commit-file-original">来自 {file.originalPath}</span>}</span>
        <span className="git-commit-file-status" data-tone={status.tone} title={status.label}>{status.short}</span>
      </div>;
    })}
    {state.files.length > visible.length && <div className="git-list-limit">另有 {state.files.length - visible.length} 个文件未显示</div>}
  </div>;
}

function gitGraphRailWidth(laneCount: number): number {
  return laneCount * gitGraphLaneGap + 6;
}

function gitGraphLaneX(lane: number): number {
  return lane * gitGraphLaneGap + gitGraphLaneOffset;
}

function splitGitFilePath(path: string): { name: string; directory: string } {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator < 0 ? { name: path, directory: "" } : { name: path.slice(separator + 1), directory: path.slice(0, separator) };
}

function commitFileStatus(status: string): { short: string; label: string; tone: string } {
  const short = status.charAt(0).toUpperCase() || "?";
  if (short === "A") return { short, label: "新增", tone: "added" };
  if (short === "M") return { short, label: "修改", tone: "modified" };
  if (short === "D") return { short, label: "删除", tone: "deleted" };
  if (short === "R") return { short, label: "重命名", tone: "renamed" };
  if (short === "C") return { short, label: "复制", tone: "copied" };
  if (short === "T") return { short, label: "类型变更", tone: "modified" };
  if (short === "U") return { short, label: "冲突", tone: "conflict" };
  return { short, label: status || "未知状态", tone: "default" };
}

function formatCommitDateTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp * 1000));
}

function formatGitDecoration(decoration: string): string {
  return decoration.replace(/^HEAD -> /, "").replace(/^tag: /, "");
}

function gitDecorationKind(decoration: string): "head" | "remote" | "tag" | "branch" {
  if (decoration.startsWith("HEAD -> ")) return "head";
  if (decoration.startsWith("tag: ")) return "tag";
  if (decoration.includes("origin/")) return "remote";
  return "branch";
}
