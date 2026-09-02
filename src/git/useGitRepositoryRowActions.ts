import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import type { GitRepositoryTreeNode } from "./gitRepositoryContext";
import type { GitRepositoryOverlayKind } from "./gitPaneTypes";

export type GitRepositoryRowActionKind = "branches" | "repositoryActions" | "fetch";

export function useGitRepositoryRowActions({
  rootPath,
  activePath,
  snapshotPath,
  busy,
  backgroundRefreshing,
  selectRepository,
  fetchActiveRepository,
  openOverlayRef,
}: {
  rootPath: string | null;
  activePath: string | null;
  snapshotPath: string | null;
  busy: boolean;
  backgroundRefreshing: boolean;
  selectRepository: (path: string) => boolean;
  fetchActiveRepository: () => Promise<void>;
  openOverlayRef: MutableRefObject<(kind: GitRepositoryOverlayKind, repositoryTarget?: string | null) => void>;
}) {
  const branchButtons = useRef(new Map<string, HTMLButtonElement>());
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<{ path: string; kind: GitRepositoryRowActionKind } | null>(null);

  useEffect(() => {
    pending.current = null;
    branchButtons.current.clear();
    actionButtons.current.clear();
  }, [rootPath]);

  useEffect(() => {
    const action = pending.current;
    if (!action) return;
    if (action.path !== activePath) {
      pending.current = null;
      return;
    }
    if (snapshotPath !== activePath || busy || backgroundRefreshing) return;
    pending.current = null;
    if (action.kind === "fetch") {
      void fetchActiveRepository();
    } else {
      const overlayKind = action.kind;
      window.requestAnimationFrame(() => openOverlayRef.current(overlayKind, action.path));
    }
  }, [activePath, backgroundRefreshing, busy, fetchActiveRepository, openOverlayRef, snapshotPath]);

  const registerBranchButton = useCallback((path: string, element: HTMLButtonElement | null) => {
    if (element) branchButtons.current.set(path, element);
    else branchButtons.current.delete(path);
  }, []);

  const registerActionsButton = useCallback((path: string, element: HTMLButtonElement | null) => {
    if (element) actionButtons.current.set(path, element);
    else actionButtons.current.delete(path);
  }, []);

  const anchorFor = useCallback((kind: GitRepositoryOverlayKind | undefined, path: string | null) => {
    if (!kind || !path) return null;
    return kind === "branches" || kind === "createBranch"
      ? branchButtons.current.get(path) ?? null
      : actionButtons.current.get(path) ?? null;
  }, []);

  const run = useCallback((node: GitRepositoryTreeNode, kind: GitRepositoryRowActionKind) => {
    if (node.path !== activePath) {
      pending.current = { path: node.path, kind };
      if (!selectRepository(node.path)) pending.current = null;
      return;
    }
    if (kind === "fetch") void fetchActiveRepository();
    else openOverlayRef.current(kind, node.path);
  }, [activePath, fetchActiveRepository, openOverlayRef, selectRepository]);

  return { anchorFor, registerBranchButton, registerActionsButton, run };
}
