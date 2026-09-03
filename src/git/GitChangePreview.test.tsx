import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

import type { GitChange, GitChangeDiff, GitCommit, GitCommitFile } from "../lib/tauri/git";
import { GitChangePreview } from "./GitChangePreview";

const changes: GitChange[] = [
  { path: "src/dual.ts", originalPath: null, status: "M", staged: true, conflict: false },
  { path: "src/dual.ts", originalPath: null, status: "M", staged: false, conflict: false },
  { path: "assets/data.bin", originalPath: null, status: "A", staged: false, conflict: false },
];

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 0, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) });
});

afterEach(cleanup);

function detail(change: GitChange): GitChangeDiff {
  return {
    path: change.path,
    originalPath: change.originalPath,
    status: change.status,
    scope: change.staged ? "staged" : "unstaged",
    beforeSource: change.staged ? "head" : "index",
    afterSource: change.staged ? "index" : "worktree",
    before: { kind: "text", content: "before\n", size: 7, mode: 0o100644 },
    after: { kind: "text", content: "after\n", size: 6, mode: 0o100644 },
  };
}

describe("GitChangePreview", () => {
  it("keeps staged and worktree entries distinct and navigates without a layout rail", async () => {
    const onLoad = vi.fn((path: string, staged: boolean) => Promise.resolve(detail(changes.find((change) => change.path === path && change.staged === staged)!)));
    render(<GitChangePreview changes={changes} initialChange={changes[0]} repositoryName="project" onLoad={onLoad} onClose={vi.fn()}/>);
    const dialog = screen.getByRole("dialog", { name: "预览 Git 更改" });
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith("src/dual.ts", true));
    expect(within(dialog).getByText("HEAD")).toBeInTheDocument();
    expect(within(dialog).getByText("暂存区")).toBeInTheDocument();
    const toggle = within(dialog).getByRole("button", { name: "展开更改文件" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).getByLabelText("第 1 个更改，共 3 个")).toHaveTextContent("1/3");
    fireEvent.click(toggle);
    expect(within(dialog).getByLabelText("Git 状态：修改")).toHaveTextContent("修改");
    const worktreeEntry = within(dialog).getByRole("button", { name: "src/dual.ts 工作区 修改" });
    fireEvent.click(worktreeEntry);
    await waitFor(() => expect(onLoad).toHaveBeenLastCalledWith("src/dual.ts", false));
    expect(within(dialog).getAllByText("暂存区").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("工作区").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("M")).not.toBeInTheDocument();
  });

  it("renders binary metadata fallback", async () => {
    const binary = detail(changes[2]);
    binary.before = { kind: "missing", content: null, size: 0, mode: null };
    binary.after = { kind: "binary", content: null, size: 42, mode: 0o100644 };
    const onLoad = vi.fn().mockResolvedValue(binary);
    render(<GitChangePreview changes={[changes[2]]} initialChange={changes[2]} repositoryName="project" onLoad={onLoad} onClose={vi.fn()}/>);
    expect(await screen.findByText("二进制内容，不提供文本差异")).toBeInTheDocument();
  });

  it("selects and loads a language parser from the changed file path", async () => {
    const typescript = detail(changes[0]);
    typescript.before = { kind: "text", content: "const beforeValue: number = 1;\n", size: 31, mode: 0o100644 };
    typescript.after = { kind: "text", content: "const afterValue: number = 2;\n", size: 30, mode: 0o100644 };
    render(<GitChangePreview changes={[changes[0]]} initialChange={changes[0]} repositoryName="project" onLoad={vi.fn().mockResolvedValue(typescript)} onClose={vi.fn()}/>);

    await waitFor(() => {
      const editors = Array.from(document.querySelectorAll<HTMLElement>(".git-change-preview-dialog .cm-editor"));
      expect(editors).toHaveLength(2);
      expect(editors.every((editor) => {
        const editorView = EditorView.findFromDOM(editor);
        return editorView && syntaxTree(editorView.state).toString().includes("TypeAnnotation");
      })).toBe(true);
    });
  });

  it("exposes retryable load errors", async () => {
    const onLoad = vi.fn()
      .mockRejectedValueOnce({ code: "gitConflict", message: "更改已变化" })
      .mockResolvedValueOnce(detail(changes[0]));
    render(<GitChangePreview changes={[changes[0]]} initialChange={changes[0]} repositoryName="project" onLoad={onLoad} onClose={vi.fn()}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("更改已变化");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("HEAD")).toBeInTheDocument();
  });

  it("renders a complete state when Git returns no detail instead of leaving a blank workbench", async () => {
    const onLoad = vi.fn().mockResolvedValue(null);
    render(<GitChangePreview changes={[changes[0]]} initialChange={changes[0]} repositoryName="project" onLoad={onLoad} onClose={vi.fn()}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Git 未返回更改差异");
  });

  it("keeps the rendered diff stable when a parent supplies a new loader function", async () => {
    const firstLoader = vi.fn().mockResolvedValue(detail(changes[0]));
    const secondLoader = vi.fn().mockResolvedValue(detail(changes[0]));
    const view = render(<GitChangePreview changes={changes} initialChange={changes[0]} repositoryName="project" onLoad={firstLoader} onClose={vi.fn()}/>);
    expect(await screen.findByText("HEAD")).toBeInTheDocument();
    view.rerender(<GitChangePreview changes={changes} initialChange={changes[0]} repositoryName="project" onLoad={secondLoader} onClose={vi.fn()}/>);
    await waitFor(() => expect(screen.getByText("HEAD")).toBeInTheDocument());
    expect(firstLoader).toHaveBeenCalledTimes(1);
    expect(secondLoader).not.toHaveBeenCalled();
  });

  it("does not reload or clear the rendered diff for semantically identical cloned entries", async () => {
    const onLoad = vi.fn().mockResolvedValue(detail(changes[0]));
    const view = render(<GitChangePreview changes={changes.map((change) => ({ ...change }))} initialChange={{ ...changes[0] }} repositoryName="project" onLoad={onLoad} onClose={vi.fn()}/>);
    expect(await screen.findByText("HEAD")).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(1);

    view.rerender(<GitChangePreview changes={changes.map((change) => ({ ...change }))} initialChange={{ ...changes[0] }} repositoryName="project" onLoad={onLoad} onClose={vi.fn()}/>);
    await act(async () => { await Promise.resolve(); });

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(screen.getByText("HEAD")).toBeInTheDocument();
    expect(screen.queryByText("正在读取差异…")).not.toBeInTheDocument();
  });

  it("compares commit files with the first parent and navigates the commit file set", async () => {
    const commit: GitCommit = { oid: "abcdef0123456789", parents: ["1111111111111111"], decorations: [], subject: "feat: preview", body: "", author: "Qterm", timestamp: 1 };
    const files: GitCommitFile[] = [
      { path: "src/a.ts", originalPath: null, status: "M" },
      { path: "src/b.ts", originalPath: null, status: "A" },
    ];
    const onLoadCommit = vi.fn((path: string) => Promise.resolve({
      commitOid: commit.oid,
      parentOid: commit.parents[0],
      path,
      originalPath: null,
      status: path.endsWith("b.ts") ? "A" : "M",
      before: { kind: "text" as const, content: "parent\n", size: 7, mode: 0o100644 },
      after: { kind: "text" as const, content: "commit\n", size: 7, mode: 0o100644 },
    }));
    render(<GitChangePreview commit={commit} files={files} initialFile={files[0]} repositoryName="project" onLoadCommit={onLoadCommit} onClose={vi.fn()}/>);
    expect(await screen.findByText("父提交 1111111")).toBeInTheDocument();
    expect(screen.getByText("提交 abcdef0", { selector: ".git-change-preview-source-headings span" })).toBeInTheDocument();
    expect(screen.getByLabelText("Git 状态：修改")).toHaveTextContent("修改");
    fireEvent.click(screen.getByRole("button", { name: "下一个更改" }));
    await waitFor(() => expect(onLoadCommit).toHaveBeenLastCalledWith("src/b.ts"));
  });
});
