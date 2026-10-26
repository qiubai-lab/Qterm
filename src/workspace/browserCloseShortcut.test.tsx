import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebTabs } from "../web/WebTabs";
import type { Workspace } from "./model";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";

vi.mock("../web/WebBrowserPane", () => ({ WebBrowserPane: ({ visible }: { visible: boolean }) =>
  <input aria-label={visible ? "当前网页" : "后台网页"}/> }));
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const workspace: Workspace = { id: "workspace", name: "Workspace", activeBlockId: "browser", layout: {
  type: "split", id: "split", direction: "horizontal", ratio: 0.5,
  first: { type: "terminal", blockId: "terminal", profileId: null, restoreDirectory: null },
  second: { type: "web", blockId: "browser", profileId: null },
} };

it.each([
  { platform: "macos" as const, workspaceFirst: true }, { platform: "macos" as const, workspaceFirst: false },
  { platform: "windows" as const, workspaceFirst: true }, { platform: "windows" as const, workspaceFirst: false },
])("Ctrl+W closes a tab only ($platform, workspace listener first: $workspaceFirst)", ({ platform, workspaceFirst }) => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform === "macos" ? "MacIntel" : "Win32");
  const onCloseBlock = vi.fn();
  const mountWorkspace = () => renderHook(() => useWorkspaceShortcuts({
    platform, activeWorkspace: workspace, workspaces: [workspace],
    modalOpen: false, terminalLocked: false, onCloseBlock, onSelectWorkspace: vi.fn(),
  }));
  if (workspaceFirst) mountWorkspace();
  const header = document.createElement("div"); document.body.append(header);
  render(<WebTabs active blockId="browser" header={header} profileId={null} sessionId={null}
    connecting={false} visible supported notice="" onConnect={vi.fn()} onActivate={vi.fn()}/>);
  if (!workspaceFirst) mountWorkspace();
  const first = screen.getByLabelText("当前网页");
  fireEvent.change(first, { target: { value: "保留内容" } });
  fireEvent.click(screen.getByRole("button", { name: "新建标签页" }));
  const selected = screen.getByLabelText("当前网页");
  expect(fireEvent.keyDown(selected, { key: "w", code: "KeyW", ctrlKey: true })).toBe(false);
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(first).toHaveValue("保留内容"); expect(selected).not.toBeInTheDocument();
  expect(onCloseBlock).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(first, { key: "∑", code: "KeyW", altKey: true })).toBe(true);
  expect(screen.getByLabelText("当前网页")).toBe(first);
  if (platform === "macos") {
    fireEvent.keyDown(window, { key: "w", metaKey: true });
    expect(onCloseBlock).toHaveBeenCalledExactlyOnceWith("browser");
    expect(screen.getByLabelText("当前网页")).toBe(first);
  }
});
