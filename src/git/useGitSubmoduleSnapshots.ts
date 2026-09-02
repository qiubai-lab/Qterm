import { useEffect, useRef } from "react";

import type { GitSnapshot } from "../lib/tauri/git";
import type { GitRepositoryTreeNode } from "./gitRepositoryContext";

export function useGitSubmoduleSnapshots({
  rootPath, nodes, enabled, loadSnapshot, registerSnapshot,
}: {
  rootPath: string | null;
  nodes: GitRepositoryTreeNode[];
  enabled: boolean;
  loadSnapshot: (path: string) => Promise<GitSnapshot>;
  registerSnapshot: (snapshot: GitSnapshot) => void;
}) {
  const mountedRef = useRef(false);
  const rootRef = useRef(rootPath);
  const attemptedRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    rootRef.current = rootPath;
    attemptedRef.current.clear();
  }, [rootPath]);

  useEffect(() => {
    if (!enabled || !rootPath) return;
    const pending = nodes.filter((node) => {
      if (node.parentPath !== rootPath || node.snapshot || !node.selectable || !node.submodule?.initialized) return false;
      const key = `${node.path}\0${node.submodule.recordedOid}\0${node.submodule.currentOid ?? ""}`;
      if (attemptedRef.current.has(key)) return false;
      attemptedRef.current.add(key);
      return true;
    });
    for (const node of pending) {
      void loadSnapshot(node.path).then((snapshot) => {
        if (mountedRef.current && rootRef.current === rootPath && snapshot.repositoryPath === node.path) registerSnapshot(snapshot);
      }, () => undefined);
    }
  }, [enabled, loadSnapshot, nodes, registerSnapshot, rootPath]);
}
