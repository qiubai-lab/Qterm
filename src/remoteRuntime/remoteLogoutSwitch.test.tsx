import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServerApp } from "../server/ServerApp";
import { EnvironmentControl } from "./EnvironmentControl";

const native = vi.hoisted(() => ({ logout: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), select: vi.fn(), expireEarly: true }));
vi.mock("./transport", () => ({ disconnectRuntime: native.disconnect, connectRuntime: native.connect }));
vi.mock("./selection", () => ({
  selectedRuntime: { id: "old", name: "当前服务器", endpoint: "https://old.example" },
  listServers: () => [{ id: "next", name: "下一台服务器", endpoint: "https://next.example" }],
  selectRuntime: native.select, saveServers: vi.fn(),
}));
vi.mock("./switchGuard", () => ({ flushRuntime: async () => {}, detachRuntime: async () => {} }));
vi.mock("../server/ServerWorkbench", () => ({ ServerWorkbench: () => <main>远程工作台</main> }));
vi.mock("../server/useServerAccess", () => ({ useServerAccess: () => {
  const [phase, setPhase] = useState("workspace");
  return { phase, busy: false, error: "", logout: async () => {
    // Presence/auth events can render the login screen before logout IPC settles.
    if (native.expireEarly) setPhase("login");
    await native.logout();
    setPhase("login");
  } };
} }));

afterEach(() => { cleanup(); vi.resetAllMocks(); native.expireEarly = true; });

function renderRemote() {
  render(<ServerApp renderChrome={access => <EnvironmentControl status={access.phase === "workspace" ? "已连接" : "需要登录"} onLogout={access.phase === "workspace" ? access.logout : undefined}/>}/>);
  fireEvent.click(screen.getByRole("button", { name: /运行环境/ }));
}

it.each(["local", "remote"])("finishes switching to %s when logout changes the authentication tree", async target => {
  let finishLogout!: () => void;
  native.logout.mockImplementation(() => new Promise<void>(resolve => { finishLogout = resolve; }));
  renderRemote();
  fireEvent.click(screen.getByRole("menuitem", { name: target === "local" ? "切换到本机" : /下一台服务器/ }));
  fireEvent.click(screen.getByRole("button", { name: target === "local" ? "返回本机" : "连接" }));
  try {
    await screen.findByLabelText("访问密码");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在退出当前服务器");
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
    await act(async () => { finishLogout(); });
    await waitFor(() => expect(native.select).toHaveBeenCalledOnce());
    if (target === "local") {
      expect(native.disconnect).toHaveBeenCalledOnce();
      expect(native.select).toHaveBeenCalledWith(null);
      expect(native.connect).not.toHaveBeenCalled();
    } else {
      expect(native.connect).toHaveBeenCalledWith("https://next.example");
      expect(native.select).toHaveBeenCalledWith(expect.objectContaining({ id: "next" }));
    }
  } finally { await act(async () => { finishLogout?.(); }); }
});

it("still lets the user cancel after logout has rendered the login screen", async () => {
  let finishLogout!: () => void;
  native.logout.mockImplementation(() => new Promise<void>(resolve => { finishLogout = resolve; }));
  renderRemote();
  fireEvent.click(screen.getByRole("menuitem", { name: "切换到本机" }));
  fireEvent.click(screen.getByRole("button", { name: "返回本机" }));
  try {
    await screen.findByLabelText("访问密码");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await act(async () => { finishLogout(); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(native.disconnect).not.toHaveBeenCalled();
    expect(native.select).not.toHaveBeenCalled();
  } finally { await act(async () => { finishLogout?.(); }); }
});

it("returns locally after normal logout while native disconnect is still pending", async () => {
  native.expireEarly = false;
  native.logout.mockResolvedValue(undefined);
  let finishDisconnect!: () => void;
  native.disconnect.mockImplementation(() => new Promise<void>(resolve => { finishDisconnect = resolve; }));
  renderRemote();
  fireEvent.click(screen.getByRole("menuitem", { name: "切换到本机" }));
  fireEvent.click(screen.getByRole("button", { name: "返回本机" }));
  try {
    await screen.findByLabelText("访问密码");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在断开服务器");
    expect(native.select).not.toHaveBeenCalled();
    await act(async () => { finishDisconnect(); });
    expect(native.select).toHaveBeenCalledExactlyOnceWith(null);
  } finally { await act(async () => { finishDisconnect?.(); }); }
});
