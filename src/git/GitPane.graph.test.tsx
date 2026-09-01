import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { api, setupGitPaneTests, snapshot } from "./GitPane.testHarness";
import { GitPane } from "./GitPane";

setupGitPaneTests();

describe("GitPane commit graph", () => {
  const historicalCommit = {
    oid: "1234567890abcdef1234567890abcdef12345678",
    parents: [],
    decorations: [],
    subject: "fix: historical commit",
    body: "",
    author: "Koppa",
    timestamp: 1_690_000_000,
  };

  it("renders a VS Code-style selectable commit graph with branch decorations", async () => {
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      commits: [
        snapshot.commits[0],
        { oid: "123456789abc", parents: [], decorations: ["origin/archive"], subject: "fix: older commit", body: "", author: "Koppa", timestamp: 1_690_000_000 },
      ],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const current = screen.getByRole("button", { name: /feat: initial/ });
    const older = screen.getByRole("button", { name: /fix: older commit/ });
    const rail = current.querySelector<HTMLElement>(":scope > .git-graph-rail");
    const card = current.querySelector<HTMLElement>(":scope > .git-commit-card");
    expect(rail).toBeInTheDocument();
    expect(card).toBeInTheDocument();
    expect(card).toContainElement(current.querySelector(".git-commit-content"));
    expect(card).not.toContainElement(rail);
    expect(current).toHaveAttribute("aria-pressed", "true");
    expect(current.querySelector('[data-kind="head"]')).toHaveTextContent("main");
    expect(current.querySelector('[data-kind="head"]')).not.toHaveTextContent("HEAD ->");
    expect(older.querySelector('[data-kind="remote"]')).toHaveTextContent("origin/archive");
    expect(current.querySelector('[data-kind="head"] .git-decoration-label')).toHaveTextContent("main");
    expect(older.querySelector('[data-kind="remote"] .git-decoration-label')).toHaveTextContent("origin/archive");

    fireEvent.click(older);
    expect(older).toHaveAttribute("aria-pressed", "true");
    expect(current).toHaveAttribute("aria-pressed", "false");
  });

  it("shows accessible portaled commit details on hover and keyboard focus without loading files", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /feat: initial/ });
    expect(commit).not.toHaveAttribute("title");

    fireEvent.pointerEnter(commit);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(commit).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip).toHaveTextContent("Qterm");
    expect(tooltip).toHaveTextContent("feat: initial");
    expect(tooltip).toHaveTextContent("Introduces the first Qterm workflow.");
    expect(tooltip).toHaveTextContent("Keeps the terminal interaction compact.");
    expect(tooltip).toHaveTextContent("abcdef0");
    expect(tooltip).toHaveTextContent("main");
    expect(tooltip.querySelector("time")).toHaveAttribute("dateTime", "2023-11-14T22:13:20.000Z");
    expect(api.commitFiles).not.toHaveBeenCalled();

    fireEvent.pointerLeave(commit);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(commit);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(commit);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("creates and switches a branch from the commit targeted by the context menu", async () => {
    api.snapshot.mockResolvedValueOnce({ ...snapshot, commits: [snapshot.commits[0], historicalCommit] });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /fix: historical commit/ });

    fireEvent.pointerEnter(commit);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.contextMenu(commit, { clientX: 240, clientY: 180 });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    const menu = screen.getByRole("menu", { name: "fix: historical commit 提交菜单" });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveTextContent("fix: historical commit");
    expect(menu).toHaveTextContent("12345678");
    const createItem = within(menu).getByRole("menuitem", { name: "从此提交创建分支…" });
    fireEvent.keyDown(menu, { key: "End" });
    expect(createItem).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(createItem).toHaveFocus();
    fireEvent.click(createItem);

    const form = screen.getByRole("dialog", { name: "从此提交创建分支" });
    expect(form).toHaveTextContent("fix: historical commit");
    expect(form).toHaveTextContent("12345678");
    fireEvent.change(within(form).getByRole("textbox", { name: "新分支名称" }), { target: { value: "feature/history" } });
    fireEvent.click(within(form).getByRole("button", { name: "创建并切换" }));

    await waitFor(() => expect(api.createBranchFromCommit).toHaveBeenCalledWith(
      "D:/work/project",
      "feature/history",
      historicalCommit.oid,
    ));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "从此提交创建分支" })).not.toBeInTheDocument());
  });

  it("supports keyboard commit menus, focus restoration, and merge gating", async () => {
    api.snapshot.mockResolvedValueOnce({ ...snapshot, mergeInProgress: true, commits: [historicalCommit] });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /fix: historical commit/ });
    commit.focus();
    fireEvent.keyDown(commit, { key: "ContextMenu" });
    let menu = screen.getByRole("menu", { name: "fix: historical commit 提交菜单" });
    expect(within(menu).getByRole("menuitem", { name: "从此提交创建分支…" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(commit).toHaveFocus());

    fireEvent.keyDown(commit, { key: "F10", shiftKey: true });
    menu = screen.getByRole("menu", { name: "fix: historical commit 提交菜单" });
    expect(menu).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "fix: historical commit 提交菜单" })).not.toBeInTheDocument();
    expect(api.createBranchFromCommit).not.toHaveBeenCalled();
  });

  it("keeps the commit branch form open when Git rejects the mutation", async () => {
    api.snapshot.mockResolvedValueOnce({ ...snapshot, commits: [historicalCommit] });
    api.createBranchFromCommit.mockRejectedValueOnce({ code: "gitConflict", message: "当前更改会被切换覆盖" });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /fix: historical commit/ });
    fireEvent.contextMenu(commit, { clientX: 140, clientY: 120 });
    fireEvent.click(screen.getByRole("menuitem", { name: "从此提交创建分支…" }));
    const form = screen.getByRole("dialog", { name: "从此提交创建分支" });
    fireEvent.change(within(form).getByRole("textbox", { name: "新分支名称" }), { target: { value: "feature/conflict" } });
    fireEvent.click(within(form).getByRole("button", { name: "创建并切换" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("当前更改会被切换覆盖");
    expect(form).toBeInTheDocument();
  });

  it("repositions commit details after viewport and ancestor-scroll changes", async () => {
    let anchorTop = 120;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("git-commit-row")) return {
        top: anchorTop, right: 430, bottom: anchorTop + 36, left: 20, width: 410, height: 36,
        x: 20, y: anchorTop, toJSON: () => ({}),
      } as DOMRect;
      if (this.classList.contains("git-commit-tooltip")) return {
        top: 0, right: 320, bottom: 180, left: 0, width: 320, height: 180,
        x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect;
      return { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
      await screen.findByText("project");
      fireEvent.click(screen.getByRole("button", { name: "图表" }));
      fireEvent.pointerEnter(screen.getByRole("button", { name: /feat: initial/ }));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveStyle({ left: "436px", top: "120px", visibility: "visible" });

      anchorTop = 180;
      fireEvent.resize(window);
      expect(tooltip).toHaveStyle({ top: "180px" });
      anchorTop = 220;
      fireEvent.scroll(document);
      expect(tooltip).toHaveStyle({ top: "220px" });
    } finally {
      rect.mockRestore();
    }
  });

  it("loads commit files lazily, shows rename context, and reuses the cached result", async () => {
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /feat: initial/ });
    const entry = commit.closest<HTMLElement>(".git-commit-entry");
    const detailsShell = entry?.querySelector<HTMLElement>(".git-commit-details-shell") ?? null;
    expect(detailsShell).toBeInTheDocument();
    expect(detailsShell).not.toHaveClass("expanded");
    expect(detailsShell).toHaveAttribute("aria-hidden", "true");
    expect(detailsShell).toHaveAttribute("inert");
    expect(api.commitFiles).not.toHaveBeenCalled();

    fireEvent.click(commit);
    const files = await screen.findByRole("list", { name: "feat: initial 的文件" });
    expect(detailsShell).toHaveClass("expanded");
    expect(detailsShell).toHaveAttribute("aria-hidden", "false");
    expect(detailsShell).not.toHaveAttribute("inert");
    expect(api.commitFiles).toHaveBeenCalledWith("D:/work/project", "abcdef012345");
    expect(files).toHaveTextContent("new-file.ts");
    expect(files).toHaveTextContent("src");
    expect(files).toHaveTextContent("来自 src/old.ts");
    expect(files.querySelector('[data-tone="added"]')).toHaveTextContent("A");
    expect(files.querySelector('[data-tone="renamed"]')).toHaveTextContent("R");
    expect(screen.queryByRole("button", { name: /diff|比较|查看改动/i })).not.toBeInTheDocument();
    fireEvent.pointerEnter(commit);
    expect(screen.getByRole("tooltip")).toHaveTextContent("2 个文件");
    fireEvent.pointerLeave(commit);

    fireEvent.click(commit);
    expect(screen.queryByRole("list", { name: "feat: initial 的文件" })).not.toBeInTheDocument();
    expect(detailsShell).not.toHaveClass("expanded");
    expect(detailsShell).toHaveAttribute("aria-hidden", "true");
    expect(detailsShell).toHaveAttribute("inert");
    expect(files).toBeInTheDocument();
    fireEvent.click(commit);
    expect(await screen.findByRole("list", { name: "feat: initial 的文件" })).toBeInTheDocument();
    expect(api.commitFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps every live graph lane continuous through expanded commit files", async () => {
    const parent = { oid: "123456789abc", parents: [], decorations: [], subject: "fix: parent", body: "", author: "Koppa", timestamp: 1_690_000_000 };
    const secondParent = { ...parent, oid: "fedcba987654", subject: "fix: second parent" };
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      commits: [{ ...snapshot.commits[0], parents: [parent.oid, secondParent.oid] }, parent, secondParent],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    const commit = screen.getByRole("button", { name: /feat: initial/ });
    fireEvent.click(commit);
    const files = await screen.findByRole("list", { name: "feat: initial 的文件" });
    const entry = commit.closest<HTMLElement>(".git-commit-entry");
    const details = entry?.querySelector<HTMLElement>(".git-commit-details") ?? null;
    const card = entry?.querySelector<HTMLElement>(".git-commit-card") ?? null;
    const rail = commit.querySelector<HTMLElement>(":scope > .git-graph-rail");
    const railSvg = rail?.querySelector(".git-graph-lanes") ?? null;
    expect(commit.querySelector<HTMLElement>(":scope > .git-commit-card")).toBe(card);
    expect(commit.querySelector<HTMLElement>(":scope > .git-graph-rail")).toBe(rail);
    expect(railSvg).toHaveAttribute("height", "36");
    expect(railSvg).toHaveAttribute("viewBox", "0 0 28 36");
    expect(railSvg?.querySelector("circle")).toHaveAttribute("cy", "18");
    expect(railSvg?.querySelector("circle")).toHaveAttribute("data-color", "0");
    expect(Array.from(railSvg?.querySelectorAll('path[data-kind="parent"]') ?? []).map((path) => path.getAttribute("data-color"))).toEqual(["0", "1"]);
    expect(Array.from(railSvg?.querySelectorAll("path") ?? []).some((path) => path.getAttribute("d")?.endsWith("36"))).toBe(true);
    expect(card).not.toContainElement(rail);
    expect(card).not.toContainElement(details);
    expect(details).toContainElement(files);
    expect(details?.querySelectorAll(".git-graph-continuation line")).toHaveLength(2);
    expect(Array.from(details?.querySelectorAll(".git-graph-continuation line") ?? []).map((line) => line.getAttribute("data-color"))).toEqual(["0", "1"]);
    expect(entry?.querySelectorAll(":scope > .git-graph-bridge line")).toHaveLength(2);
    expect(Array.from(entry?.querySelectorAll(":scope > .git-graph-bridge line") ?? []).map((line) => line.getAttribute("data-color"))).toEqual(["0", "1"]);
  });

  it("sizes each commit, expanded continuation, and bridge from that row's live lanes", async () => {
    const left = { oid: "111111111111", parents: ["333333333333"], decorations: [], subject: "left", body: "", author: "Koppa", timestamp: 1_690_000_004 };
    const right = { oid: "222222222222", parents: ["333333333333"], decorations: [], subject: "right", body: "", author: "Koppa", timestamp: 1_690_000_003 };
    const root = { oid: "333333333333", parents: ["444444444444"], decorations: [], subject: "root", body: "", author: "Koppa", timestamp: 1_690_000_002 };
    const older = { oid: "444444444444", parents: [], decorations: [], subject: "older", body: "", author: "Koppa", timestamp: 1_690_000_001 };
    api.snapshot.mockResolvedValueOnce({
      ...snapshot,
      commits: [{ ...snapshot.commits[0], parents: [left.oid, right.oid] }, left, right, root, older],
    });
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));

    const merge = screen.getByRole("button", { name: /feat: initial/ });
    const rootCommit = screen.getByRole("button", { name: /^root/ });
    expect(merge.querySelector(".git-graph-lanes")).toHaveAttribute("viewBox", "0 0 28 36");
    expect(rootCommit.querySelector(".git-graph-lanes")).toHaveAttribute("viewBox", "0 0 17 36");

    fireEvent.click(rootCommit);
    await screen.findByRole("list", { name: "root 的文件" });
    const rootEntry = rootCommit.closest<HTMLElement>(".git-commit-entry");
    expect(rootEntry?.querySelector(".git-graph-continuation svg")).toHaveAttribute("width", "17");
    expect(rootEntry?.querySelector(":scope > .git-graph-bridge svg")).toHaveAttribute("width", "17");
  });

  it("keeps commit-file cache entries isolated by repository", async () => {
    const otherSnapshot = { ...snapshot, repositoryPath: "D:/work/other", repositoryName: "other" };
    api.snapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(otherSnapshot);
    const view = render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    await waitFor(() => expect(api.commitFiles).toHaveBeenCalledWith("D:/work/project", "abcdef012345"));

    view.rerender(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/other" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("other");
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    await waitFor(() => expect(api.commitFiles).toHaveBeenCalledWith("D:/work/other", "abcdef012345"));
    expect(api.commitFiles).toHaveBeenCalledTimes(2);
  });

  it("offers an inline retry and empty state when commit files cannot be loaded", async () => {
    api.commitFiles.mockRejectedValueOnce({ code: "gitCommandFailed", message: "读取提交失败" }).mockResolvedValueOnce([]);
    render(<GitPane blockId="git-1" target={{ type: "local", path: "D:/work/project" }} visible onTargetChange={vi.fn()}/>);
    await screen.findByText("project");
    fireEvent.click(screen.getByRole("button", { name: "图表" }));
    fireEvent.click(screen.getByRole("button", { name: /feat: initial/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("读取提交失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("该提交没有可显示的文件变更")).toBeInTheDocument();
    expect(api.commitFiles).toHaveBeenCalledTimes(2);
  });
});
