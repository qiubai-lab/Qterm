import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GitRepositoryTreeNode } from "./gitRepositoryContext";
import { GitRepositoryTree } from "./GitRepositoryTree";

function node(path: string, depth: number, overrides: Partial<GitRepositoryTreeNode> = {}): GitRepositoryTreeNode {
  const segments = path.split("/");
  return {
    id: path,
    path,
    parentPath: depth === 0 ? null : "D:/repo",
    depth,
    name: segments[segments.length - 1] ?? path,
    relativePath: depth === 0 ? path : path.slice("D:/repo/".length),
    snapshot: null,
    submodule: null,
    selectable: true,
    expanded: true,
    hasChildren: depth === 0,
    state: depth === 0 ? "父仓库" : "干净",
    ...overrides,
  };
}

describe("GitRepositoryTree", () => {
  const actionProps = {
    updatingPath: null,
    remoteReady: true,
    repositoryOverlay: null,
    onFetch: vi.fn(),
    onShowChanges: vi.fn(),
    onOpenOverlay: vi.fn(),
    onRegisterBranchButton: vi.fn(),
    onRegisterActionsButton: vi.fn(),
  };

  it("selects repositories with pointer and keyboard without treating lifecycle actions as selection", () => {
    const nodes = [node("D:/repo", 0), node("D:/repo/modules/child", 1)];
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(<GitRepositoryTree {...actionProps} nodes={nodes} activePath="D:/repo" disabled={false} onSelect={onSelect} onToggle={onToggle} onInitialize={vi.fn()}/>);

    const root = screen.getByRole("button", { name: "当前存储库 repo，父仓库" });
    expect(screen.queryByRole("button", { name: "折叠 repo" })).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /child/u }).querySelector('[data-icon="submodule"]')).toBeInTheDocument();
    fireEvent.keyDown(root.closest('[role="tree"]')!, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "切换到 child，干净" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tree"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(nodes[1]);
    fireEvent.keyDown(screen.getByRole("tree"), { key: "ArrowLeft" });
    expect(root).toHaveFocus();
  });

  it("moves one shared selection indicator between compact repository rows", () => {
    const nodes = [node("D:/repo", 0), node("D:/repo/modules/child", 1)];
    const props = { ...actionProps, nodes, disabled: false, onSelect: vi.fn(), onToggle: vi.fn(), onInitialize: vi.fn() };
    const { container, rerender } = render(<GitRepositoryTree {...props} activePath="D:/repo"/>);

    const tree = container.querySelector<HTMLElement>('[role="tree"]')!;
    const indicator = container.querySelector(".git-repository-selection-indicator");
    expect(tree.style.getPropertyValue("--git-repository-selected-index")).toBe("0");
    rerender(<GitRepositoryTree {...props} activePath="D:/repo/modules/child"/>);
    expect(tree.style.getPropertyValue("--git-repository-selected-index")).toBe("1");
    expect(container.querySelector(".git-repository-selection-indicator")).toBe(indicator);
  });

  it("keeps unavailable repositories readable but unselectable", () => {
    const unavailable = node("D:/repo/modules/missing", 1, { selectable: false, state: "未初始化" });
    const onSelect = vi.fn();
    render(<GitRepositoryTree {...actionProps} nodes={[node("D:/repo", 0), unavailable]} activePath="D:/repo" disabled={false} onSelect={onSelect} onToggle={vi.fn()} onInitialize={vi.fn()}/>);

    const item = screen.getByRole("treeitem", { name: /missing/u });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "切换到 missing，未初始化" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
