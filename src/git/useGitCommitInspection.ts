import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";

import { gitError, type GitCommit, type GitCommitFile, type GitSnapshot } from "../lib/tauri/git";
import { calculateGitCommitTooltipPosition } from "./gitCommitTooltipPosition";
import type { GitCommitFilesState } from "./gitPaneTypes";

interface GitCommitInspectionOptions {
  visible: boolean;
  snapshot: GitSnapshot | null;
  root: string | null;
  remote: boolean;
  remoteProfileId: string | null;
  loadCommitFiles: (repository: string, oid: string) => Promise<GitCommitFile[]>;
}

export function useGitCommitInspection({ visible, snapshot, root, remote, remoteProfileId, loadCommitFiles }: GitCommitInspectionOptions) {
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
  const [hoveredCommitOid, setHoveredCommitOid] = useState<string | null>(null);
  const [focusedCommitOid, setFocusedCommitOid] = useState<string | null>(null);
  const [expandedCommitKey, setExpandedCommitKey] = useState<string | null>(null);
  const [commitFilesCache, setCommitFilesCache] = useState<Record<string, GitCommitFilesState>>({});
  const commitAnchorRefs = useRef(new Map<string, HTMLButtonElement>());
  const commitTooltipRef = useRef<HTMLDivElement>(null);
  const commitTooltipId = useId();

  const commitFilesKey = useCallback((oid: string): string | null => {
    if (!root) return null;
    return JSON.stringify([remote ? "remote" : "local", remoteProfileId ?? "", root, oid]);
  }, [remote, remoteProfileId, root]);

  const activeCommitOid = selectedCommitOid && snapshot?.commits.some((commit) => commit.oid === selectedCommitOid)
    ? selectedCommitOid
    : snapshot?.head.oid ?? null;
  const inspectedCommitOid = focusedCommitOid ?? hoveredCommitOid;
  const inspectedCommit = visible && inspectedCommitOid
    ? snapshot?.commits.find((commit) => commit.oid === inspectedCommitOid) ?? null
    : null;
  const inspectedCommitCacheKey = inspectedCommit ? commitFilesKey(inspectedCommit.oid) : null;
  const inspectedCommitFileState = inspectedCommitCacheKey ? commitFilesCache[inspectedCommitCacheKey] : undefined;
  const inspectedCommitFileCount = inspectedCommitFileState?.status === "ready" ? inspectedCommitFileState.files.length : undefined;

  useLayoutEffect(() => {
    if (!inspectedCommit) return;
    const updatePosition = () => {
      const anchor = commitAnchorRefs.current.get(inspectedCommit.oid);
      const tooltip = commitTooltipRef.current;
      if (!anchor || !tooltip) return;
      const next = calculateGitCommitTooltipPosition(
        anchor.getBoundingClientRect(),
        tooltip.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
      );
      tooltip.style.top = `${next.top}px`;
      tooltip.style.left = `${next.left}px`;
      tooltip.style.visibility = "visible";
      tooltip.dataset.placement = next.placement;
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [inspectedCommit, inspectedCommitFileCount]);

  const requestCommitFiles = useCallback(async (commitToLoad: GitCommit, force = false) => {
    const repository = root;
    const key = commitFilesKey(commitToLoad.oid);
    if (!repository || !key || (!force && ["loading", "ready"].includes(commitFilesCache[key]?.status))) return;
    setCommitFilesCache((value) => ({ ...value, [key]: { status: "loading", files: value[key]?.files ?? [] } }));
    try {
      const files = await loadCommitFiles(repository, commitToLoad.oid);
      setCommitFilesCache((value) => ({ ...value, [key]: { status: "ready", files } }));
    } catch (cause) {
      setCommitFilesCache((value) => ({ ...value, [key]: { status: "error", files: [], message: gitError(cause).message } }));
    }
  }, [commitFilesCache, commitFilesKey, loadCommitFiles, root]);

  const toggleCommitFiles = useCallback((commitToToggle: GitCommit) => {
    const key = commitFilesKey(commitToToggle.oid);
    if (!key) return;
    setSelectedCommitOid(commitToToggle.oid);
    if (expandedCommitKey === key) {
      setExpandedCommitKey(null);
      return;
    }
    setExpandedCommitKey(key);
    void requestCommitFiles(commitToToggle);
  }, [commitFilesKey, expandedCommitKey, requestCommitFiles]);

  return {
    activeCommitOid,
    commitAnchorRefs,
    commitFilesCache,
    commitFilesKey,
    commitTooltipId,
    commitTooltipRef,
    expandedCommitKey,
    inspectedCommit,
    inspectedCommitFileCount,
    requestCommitFiles,
    setFocusedCommitOid,
    setHoveredCommitOid,
    toggleCommitFiles,
  };
}
