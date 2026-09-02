import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitRepositoryTreeNode } from "./gitRepositoryContext";
import { chooseGitRepositoryDensity, useGitRepositoryRowLayout } from "./useGitRepositoryRowLayout";

describe("repository density selection", () => {
  const required = [320, 270, 230, 180];
  it("uses actual requirements rather than viewport breakpoints", () => {
    expect(chooseGitRepositoryDensity(320, required, 0)).toBe(0);
    expect(chooseGitRepositoryDensity(319, required, 0)).toBe(1);
    expect(chooseGitRepositoryDensity(269, required, 0)).toBe(2);
    expect(chooseGitRepositoryDensity(229, required, 0)).toBe(3);
    expect(chooseGitRepositoryDensity(140, required, 0)).toBe(3);
  });
  it("does not oscillate on fractional-pixel threshold noise", () => {
    expect(chooseGitRepositoryDensity(319.9, required, 0)).toBe(1);
    expect(chooseGitRepositoryDensity(320.1, required, 1)).toBe(1);
    expect(chooseGitRepositoryDensity(323.9, required, 1)).toBe(1);
    expect(chooseGitRepositoryDensity(324, required, 1)).toBe(0);
  });
});

const nodes: GitRepositoryTreeNode[] = [0, 1].map((depth) => ({
  id: String(depth), path: String(depth), parentPath: depth ? "0" : null, depth,
  name: "repo", relativePath: "repo", snapshot: null, submodule: null,
  selectable: true, expanded: true, hasChildren: depth === 0, state: "干净",
}));

function Harness({ count = "1", upstream = true, items = nodes }: { count?: string; upstream?: boolean; items?: GitRepositoryTreeNode[] }) {
  const { treeRef, densities } = useGitRepositoryRowLayout(items);
  return <div ref={treeRef}>{items.map((node) => <div className="git-repository-treeitem" style={{ border: 0 }} data-testid={node.path} data-repository-path={node.path} data-density={densities[node.path] ?? 0} key={node.path}>
    {node.depth > 0 && <div className="git-repository-tree-leading"/>}
    <button className="git-repository-tree-select" style={{ border: 0, padding: "0 5px 0 4px", columnGap: "5px" }}><svg width="14"/><strong className="git-repository-name">repo</strong></button>
    <div className="git-repository-node-controls" style={{ border: 0, paddingRight: "4px", columnGap: "3px" }}>
      <button className="git-branch-trigger" style={{ padding: "0 5px", border: "1px solid", columnGap: "4px" }}><svg width="12"/><span>main</span></button>
      <div className="git-repository-status-group" style={{ border: "1px solid" }}>
        <button className="git-repository-change-count">{count}</button>
        {upstream && <span className="git-repository-sync">↑0↓0</span>}
      </div>
      <button>刷新</button><button>菜单</button>
    </div>
  </div>)}</div>;
}

describe("useGitRepositoryRowLayout", () => {
  let width = 300;
  let resize: () => void;
  const disconnect = vi.fn();
  let frames: Map<number, FrameRequestCallback>;
  let sequence = 0;

  beforeEach(() => {
    width = 300;
    frames = new Map();
    disconnect.mockClear();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() { /* Geometry is controlled by this test. */ }
      disconnect = disconnect;
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++sequence, callback); return sequence; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const className = this.getAttribute("class");
      const size = className === "git-repository-treeitem" ? width
        : className === "git-repository-tree-leading" ? 20
        : className === "git-repository-change-count" ? 34 + (this.textContent?.length ?? 0) * 6
        : className === "git-repository-sync" ? 40
        : this.tagName === "BUTTON" ? 23 : Number(this.getAttribute("width")) || 0;
      return { width: size } as DOMRect;
    });
    vi.spyOn(document, "createRange").mockImplementation(() => {
      let content = "";
      return {
        selectNodeContents: (element: Element) => { content = element.textContent ?? ""; },
        getBoundingClientRect: () => ({ width: content.length * 6 }),
      } as Range;
    });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function resizeTo(value: number) {
    width = value;
    act(() => {
      resize();
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  }

  it("measures rows independently, including submodule indentation, and restores hidden controls", () => {
    render(<Harness/>);
    expect(screen.getByTestId("0")).toHaveAttribute("data-density", "0");
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "0");
    resizeTo(250);
    expect(screen.getByTestId("0")).toHaveAttribute("data-density", "0");
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "2");
    resizeTo(224);
    expect(screen.getByTestId("0")).toHaveAttribute("data-density", "2");
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "3");
    resizeTo(300);
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "0");
  });

  it("recalculates when snapshot content grows or an upstream is added", () => {
    width = 250;
    const { rerender } = render(<Harness upstream={false}/>);
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "0");
    rerender(<Harness count="123456" items={[...nodes]}/>);
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "3");
  });

  it("keeps the last usable layout while hidden and coalesces resize notifications", () => {
    const { unmount } = render(<Harness/>);
    resizeTo(224);
    resizeTo(0);
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "3");
    resizeTo(300);
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "0");
    act(() => { resize(); resize(); resize(); });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("falls back to window resize when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<Harness/>);
    width = 224;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      [...frames.values()].forEach((callback) => callback(0));
      frames.clear();
    });
    expect(screen.getByTestId("1")).toHaveAttribute("data-density", "3");
  });
});
