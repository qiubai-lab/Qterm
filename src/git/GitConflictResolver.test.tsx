import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitChange, GitConflictDetail, GitSnapshot } from "../lib/tauri/git";
import { GitConflictResolver } from "./GitConflictResolver";

const resultEditorFocus = vi.hoisted(() => vi.fn());

vi.mock("../files/CodeEditor", () => ({
  CodeEditor: ({ value, readOnly, onChange, onSave, onViewReady }: { value: string; readOnly?: boolean; onChange: (value: string) => void; onSave: () => void; onViewReady?: (view: { focus: () => void } | null) => void }) => <textarea aria-label={readOnly ? "冲突版本预览" : "冲突结果编辑器"} readOnly={readOnly} value={value} ref={(node) => onViewReady?.(node ? { focus: resultEditorFocus } : null)} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (!readOnly && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); } }}/>,
}));

vi.mock("./editor/GitConflictInputComparison", () => ({
  GitConflictInputComparison: ({ current, incoming }: { current: { content?: string | null }; incoming: { content?: string | null } }) => <div aria-label="冲突输入比较">
    <textarea aria-label="传入版本" readOnly value={incoming.content ?? ""}/>
    <textarea aria-label="当前版本" readOnly value={current.content ?? ""}/>
  </div>,
}));

afterEach(() => {
  cleanup();
  resultEditorFocus.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const conflicts: GitChange[] = [
  { path: "src/alpha.ts", originalPath: null, status: "!", staged: false, conflict: true, conflictKind: "bothModified" },
  { path: "src/beta.ts", originalPath: null, status: "!", staged: false, conflict: true, conflictKind: "bothAdded" },
];

const detail: GitConflictDetail = {
  path: "src/alpha.ts",
  kind: "bothModified",
  base: { kind: "text", content: "base\n", size: 5, mode: 0o100644 },
  current: { kind: "text", content: "current\n", size: 8, mode: 0o100644 },
  incoming: { kind: "text", content: "incoming\n", size: 9, mode: 0o100644 },
  result: { kind: "text", content: "<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> main\n", revision: "r1", size: 54, mode: 0o100644 },
  editable: true,
  unsupportedReason: null,
};

function resolvedSnapshot(changes: GitChange[] = []): GitSnapshot {
  return {
    repositoryPath: "/repo",
    repositoryName: "repo",
    head: { name: "main", oid: "a", detached: false, unborn: false, upstream: null, ahead: 0, behind: 0 },
    changes,
    branches: [],
    remotes: [],
    commits: [],
    mergeInProgress: changes.length > 0,
  };
}

describe("GitConflictResolver", () => {
  it("starts with the conflict file list collapsed and restores it from the accessible rail", async () => {
    const onLoad = vi.fn().mockImplementation((path: string) => Promise.resolve({ ...detail, path }));
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/alpha.ts" repositoryName="repo" onLoad={onLoad} onResolve={vi.fn()} onClose={vi.fn()}/>);
    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    const toggle = within(dialog).getByRole("button", { name: "展开冲突文件列表" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.querySelector('[data-icon="files"]')).toBeInTheDocument();
    expect(within(dialog).queryByRole("listbox", { name: "冲突文件列表" })).not.toBeInTheDocument();
    expect(dialog.querySelector(".git-conflict-file-popover")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(toggle);
    expect(within(dialog).getByRole("button", { name: "收起冲突文件列表" })).toHaveAttribute("aria-expanded", "true");
    expect(await within(dialog).findByRole("listbox", { name: "冲突文件列表" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("option", { name: /src\/beta.ts/ }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith("src/beta.ts"));
    const restoredToggle = within(dialog).getByRole("button", { name: "展开冲突文件列表" });
    expect(restoredToggle).toHaveAttribute("aria-expanded", "false");
    expect(restoredToggle).toHaveFocus();
    expect(within(dialog).queryByRole("listbox", { name: "冲突文件列表" })).not.toBeInTheDocument();
  });

  it("keeps the dialog mounted for its closing motion", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/alpha.ts" repositoryName="repo" onLoad={vi.fn().mockResolvedValue(detail)} onResolve={vi.fn()} onClose={onClose}/>);
    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(dialog).toHaveAttribute("data-state", "closing");
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(129));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes immediately when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const onClose = vi.fn();
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/alpha.ts" repositoryName="repo" onLoad={vi.fn().mockResolvedValue(detail)} onResolve={vi.fn()} onClose={onClose}/>);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps incoming, current, and result visible while Base remains an optional reference", async () => {
    const onLoad = vi.fn().mockResolvedValue(detail);
    const onResolve = vi.fn().mockResolvedValue(resolvedSnapshot());
    const onClose = vi.fn();
    render(<GitConflictResolver conflicts={conflicts.slice(0, 1)} initialPath="src/alpha.ts" repositoryName="repo" mergeHeadOid="abcdef012345" onLoad={onLoad} onResolve={onResolve} onClose={onClose}/>);

    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    expect(await within(dialog).findByRole("textbox", { name: "传入版本" })).toHaveValue("incoming\n");
    expect(within(dialog).getByRole("textbox", { name: "当前版本" })).toHaveValue("current\n");
    expect(within(dialog).getByText("1 处未解决标记")).toBeInTheDocument();
    const baseToggle = within(dialog).getByRole("button", { name: "显示 Base" });
    expect(baseToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(baseToggle);
    expect(baseToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("textbox", { name: "冲突版本预览" })).toHaveValue("base\n");

    const editor = within(dialog).getByRole("textbox", { name: "冲突结果编辑器" });
    fireEvent.change(editor, { target: { value: "resolved\n" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存并标记已解决" }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith("src/alpha.ts", { type: "saveText", content: "resolved\n", expectedRevision: "r1" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps whole-file actions beside their corresponding inputs", async () => {
    const onResolve = vi.fn().mockResolvedValue(resolvedSnapshot());
    render(<GitConflictResolver conflicts={conflicts.slice(0, 1)} initialPath="src/alpha.ts" repositoryName="repo" onLoad={vi.fn().mockResolvedValue(detail)} onResolve={onResolve} onClose={vi.fn()}/>);
    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    const incomingHeader = await within(dialog).findByRole("group", { name: "传入版本操作" });
    const currentHeader = within(dialog).getByRole("group", { name: "当前版本操作" });
    fireEvent.click(within(incomingHeader).getByRole("button", { name: "采用传入" }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith("src/alpha.ts", { type: "useIncoming" }));
    expect(within(currentHeader).getByRole("button", { name: "采用当前" })).toBeInTheDocument();
  });

  it("opens and focuses the next remaining conflict after a successful resolution", async () => {
    const onLoad = vi.fn().mockImplementation((path: string) => Promise.resolve({
      ...detail,
      path,
      result: { ...detail.result, content: `${path}\n`, revision: path },
    }));
    const onResolve = vi.fn().mockResolvedValue(resolvedSnapshot(conflicts.slice(1)));
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/alpha.ts" repositoryName="repo" onLoad={onLoad} onResolve={onResolve} onClose={vi.fn()}/>);

    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    expect(await within(dialog).findByRole("textbox", { name: "冲突结果编辑器" })).toHaveValue("src/alpha.ts\n");
    resultEditorFocus.mockClear();
    fireEvent.click(within(dialog).getByRole("button", { name: "采用传入" }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledWith("src/beta.ts"));
    expect(await within(dialog).findByRole("textbox", { name: "冲突结果编辑器" })).toHaveValue("src/beta.ts\n");
    await waitFor(() => expect(resultEditorFocus).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole("region", { name: "src/beta.ts" })).toBeInTheDocument();
  });

  it("wraps to the first remaining conflict after resolving the last item", async () => {
    const onLoad = vi.fn().mockImplementation((path: string) => Promise.resolve({ ...detail, path }));
    const onResolve = vi.fn().mockResolvedValue(resolvedSnapshot(conflicts.slice(0, 1)));
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/beta.ts" repositoryName="repo" onLoad={onLoad} onResolve={onResolve} onClose={vi.fn()}/>);

    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    await within(dialog).findByRole("textbox", { name: "冲突结果编辑器" });
    fireEvent.click(within(dialog).getByRole("button", { name: "采用当前" }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith("src/alpha.ts"));
    expect(within(dialog).getByRole("region", { name: "src/alpha.ts" })).toBeInTheDocument();
  });

  it("keeps the current conflict selected when resolution fails", async () => {
    const onLoad = vi.fn().mockImplementation((path: string) => Promise.resolve({ ...detail, path }));
    const onResolve = vi.fn().mockRejectedValue(new Error("保存失败"));
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/alpha.ts" repositoryName="repo" onLoad={onLoad} onResolve={onResolve} onClose={vi.fn()}/>);

    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    await within(dialog).findByRole("textbox", { name: "冲突结果编辑器" });
    fireEvent.click(within(dialog).getByRole("button", { name: "采用传入" }));
    expect(await within(dialog).findByText("保存失败")).toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("region", { name: "src/alpha.ts" })).toBeInTheDocument();
  });

  it("protects a dirty draft before changing files or closing", async () => {
    const onLoad = vi.fn().mockImplementation((path: string) => Promise.resolve({ ...detail, path }));
    const onClose = vi.fn();
    render(<GitConflictResolver conflicts={conflicts} initialPath="src/alpha.ts" repositoryName="repo" onLoad={onLoad} onResolve={vi.fn()} onClose={onClose}/>);
    fireEvent.change(await screen.findByRole("textbox", { name: "冲突结果编辑器" }), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "展开冲突文件列表" }));
    fireEvent.click(screen.getByRole("option", { name: /src\/beta.ts/ }));
    let confirmation = screen.getByRole("dialog", { name: "放弃未保存的结果？" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "继续编辑" }));
    expect(onLoad).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "放弃未保存的结果？" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "放弃未保存的结果？" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "解决合并冲突" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    confirmation = screen.getByRole("dialog", { name: "放弃未保存的结果？" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "放弃未保存内容" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps binary conflicts out of the text editor and offers safe whole-file actions", async () => {
    const binary: GitConflictDetail = {
      ...detail,
      current: { kind: "binary", content: null, size: 20, mode: 0o100644 },
      incoming: { kind: "binary", content: null, size: 22, mode: 0o100644 },
      result: { kind: "binary", content: null, revision: "r2", size: 24, mode: 0o100644 },
      editable: false,
      unsupportedReason: "该文件类型不支持应用内编辑",
    };
    const onResolve = vi.fn().mockResolvedValue(resolvedSnapshot());
    render(<GitConflictResolver conflicts={conflicts.slice(0, 1)} initialPath="src/alpha.ts" repositoryName="repo" onLoad={vi.fn().mockResolvedValue(binary)} onResolve={onResolve} onClose={vi.fn()}/>);
    const dialog = screen.getByRole("dialog", { name: "解决合并冲突" });
    expect(await within(dialog).findByText("该文件类型不支持应用内编辑")).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "冲突结果编辑器" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "采用传入" }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith("src/alpha.ts", { type: "useIncoming" }));
  });
});
