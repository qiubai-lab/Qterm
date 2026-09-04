import { TerminalProtocolTag as TerminalNotificationTag } from "./TerminalProtocolTag";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalOutputObserver } from "./notificationRuntime";
import { TerminalNotificationProvider, useTerminalNotifications } from "./TerminalNotificationProvider";
import { TerminalNotificationSetting } from "../../components/dialogs/TerminalNotificationSetting";
const mocks = vi.hoisted(() => ({ getBody: vi.fn(), updateBody: vi.fn(), get: vi.fn(), update: vi.fn(), send: vi.fn(), observer: null as TerminalOutputObserver | null, epoch: 1, native: false, nativeFocus: null as ((event: { payload: boolean }) => void) | null }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => mocks.native }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ isFocused: async () => true, onFocusChanged: async (callback: (event: { payload: boolean }) => void) => { mocks.nativeFocus = callback; return () => { mocks.nativeFocus = null; }; } }) }));
vi.mock("../../lib/tauri/notifications", () => ({ getNotificationBodySettings: mocks.getBody, updateNotificationBodySettings: mocks.updateBody, getNotificationSettings: mocks.get, updateNotificationSettings: mocks.update, sendTerminalNotification: mocks.send }));
const workspace = { document: { activeWorkspaceId: "other", workspaces: [{ id: "w", layout: { type: "terminal", blockId: "a", profileId: null } }] }, runtimes: {}, getTerminalEpoch: () => mocks.epoch, registerTerminalOutputObserver: (observer: TerminalOutputObserver) => { mocks.observer = observer; return () => { mocks.observer = null; }; } };
vi.mock("../../workspace/WorkspaceProvider", () => ({ useWorkspace: () => workspace }));
function NoticeProbe() { const { notice, dismissNotice } = useTerminalNotifications(); return notice ? <output onClick={() => dismissNotice(notice.revision)}>{notice.workspaceId}:{notice.count}</output> : null; }
function Harness() { return <TerminalNotificationProvider><TerminalNotificationSetting/><NoticeProbe/><section data-layout-block="a" tabIndex={0}><TerminalNotificationTag blockId="a" connected/></section></TerminalNotificationProvider>; }
const feed = (value: string, epoch = 1) => act(() => mocks.observer?.("a", epoch, new TextEncoder().encode(value)));
beforeEach(() => { vi.clearAllMocks(); workspace.document.activeWorkspaceId = "other"; mocks.native = false; mocks.epoch = 1; mocks.get.mockResolvedValue(false); mocks.getBody.mockResolvedValue(false); mocks.updateBody.mockResolvedValue(undefined); mocks.update.mockResolvedValue(undefined); mocks.send.mockResolvedValue(undefined); vi.spyOn(document, "hasFocus").mockReturnValue(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("experimental terminal notification controls", () => {
  it("respects saved off, saves enabling, shows unread then clears immediately after disabling", async () => {
    render(<Harness/>);
    const toggle = screen.getByRole("switch", { name: "终端通知" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked(); expect(screen.getByText("实验功能")).toBeInTheDocument();
    feed("\x07"); expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "终端通知已启用（实验功能）" });
    expect(mocks.update).toHaveBeenCalledWith(true);
    feed("\x1b]9;done\x07");
    expect(screen.getByRole("button", { name: "终端有未读通知，点击查看" })).toBeInTheDocument();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
    feed("\x07"); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("preserves the switch after a failed save and fails closed after a failed read", async () => {
    mocks.get.mockRejectedValue({ message: "读取失败" });
    render(<Harness/>); await screen.findByText("读取失败");
    mocks.update.mockRejectedValue({ message: "保存失败" });
    fireEvent.click(screen.getByRole("switch", { name: "终端通知" })); await screen.findByText("保存失败");
    expect(screen.getByRole("switch", { name: "终端通知" })).not.toBeChecked();
    feed("\x07"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("ignores old epochs, suppresses focused alerts and keeps unread on native failure", async () => {
    mocks.get.mockResolvedValue(true); mocks.send.mockRejectedValue(new Error("native unavailable"));
    render(<Harness/>); await screen.findByRole("button");
    feed("\x07", 0); expect(mocks.send).not.toHaveBeenCalled();
    vi.mocked(document.hasFocus).mockReturnValue(true);
    act(() => screen.getByRole("button").parentElement!.focus());
    feed("\x07"); expect(screen.getByRole("button")).toHaveAttribute("data-state", "ready");
    vi.mocked(document.hasFocus).mockReturnValue(false);
    feed("\x07"); await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "终端有未读通知，点击查看");
    expect(await screen.findByRole("alert")).toHaveTextContent("native unavailable");
    vi.mocked(document.hasFocus).mockReturnValue(true);
    fireEvent(window, new Event("focus"));
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "ready");
  });
  it("uses native window blur even when the WebView still reports focus", async () => {
    mocks.native = true; mocks.get.mockResolvedValue(true);
    vi.mocked(document.hasFocus).mockReturnValue(true);
    render(<Harness/>); await screen.findByRole("button");
    act(() => { screen.getByRole("button").parentElement!.focus(); mocks.nativeFocus?.({ payload: false }); });
    feed("\x07");
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "终端有未读通知，点击查看");
    act(() => mocks.nativeFocus?.({ payload: true }));
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "ready");
  });

  it("respects saved body opt-out and includes OSC content after enabling", async () => {
    mocks.get.mockResolvedValue(true);
    render(<Harness/>); await screen.findByRole("button");
    expect(screen.getByRole("switch", { name: "显示通知正文" })).not.toBeChecked();
    feed("\x1b]777;notify;Codex;完成了检查\x07");
    expect(mocks.send).toHaveBeenLastCalledWith("本地终端 · 工作区", "");
    fireEvent.click(screen.getByRole("switch", { name: "显示通知正文" }));
    await waitFor(() => expect(mocks.updateBody).toHaveBeenCalledWith(true));
    // Reset limiter by toggling the master switch without changing the body preference.
    fireEvent.click(screen.getByRole("switch", { name: "终端通知" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "终端通知" })).not.toBeChecked());
    fireEvent.click(screen.getByRole("switch", { name: "终端通知" }));
    await screen.findByRole("button");
    feed("\x1b]777;notify;Codex;完成了检查\x07");
    expect(mocks.send).toHaveBeenLastCalledWith("本地终端 · 工作区", "Codex：完成了检查");
  });

  it("routes foreground cross-workspace events to a merged bubble without OS alerts or implicit read", async () => {
    mocks.get.mockResolvedValue(true);
    vi.mocked(document.hasFocus).mockReturnValue(true);
    const view = render(<Harness/>); await screen.findByRole("button");
    feed("\x07"); feed("\x07");
    expect(screen.getByText("w:2")).toBeInTheDocument();
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("w:2"));
    expect(screen.queryByText("w:2")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "终端有未读通知，点击查看");
    workspace.document.activeWorkspaceId = "w";
    feed("\x07");
    expect(screen.queryByText("w:1")).not.toBeInTheDocument();
    workspace.document.activeWorkspaceId = "other";
    feed("\x07");
    expect(screen.getByText("w:1")).toBeInTheDocument();
    fireEvent(window, new Event("blur"));
    expect(screen.queryByText("w:1")).not.toBeInTheDocument();
    view.unmount();
  });

});
