import { useCallback, useEffect, useRef } from "react";

import type { GitSnapshot } from "../lib/tauri/git";
import type { GitRepositoryTreeNode } from "./gitRepositoryContext";

const MAX_CONCURRENT_SUBMODULE_SNAPSHOTS = 3;

function snapshotKey(node: GitRepositoryTreeNode): string {
  return `${node.path}\0${node.submodule?.recordedOid ?? ""}\0${node.submodule?.currentOid ?? ""}`;
}

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
  const enabledRef = useRef(enabled);
  const generationRef = useRef(0);
  const attemptedRef = useRef(new Set<string>());
  const queuedRef = useRef<GitRepositoryTreeNode[]>([]);
  const queuedKeysRef = useRef(new Set<string>());
  const eligibleKeysRef = useRef(new Set<string>());
  const activeRef = useRef(0);
  const pumpRef = useRef<() => void>(() => undefined);

  const pump = useCallback(() => {
    while (mountedRef.current && enabledRef.current && activeRef.current < MAX_CONCURRENT_SUBMODULE_SNAPSHOTS) {
      const node = queuedRef.current.shift();
      if (!node) return;
      const key = snapshotKey(node);
      queuedKeysRef.current.delete(key);
      if (!eligibleKeysRef.current.has(key) || attemptedRef.current.has(key)) continue;
      attemptedRef.current.add(key);
      activeRef.current += 1;
      const generation = generationRef.current;
      const root = rootRef.current;
      void loadSnapshot(node.path).then((snapshot) => {
        if (mountedRef.current && generationRef.current === generation && rootRef.current === root && snapshot.repositoryPath === node.path) {
          registerSnapshot(snapshot);
        }
      }, () => undefined).finally(() => {
        activeRef.current -= 1;
        pumpRef.current();
      });
    }
  }, [loadSnapshot, registerSnapshot]);

  useEffect(() => {
    const queuedKeys = queuedKeysRef.current;
    mountedRef.current = true;
    pumpRef.current();
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      queuedRef.current = [];
      queuedKeys.clear();
    };
  }, []);

  useEffect(() => {
    pumpRef.current = pump;
    pump();
  }, [pump]);

  useEffect(() => {
    rootRef.current = rootPath;
    enabledRef.current = enabled;
    generationRef.current += 1;
    attemptedRef.current.clear();
    queuedRef.current = [];
    queuedKeysRef.current.clear();
    if (enabled) pumpRef.current();
  }, [enabled, rootPath]);

  useEffect(() => {
    const eligible = !enabled || !rootPath ? [] : nodes.filter((node) => (
      node.parentPath === rootPath
      && !node.snapshot
      && node.selectable
      && Boolean(node.submodule?.initialized)
    ));
    eligibleKeysRef.current = new Set(eligible.map(snapshotKey));
    for (const node of eligible) {
      const key = snapshotKey(node);
      if (!attemptedRef.current.has(key) && !queuedKeysRef.current.has(key)) {
        queuedRef.current.push(node);
        queuedKeysRef.current.add(key);
      }
    }
    pumpRef.current();
  }, [enabled, nodes, rootPath]);
}
