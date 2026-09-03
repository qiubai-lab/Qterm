import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GitRemoteTargetConfig } from "./GitRemoteTargetConfig";

vi.mock("./GitRepositoryPickerDialog", () => ({
  GitRepositoryPickerDialog: ({ initialPath, onClose, onSelect }: { initialPath: string; onClose: () => void; onSelect: (path: string) => void }) => <div role="dialog" aria-label="测试远程仓库选择器" data-initial-path={initialPath}>
    <button onClick={() => onSelect("/srv/selected")}>测试确认远程目录</button>
    <button onClick={onClose}>测试取消远程目录</button>
  </div>,
}));

afterEach(cleanup);

function renderConfig(overrides: Partial<Parameters<typeof GitRemoteTargetConfig>[0]> = {}) {
  const props: Parameters<typeof GitRemoteTargetConfig>[0] = {
    blockId: "git-1",
    profileId: "profile-1",
    profileName: "Production",
    path: "",
    recentRepositories: [],
    sessionId: null,
    connectionStatus: "closed",
    onPathChange: vi.fn(),
    onOpen: vi.fn(),
    onPrepareBrowse: vi.fn(),
    onCancelBrowse: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<GitRemoteTargetConfig {...props}/>) };
}

describe("GitRemoteTargetConfig", () => {
  it("groups the exact path input with an accessible remote browse button", () => {
    renderConfig();

    const group = screen.getByRole("group", { name: "远程工作目录" });
    const input = screen.getByRole("textbox", { name: "远程工作目录" });
    expect(group).toContainElement(input);
    expect(group).toContainElement(screen.getByRole("button", { name: "浏览远程目录" }));
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("waits for a connected Git session then opens the remote default directory for an empty draft", async () => {
    const user = userEvent.setup();
    const onPrepareBrowse = vi.fn();
    const view = renderConfig({ onPrepareBrowse });

    await user.click(screen.getByRole("button", { name: "浏览远程目录" }));
    expect(onPrepareBrowse).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    view.rerender(<GitRemoteTargetConfig {...view.props} connectionStatus="connecting" sessionId="git-session"/>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.rerender(<GitRemoteTargetConfig {...view.props} connectionStatus="connected" sessionId="git-session"/>);
    expect(screen.getByRole("dialog", { name: "测试远程仓库选择器" })).toHaveAttribute("data-initial-path", ".");
  });

  it("uses the typed draft and commits a selected directory as a prepared-session target", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const view = renderConfig({ path: "/srv/draft", sessionId: "git-session", connectionStatus: "connected", onOpen });

    await user.click(screen.getByRole("button", { name: "浏览远程目录" }));
    expect(screen.getByRole("dialog", { name: "测试远程仓库选择器" })).toHaveAttribute("data-initial-path", "/srv/draft");
    await user.click(screen.getByRole("button", { name: "测试确认远程目录" }));

    expect(onOpen).toHaveBeenCalledWith("/srv/selected", true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.unmount();
  });

  it("returns to the unchanged draft and releases preparation when browsing is cancelled", async () => {
    const user = userEvent.setup();
    const onCancelBrowse = vi.fn();
    renderConfig({ path: "/srv/draft", sessionId: "git-session", connectionStatus: "connected", onCancelBrowse });

    await user.click(screen.getByRole("button", { name: "浏览远程目录" }));
    await user.click(screen.getByRole("button", { name: "测试取消远程目录" }));

    expect(onCancelBrowse).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "远程工作目录" })).toHaveValue("/srv/draft");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps manual submission disabled for whitespace and submits a trimmed path without prepared reuse", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const view = renderConfig({ path: "   ", onOpen });

    expect(screen.getByRole("button", { name: "连接并打开" })).toBeDisabled();
    view.rerender(<GitRemoteTargetConfig {...view.props} path="  /srv/manual  " onOpen={onOpen}/>);
    await user.click(screen.getByRole("button", { name: "连接并打开" }));

    expect(onOpen).toHaveBeenCalledWith("/srv/manual", false);
  });

  it("opens a recent repository without treating it as a prepared browse session", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderConfig({ recentRepositories: [{ type: "remote", profileId: "profile-1", path: "/srv/recent" }], onOpen });

    await user.click(screen.getByRole("button", { name: /recent/ }));
    expect(onOpen).toHaveBeenCalledWith("/srv/recent", false);
  });
});
