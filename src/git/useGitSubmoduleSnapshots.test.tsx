import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GitSnapshot, GitSubmodule } from "../lib/tauri/git";
import type { GitRepositoryTreeNode } from "./gitRepositoryContext";
import { useGitSubmoduleSnapshots } from "./useGitSubmoduleSnapshots";

const submodule: GitSubmodule = { name: "child", path: "modules/child", recordedOid: "1".repeat(40), currentOid: "1".repeat(40), initialized: true, commitChanged: false, trackedModified: false, untrackedContent: false, conflict: false, issue: null };

function child(root: string): GitRepositoryTreeNode {
  return { id: `${root}/modules/child`, path: `${root}/modules/child`, parentPath: root, depth: 1, name: "child", relativePath: "modules/child", snapshot: null, submodule, selectable: true, expanded: false, hasChildren: false, state: "干净" };
}

function snapshot(path: string): GitSnapshot {
  return { repositoryPath: path, repositoryName: "child", head: { name: "main", oid: "1", detached: false, unborn: false, upstream: null, ahead: 0, behind: 0 }, changes: [], submodules: [], branches: [], remotes: [], commits: [], mergeInProgress: false };
}

describe("useGitSubmoduleSnapshots", () => {
  it("preloads direct initialized children once", async () => {
    const loadSnapshot = vi.fn(async (path: string) => snapshot(path));
    const registerSnapshot = vi.fn();
    const { rerender } = renderHook(({ nodes }) => useGitSubmoduleSnapshots({ rootPath: "/repo", nodes, enabled: true, loadSnapshot, registerSnapshot }), { initialProps: { nodes: [child("/repo")] } });
    await waitFor(() => expect(registerSnapshot).toHaveBeenCalledWith(snapshot("/repo/modules/child")));
    rerender({ nodes: [child("/repo")] });
    expect(loadSnapshot).toHaveBeenCalledOnce();
  });

  it("ignores a snapshot that finishes after the root changes", async () => {
    let resolveOld!: (value: GitSnapshot) => void;
    const loadSnapshot = vi.fn((path: string) => path.startsWith("/old") ? new Promise<GitSnapshot>((resolve) => { resolveOld = resolve; }) : Promise.resolve(snapshot(path)));
    const registerSnapshot = vi.fn();
    const { rerender } = renderHook(({ root, nodes }) => useGitSubmoduleSnapshots({ rootPath: root, nodes, enabled: true, loadSnapshot, registerSnapshot }), { initialProps: { root: "/old", nodes: [child("/old")] } });
    rerender({ root: "/new", nodes: [child("/new")] });
    await waitFor(() => expect(registerSnapshot).toHaveBeenCalledWith(snapshot("/new/modules/child")));
    resolveOld(snapshot("/old/modules/child"));
    await Promise.resolve();
    expect(registerSnapshot).not.toHaveBeenCalledWith(snapshot("/old/modules/child"));
  });

  it("keeps the fallback row stable when preload fails", async () => {
    const loadSnapshot = vi.fn().mockRejectedValue(new Error("unavailable"));
    const registerSnapshot = vi.fn();
    const { rerender } = renderHook(({ nodes }) => useGitSubmoduleSnapshots({ rootPath: "/repo", nodes, enabled: true, loadSnapshot, registerSnapshot }), { initialProps: { nodes: [child("/repo")] } });
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledOnce());
    rerender({ nodes: [child("/repo")] });
    expect(loadSnapshot).toHaveBeenCalledOnce();
    expect(registerSnapshot).not.toHaveBeenCalled();
  });
});
