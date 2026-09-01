import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";

import { Button, StatusBadge } from "../components/Button";
import { DialogActionStatus, DialogFrame } from "../components/dialogs/DialogFrame";
import { Icon } from "../components/Icon";
import { previewKindFor } from "../files/fileBrowserModel";
import { gitError, type GitChange, type GitConflictDetail, type GitConflictResolution, type GitConflictVersion, type GitSnapshot } from "../lib/tauri/git";
import { findGitConflictBlocks, gitConflictEditorExtension, goToGitConflict } from "./editor/gitConflictEditorExtension";

const CodeEditor = lazy(() => import("../files/CodeEditor").then((module) => ({ default: module.CodeEditor })));
const GitConflictInputComparison = lazy(() => import("./editor/GitConflictInputComparison").then((module) => ({ default: module.GitConflictInputComparison })));
const resultConflictExtension = gitConflictEditorExtension();
const CONFLICT_DIALOG_EXIT_MS = 130;

export function GitConflictResolver({
  conflicts,
  initialPath,
  repositoryName,
  mergeHeadOid,
  onLoad,
  onResolve,
  onClose,
}: {
  conflicts: GitChange[];
  initialPath: string;
  repositoryName: string;
  mergeHeadOid?: string | null;
  onLoad: (path: string) => Promise<GitConflictDetail>;
  onResolve: (path: string, resolution: GitConflictResolution) => Promise<GitSnapshot>;
  onClose: () => void;
}) {
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [detail, setDetail] = useState<GitConflictDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [baseVisible, setBaseVisible] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [closeRequested, setCloseRequested] = useState(false);
  const loadSequence = useRef(0);
  const onLoadRef = useRef(onLoad);
  const resultViewRef = useRef<EditorView | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const focusNextResult = useRef(false);
  const closeTimer = useRef<number | null>(null);

  const closeDialog = useCallback(() => {
    if (closing || closeTimer.current !== null) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      onClose();
    }, CONFLICT_DIALOG_EXIT_MS);
  }, [closing, onClose]);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const dirty = Boolean(detail?.editable && draft !== (detail.result.content ?? ""));
  const selected = conflicts.find((change) => change.path === selectedPath) ?? conflicts[0] ?? null;
  const activePath = selected?.path ?? selectedPath;

  useEffect(() => {
    if (!activePath) return;
    const request = ++loadSequence.current;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setBaseVisible(false);
      setMessage("");
      setDetail(null);
      try {
        const next = await onLoadRef.current(activePath);
        if (cancelled || request !== loadSequence.current) return;
        setDetail(next);
        setDraft(next.result.content ?? "");
      } catch (reason) {
        if (cancelled || request !== loadSequence.current) return;
        setMessage(gitError(reason).message);
      } finally {
        if (!cancelled && request === loadSequence.current) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [activePath]);

  const language = useMemo(() => {
    const kind = previewKindFor(activePath);
    return kind === "image" ? "text" : kind;
  }, [activePath]);
  const conflictBlocks = useMemo(() => findGitConflictBlocks(draft), [draft]);

  function closeSidebar() {
    setSidebarExpanded(false);
    sidebarToggleRef.current?.focus();
  }

  function requestSelect(path: string) {
    if (busy || closing) return;
    if (path === activePath) {
      closeSidebar();
      return;
    }
    if (dirty) {
      setPendingPath(path);
      return;
    }
    setSelectedPath(path);
    closeSidebar();
  }

  function requestClose() {
    if (busy || closing) return;
    if (dirty) {
      setCloseRequested(true);
      return;
    }
    closeDialog();
  }

  function discardDraft() {
    const nextPath = pendingPath;
    setPendingPath(null);
    setCloseRequested(false);
    if (nextPath) {
      setSelectedPath(nextPath);
      closeSidebar();
    }
    else closeDialog();
  }

  async function resolve(resolution: GitConflictResolution) {
    if (!detail || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await onResolve(detail.path, resolution);
      const remaining = next.changes.filter((change) => change.conflict);
      if (remaining.length === 0) {
        closeDialog();
        return;
      }
      focusNextResult.current = true;
      setDetail(null);
      setDraft("");
      setSelectedPath(nextRemainingConflictPath(detail.path, conflicts, remaining));
    } catch (reason) {
      setMessage(gitError(reason).message);
    } finally {
      setBusy(false);
    }
  }

  const canUseCurrent = sideCanBeApplied(detail?.current);
  const canUseIncoming = sideCanBeApplied(detail?.incoming);
  const canDelete = detail ? detail.current.kind === "missing" || detail.incoming.kind === "missing" : false;
  const canMarkResolved = detail ? detail.result.kind !== "missing" : false;

  return <>
    <DialogFrame
      title="解决合并冲突"
      subtitle={`${repositoryName} · ${conflicts.length} 个待解决${mergeHeadOid ? ` · ${mergeHeadOid.slice(0, 8)}` : ""}`}
      wide
      className={`git-conflict-dialog${closing ? " git-conflict-dialog--closing" : ""}`}
      scrimClassName={`git-conflict-scrim${closing ? " git-conflict-scrim--closing" : ""}`}
      dismissible={!busy}
      onClose={requestClose}
      headerActions={<StatusBadge tone={conflicts.length > 0 ? "warning" : "success"} size="compact">{conflicts.length} 个冲突</StatusBadge>}
    >
      <div className="git-conflict-manager">
        <aside className="git-conflict-sidebar" aria-label="冲突文件" data-expanded={sidebarExpanded ? "true" : undefined}>
          <div className="git-conflict-sidebar-title">
            <button
              ref={sidebarToggleRef}
              type="button"
              className="git-conflict-sidebar-toggle"
              aria-label={sidebarExpanded ? "收起冲突文件列表" : "展开冲突文件列表"}
              aria-expanded={sidebarExpanded}
              aria-controls="git-conflict-file-popover"
              title={sidebarExpanded ? "收起冲突文件列表" : "展开冲突文件列表"}
              onClick={() => setSidebarExpanded((expanded) => !expanded)}
            ><Icon name="files" size={13}/></button>
          </div>
          <div id="git-conflict-file-popover" className="git-conflict-file-popover" data-open={sidebarExpanded ? "true" : undefined} aria-hidden={!sidebarExpanded}>
            <div className="git-conflict-sidebar-heading"><span>冲突文件</span><span>{conflicts.length}</span></div>
            <div className="git-conflict-list" role="listbox" aria-label="冲突文件列表">
              {conflicts.map((change) => <button
                key={change.path}
                type="button"
                role="option"
                aria-selected={change.path === activePath}
                className="git-conflict-item"
                onClick={() => requestSelect(change.path)}
              >
                <Icon name="mergeConflict" size={13}/><span title={change.path}>{change.path}</span><small>{conflictKindLabel(change.conflictKind)}</small>
              </button>)}
            </div>
            <p className="git-conflict-sidebar-note">完成当前文件后会自动进入下一个；不会自动继续合并。</p>
          </div>
        </aside>
        <section className="git-conflict-editor" aria-label={activePath}>
          <header className="git-conflict-editor-header">
            <div><strong title={activePath}>{activePath}</strong><span>{detail ? conflictKindLabel(detail.kind) : "正在读取冲突"}</span></div>
            {detail?.unsupportedReason && <StatusBadge tone="warning" presentation="tag" size="compact">需要外部处理</StatusBadge>}
            <button type="button" className="git-conflict-base-toggle" aria-label={baseVisible ? "隐藏 Base" : "显示 Base"} aria-expanded={baseVisible} aria-controls="git-conflict-base-panel" disabled={!detail || loading} onClick={() => setBaseVisible((visible) => !visible)}><Icon name="splitVertical" size={11}/>{baseVisible ? "隐藏 Base" : "显示 Base"}<span>{versionState(detail?.base)}</span></button>
          </header>
          <div className="git-conflict-input-stage" data-base-visible={baseVisible || undefined}>
            {baseVisible && <section id="git-conflict-base-panel" className="git-conflict-base-panel" aria-label="Base 版本">
              <header><strong>Base</strong><span>共同基线 · {versionState(detail?.base)}</span></header>
              <div>{detail?.base.kind === "text" ? <Suspense fallback={<div className="git-conflict-state">正在加载 Base…</div>}><CodeEditor key={`${activePath}:base`} value={detail.base.content ?? ""} language={language} ariaLabel="Base 版本" readOnly onChange={() => undefined} onSave={() => undefined}/></Suspense> : detail?.base ? <VersionEmpty version={detail.base}/> : null}</div>
            </section>}
            <div className="git-conflict-inputs">
              <div className="git-conflict-input-header" role="group" aria-label="传入版本操作">
                <div><strong>传入</strong><span>{versionState(detail?.incoming)}</span></div>
                <Button size="compact" disabled={busy || !canUseIncoming} onClick={() => void resolve({ type: "useIncoming" })}>采用传入</Button>
              </div>
              <div className="git-conflict-input-header" role="group" aria-label="当前版本操作">
                <div><strong>当前</strong><span>{versionState(detail?.current)}</span></div>
                <Button size="compact" disabled={busy || !canUseCurrent} onClick={() => void resolve({ type: "useCurrent" })}>采用当前</Button>
              </div>
              <div className="git-conflict-comparison-stage">
                {loading && <div className="git-conflict-state"><Icon name="refresh" size={18}/>正在读取冲突版本…</div>}
                {!loading && detail && <Suspense fallback={<div className="git-conflict-state">正在加载差异视图…</div>}><GitConflictInputComparison key={`${activePath}:${detail.result.revision}`} current={detail.current} incoming={detail.incoming} language={language}/></Suspense>}
              </div>
            </div>
          </div>
          <div className="git-conflict-result-header">
            <div><strong>合并结果</strong><span>{detail?.editable ? conflictBlocks.length > 0 ? `${conflictBlocks.length} 处未解决标记` : "未检测到冲突标记" : "使用文件级动作或外部工具处理"}</span></div>
            {detail?.editable && <div className="git-conflict-result-nav" aria-label="冲突标记导航"><button type="button" className="git-conflict-nav-button" aria-label="上一处冲突" title="上一处冲突 · Shift+F7" disabled={conflictBlocks.length === 0} onClick={() => resultViewRef.current && goToGitConflict(resultViewRef.current, -1)}><Icon name="back" size={11}/></button><button type="button" className="git-conflict-nav-button" aria-label="下一处冲突" title="下一处冲突 · F7" disabled={conflictBlocks.length === 0} onClick={() => resultViewRef.current && goToGitConflict(resultViewRef.current, 1)}><Icon name="forward" size={11}/></button></div>}
          </div>
          <div className="git-conflict-result">
            {!loading && detail?.editable && <Suspense fallback={<div className="git-conflict-state">正在加载编辑器…</div>}><CodeEditor key={`${activePath}:result:${detail.result.revision}`} value={draft} language={language} ariaLabel="冲突结果编辑器" extensions={resultConflictExtension} onViewReady={(view) => {
              resultViewRef.current = view;
              if (view && focusNextResult.current) {
                focusNextResult.current = false;
                view.focus();
              }
            }} onChange={setDraft} onSave={() => void resolve({ type: "saveText", content: draft, expectedRevision: detail.result.revision })}/></Suspense>}
            {!loading && detail && !detail.editable && <div className="git-conflict-state"><Icon name="help" size={18}/><strong>{detail.unsupportedReason ?? "此结果不能作为文本编辑"}</strong><span>可以采用存在的一侧、选择删除，或在终端处理后暂存外部结果。</span></div>}
          </div>
          <footer className="git-conflict-actions">
            <DialogActionStatus message={message}/>
            <div className="git-conflict-action-buttons">
              {canDelete && <Button size="compact" variant="danger" disabled={busy} onClick={() => void resolve({ type: "delete" })}>删除结果</Button>}
              {canMarkResolved && <Button size="compact" disabled={busy} onClick={() => void resolve({ type: "markResolved" })}>暂存当前结果</Button>}
              <Button size="compact" variant="primary" loading={busy} disabled={!detail?.editable || !dirty} onClick={() => detail && void resolve({ type: "saveText", content: draft, expectedRevision: detail.result.revision })}>{busy ? "正在保存…" : "保存并标记已解决"}</Button>
            </div>
          </footer>
        </section>
      </div>
    </DialogFrame>
    {(pendingPath || closeRequested) && <DialogFrame title="放弃未保存的结果？" subtitle={activePath} compact onClose={() => { setPendingPath(null); setCloseRequested(false); }}>
      <p className="confirm-copy">编辑器中的未保存内容会丢失；已写入工作树的结果不会被撤销。</p>
      <footer className="dialog-actions end"><Button onClick={() => { setPendingPath(null); setCloseRequested(false); }}>继续编辑</Button><Button variant="dangerSolid" onClick={discardDraft}>放弃未保存内容</Button></footer>
    </DialogFrame>}
  </>;
}

function nextRemainingConflictPath(currentPath: string, ordered: readonly GitChange[], remaining: readonly GitChange[]): string {
  const remainingPaths = new Set(remaining.map((change) => change.path));
  const currentIndex = ordered.findIndex((change) => change.path === currentPath);
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const candidate = ordered[(Math.max(currentIndex, -1) + offset) % ordered.length];
    if (candidate && remainingPaths.has(candidate.path)) return candidate.path;
  }
  return remaining[0].path;
}

function sideCanBeApplied(version?: GitConflictVersion): boolean {
  return Boolean(version && (version.kind === "text" || version.kind === "binary") && (version.mode === 0o100644 || version.mode === 0o100755));
}

function versionState(version?: GitConflictVersion): string {
  if (!version) return "";
  if (version.kind === "missing") return "不存在";
  if (version.kind === "binary") return "二进制";
  if (version.kind === "unsupported") return "不支持";
  return `${version.size} B`;
}

function VersionEmpty({ version }: { version: GitConflictVersion }) {
  const title = version.kind === "missing" ? "该版本不存在" : version.kind === "binary" ? "二进制版本" : "版本无法在应用内显示";
  return <div className="git-conflict-state"><Icon name="help" size={18}/><strong>{title}</strong><span>{version.size > 0 ? `${version.size} 字节` : "请使用文件级动作或外部工具处理"}</span></div>;
}

function conflictKindLabel(kind?: GitChange["conflictKind"] | GitConflictDetail["kind"]): string {
  if (kind === "bothModified") return "双方修改";
  if (kind === "bothAdded") return "双方新增";
  if (kind === "currentDeleted") return "当前删除";
  if (kind === "incomingDeleted") return "传入删除";
  if (kind === "bothDeleted") return "双方删除";
  return "其他冲突";
}
