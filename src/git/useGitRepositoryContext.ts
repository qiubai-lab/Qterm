import { useCallback, useMemo, useState } from "react";

import type { GitSnapshot } from "../lib/tauri/git";
import { buildGitRepositoryTree, gitRepositoryParentPath, type GitRepositoryTreeNode } from "./gitRepositoryContext";
import { gitSnapshotsPresentSameState } from "./gitSnapshot";

interface RepositoryContextState {
  rootPath: string | null;
  activePath: string | null;
  snapshots: Map<string, GitSnapshot>;
  expandedPaths: Set<string>;
}

function createRepositoryContextState(rootPath: string | null): RepositoryContextState {
  return { rootPath, activePath: rootPath, snapshots: new Map(), expandedPaths: new Set(rootPath ? [rootPath] : []) };
}

export interface GitRepositoryContextController {
  rootPath: string | null;
  activePath: string | null;
  activeSnapshot: GitSnapshot | null;
  nodes: GitRepositoryTreeNode[];
  registerSnapshot: (snapshot: GitSnapshot) => void;
  selectRepository: (path: string) => boolean;
  toggleExpanded: (path: string) => void;
  parentPathFor: (path: string) => string | null;
  snapshotFor: (path: string) => GitSnapshot | null;
}

export function useGitRepositoryContext(rootPath: string | null): GitRepositoryContextController {
  const [state, setState] = useState<RepositoryContextState>(() => createRepositoryContextState(rootPath));

  const current = state.rootPath === rootPath
    ? state
    : createRepositoryContextState(rootPath);

  const nodes = useMemo(
    () => rootPath ? buildGitRepositoryTree(rootPath, current.snapshots, current.expandedPaths) : [],
    [current.expandedPaths, current.snapshots, rootPath],
  );

  const registerSnapshot = useCallback((snapshot: GitSnapshot) => {
    if (!snapshot) return;
    setState((value) => {
      const base = value.rootPath === rootPath ? value : createRepositoryContextState(rootPath);
      const currentSnapshot = base.snapshots.get(snapshot.repositoryPath);
      if (currentSnapshot && gitSnapshotsPresentSameState(currentSnapshot, snapshot)) return value;
      const snapshots = new Map(base.snapshots);
      snapshots.set(snapshot.repositoryPath, snapshot);
      return { ...base, snapshots };
    });
  }, [rootPath]);

  const selectRepository = useCallback((path: string) => {
    const node = nodes.find((candidate) => candidate.path === path);
    if (!node?.selectable) return false;
    setState((value) => ({ ...(value.rootPath === rootPath ? value : createRepositoryContextState(rootPath)), activePath: path }));
    return true;
  }, [nodes, rootPath]);

  const toggleExpanded = useCallback((path: string) => {
    setState((value) => {
      const base = value.rootPath === rootPath ? value : createRepositoryContextState(rootPath);
      const expandedPaths = new Set(base.expandedPaths);
      if (expandedPaths.has(path) && path !== rootPath) expandedPaths.delete(path); else expandedPaths.add(path);
      return { ...base, expandedPaths };
    });
  }, [rootPath]);

  return {
    rootPath,
    activePath: current.activePath,
    activeSnapshot: current.activePath ? current.snapshots.get(current.activePath) ?? null : null,
    nodes,
    registerSnapshot,
    selectRepository,
    toggleExpanded,
    parentPathFor: useCallback((path: string) => gitRepositoryParentPath(nodes, path), [nodes]),
    snapshotFor: useCallback((path: string) => current.snapshots.get(path) ?? null, [current.snapshots]),
  };
}
