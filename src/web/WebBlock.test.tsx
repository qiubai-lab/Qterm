import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { WebBlock } from "./WebBlock";
import { TerminalTargetPicker } from "../workspace/TerminalTargetPicker";
import type { WebPopupEvent } from "../lib/tauri/webPopups";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(), open: vi.fn<(id: string, session: string, profile: string, url: string) => Promise<void>>(async () => {}), close: vi.fn(async () => {}),
  disconnect: vi.fn(), dispatch: vi.fn(), select: vi.fn(async () => {}),
  focus: vi.fn<(receive: (label: string) => void) => Promise<() => void>>(async () => () => {}),
  popup: vi.fn<(receive: (event: WebPopupEvent) => void) => Promise<() => void>>(async () => () => {}),
  acceptPopup: vi.fn(async () => {}),
}));
vi.mock("../workspace/WorkspaceProvider", () => ({ useWorkspace: mocks.workspace }));
vi.mock("../lib/tauri/webPopups", () => ({ listenWebPopups: mocks.popup, listenWebWindowClose: vi.fn(async () => () => {}), acceptWebPopup: mocks.acceptPopup, rejectWebPopup: vi.fn(async () => {}) }));
vi.mock("../lib/tauri/web", () => ({ openWeb: mocks.open, closeWeb: mocks.close, syncWeb: vi.fn(async () => {}), webAction: vi.fn(async () => {}), listenWebPages: vi.fn(async () => () => {}), listenWebFocus: mocks.focus }));
vi.mock("./webModel", async importOriginal => ({ ...await importOriginal<typeof import("./webModel")>(), supportsWebBlocks: () => true }));
const profile: ConnectionProfile = { id: "profile", name: "Jump target", host: "target.internal", port: 22, username: "tester", authPreference: "manual", groupId: null };
const second = { ...profile, id: "second", name: "Second target", host: "second.internal" };
const workspace = { profiles: [profile, second], networkRuntimes: {}, dispatch: mocks.dispatch, disconnectNetworkBlock: mocks.disconnect, selectNetworkTarget: mocks.select };
beforeEach(() => { vi.clearAllMocks(); mocks.open.mockResolvedValue(); mocks.select.mockResolvedValue(); mocks.workspace.mockReturnValue(workspace); });
afterEach(cleanup);

it("hands webpage popup requests to a new same-target tab without replaying their URL", async () => {
  mocks.workspace.mockReturnValue({ ...workspace, networkRuntimes: { web: { status: "connected", sessionId: "ssh-web" } } });
  const view = render(<WebBlock workspaceId="workspace" node={{ type: "web", blockId: "web", profileId: profile.id }} visible active onClose={vi.fn()} onConnect={vi.fn()}/>);
  fireEvent.change(screen.getByRole("combobox", { name: "网页地址" }), { target: { value: "http://remote.internal" } });
  fireEvent.submit(screen.getByRole("combobox", { name: "网页地址" }).closest("form")!);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  const label = `web-${mocks.open.mock.calls[0][0]}`;
  act(() => mocks.popup.mock.calls[0][0]({ label, requestId: "native-request", url: "http://remote.internal/post", message: null }));
  await waitFor(() => expect(mocks.acceptPopup).toHaveBeenCalledWith(expect.any(String), "native-request"));
  expect(screen.getAllByRole("tab")).toHaveLength(2); expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.open).toHaveBeenCalledWith(expect.any(String), "ssh-web", profile.id, "http://remote.internal/");
  view.unmount();
});

it("waits for profile authentication, opens the remote address, then closes its guest on disconnect", async () => {
  const connect = vi.fn();
  const props = { workspaceId: "workspace", node: { type: "web" as const, blockId: "web", profileId: profile.id }, visible: true, active: true, onClose: vi.fn(), onConnect: connect };
  const view = render(<WebBlock {...props}/>);
  fireEvent.change(screen.getByRole("combobox", { name: "网页地址" }), { target: { value: "127.0.0.1:3000" } });
  fireEvent.submit(screen.getByRole("combobox", { name: "网页地址" }).closest("form")!);
  await waitFor(() => expect(connect).toHaveBeenCalledWith(profile));
  expect(mocks.open).not.toHaveBeenCalled();
  mocks.workspace.mockReturnValue({ ...workspace, networkRuntimes: { web: { status: "connected", sessionId: "ssh-web" } } });
  view.rerender(<WebBlock {...props}/>);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(expect.any(String), "ssh-web", profile.id, "http://127.0.0.1:3000/"));
  mocks.dispatch.mockClear();
  act(() => mocks.focus.mock.calls[0][0](`web-${mocks.open.mock.calls[0][0]}`));
  expect(mocks.dispatch).toHaveBeenCalledWith({ type: "selectBlock", workspaceId: "workspace", blockId: "web" });
  fireEvent.click(screen.getByRole("button", { name: /查看 Jump target 主机概要/ }));
  fireEvent.click(screen.getByRole("button", { name: "断开连接" }));
  expect(mocks.disconnect).toHaveBeenCalledWith("web");
  mocks.workspace.mockReturnValue(workspace);
  view.rerender(<WebBlock {...props}/>);
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
});

it("keeps an invalid address editable without starting authentication", async () => {
  const connect = vi.fn();
  render(<WebBlock workspaceId="workspace" node={{ type: "web", blockId: "web", profileId: profile.id }} visible active onClose={vi.fn()} onConnect={connect}/>);
  const input = screen.getByRole("combobox", { name: "网页地址" });
  fireEvent.change(input, { target: { value: "file:///secret" } });
  fireEvent.submit(screen.getByRole("combobox", { name: "网页地址" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("HTTP/HTTPS");
  expect(input).toHaveValue("file:///secret");
  expect(connect).not.toHaveBeenCalled();
});

async function choose(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /选择网页连接，当前/ }));
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索网页连接" }), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
}

it("shares the terminal header markup across connected, disconnected and narrow surfaces", () => {
  mocks.workspace.mockReturnValue({ ...workspace, networkRuntimes: { web: { status: "connected", sessionId: "ssh" } } });
  const view = render(<main style={{ padding: 16, display: "grid", gap: 16, background: "var(--canvas)", color: "var(--text)", fontFamily: "Segoe UI, sans-serif" }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, height: 260 }}>
      <section className="terminal-block"><header className="terminal-block-header"><TerminalTargetPicker profiles={[profile]} selectedProfileId={profile.id} status="connected" detail="tester@target.internal" onSelect={() => {}}/></header><pre style={{ padding: 12, fontSize: 11 }}>tester@target:~$</pre></section>
      <WebBlock workspaceId="workspace" node={{ type: "web", blockId: "web", profileId: profile.id }} visible active onClose={() => {}} onConnect={() => {}}/>
    </div>
    <div style={{ width: 280, height: 230 }}><WebBlock workspaceId="workspace" node={{ type: "web", blockId: "narrow", profileId: second.id }} visible active onClose={() => {}} onConnect={() => {}}/></div>
  </main>);
  expect(view.container.querySelectorAll(".terminal-block-header")).toHaveLength(3);
  expect(view.container.querySelectorAll(".terminal-target-trigger")).toHaveLength(3);
});

it("uses terminal chrome and discards the page before changing the SSH target", async () => {
  let finishSwitch!: () => void;
  mocks.select.mockImplementationOnce(() => new Promise<void>(resolve => { finishSwitch = resolve; }));
  mocks.workspace.mockReturnValue({ ...workspace, networkRuntimes: { web: { status: "connected", sessionId: "old-ssh" } } });
  const connect = vi.fn();
  const props = { workspaceId: "workspace", node: { type: "web" as const, blockId: "web", profileId: profile.id }, visible: true, active: true, onClose: vi.fn(), onConnect: connect };
  const view = render(<WebBlock {...props}/>);
  expect(view.container.querySelector("header")).toHaveClass("terminal-block-header");
  expect(view.container.querySelector(".terminal-target-trigger")).toHaveTextContent(profile.name);
  expect(view.container.querySelector(".block-actions")).toContainElement(screen.getByRole("button", { name: "关闭网页" }));
  fireEvent.change(screen.getByRole("combobox", { name: "网页地址" }), { target: { value: "http://old.internal" } });
  fireEvent.submit(screen.getByRole("combobox", { name: "网页地址" }).closest("form")!);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  await choose(second.name);
  expect(mocks.select).toHaveBeenCalledWith("workspace", "web", second.id);
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(screen.queryByRole("combobox", { name: "网页地址" })).not.toBeInTheDocument();
  mocks.workspace.mockReturnValue(workspace);
  view.rerender(<WebBlock {...props} node={{ ...props.node, profileId: second.id }}/>);
  await act(async () => { finishSwitch(); });
  expect(screen.getByRole("combobox", { name: "网页地址" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "后退" })).toBeDisabled();
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(connect).not.toHaveBeenCalled();
  await choose(second.name);
  expect(mocks.select).toHaveBeenCalledOnce();
});

it("closes a pending native creation after switching and never reopens it for the new profile", async () => {
  let finishOpen!: () => void;
  mocks.open.mockImplementationOnce(() => new Promise<void>(resolve => { finishOpen = resolve; }));
  mocks.workspace.mockReturnValue({ ...workspace, networkRuntimes: { web: { status: "connected", sessionId: "old-ssh" } } });
  const props = { workspaceId: "workspace", node: { type: "web" as const, blockId: "web", profileId: profile.id }, visible: true, active: true, onClose: vi.fn(), onConnect: vi.fn() };
  const view = render(<WebBlock {...props}/>);
  fireEvent.change(screen.getByRole("combobox", { name: "网页地址" }), { target: { value: "http://old.internal" } });
  fireEvent.submit(screen.getByRole("combobox", { name: "网页地址" }).closest("form")!);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  await choose(second.name);
  mocks.workspace.mockReturnValue(workspace);
  view.rerender(<WebBlock {...props} node={{ ...props.node, profileId: second.id }}/>);
  await act(async () => { finishOpen(); });
  await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(mocks.open.mock.calls[0][0]));
  expect(screen.getByRole("combobox", { name: "网页地址" })).toHaveValue("");
  expect(mocks.open).toHaveBeenCalledOnce();
});

it("offers Local and opens it without authentication, while missing remote profiles stay unavailable", async () => {
  const connect = vi.fn();
  const props = { workspaceId: "workspace", node: { type: "web" as const, blockId: "web", profileId: null as string | null }, visible: true, active: true, onClose: vi.fn(), onConnect: connect };
  const view = render(<WebBlock {...props}/>);
  expect(screen.getByText(/localhost 指向当前电脑/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /选择网页连接/ }));
  fireEvent.click(screen.getByRole("button", { name: /本地\s*使用本机网络/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "网页地址" }), { target: { value: "http://localhost:3000" } });
  fireEvent.submit(screen.getByRole("combobox", { name: "网页地址" }).closest("form")!);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(expect.any(String), null, null, "http://localhost:3000/"));
  expect(connect).not.toHaveBeenCalled();
  view.rerender(<WebBlock {...props} node={{ ...props.node, profileId: "missing" }}/>);
  expect(screen.getByRole("combobox", { name: "网页地址" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /选择网页连接/ })).toHaveTextContent("连接已失效");
  expect(mocks.open).toHaveBeenCalledOnce();
});

it("can switch a remote block to Local through the shared target teardown", async () => {
  render(<WebBlock workspaceId="workspace" node={{ type: "web", blockId: "web", profileId: profile.id }} visible active onClose={vi.fn()} onConnect={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: /选择网页连接/ }));
  fireEvent.click(screen.getByRole("button", { name: /本地\s*使用本机网络/ }));
  await waitFor(() => expect(mocks.select).toHaveBeenCalledWith("workspace", "web", null));
});
