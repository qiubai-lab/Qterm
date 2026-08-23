import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(),
  listBrowsers: vi.fn(),
  launchBrowser: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeText }));
vi.mock("../lib/tauri/browserProxy", () => ({
  listProxyBrowsers: mocks.listBrowsers,
  launchProxyBrowser: mocks.launchBrowser,
}));

import type { NetworkRule } from "../lib/tauri/network";
import { NetworkAccessDialog } from "./NetworkAccessDialog";

const localRule: NetworkRule = {
  id: "local-1",
  profileId: "profile-1",
  name: "Web tunnel",
  type: "local",
  bindHost: "127.0.0.1",
  bindPort: 8080,
  targetHost: "localhost",
  targetPort: 80,
  exposed: false,
};

const socksRule: NetworkRule = {
  id: "socks-1",
  profileId: "profile-1",
  name: "Private proxy",
  type: "socks5",
  bindHost: "127.0.0.1",
  bindPort: 1080,
  exposed: false,
};

describe("NetworkAccessDialog", () => {
  beforeEach(() => {
    mocks.writeText.mockReset().mockResolvedValue(undefined);
    mocks.listBrowsers.mockReset().mockResolvedValue([
      { id: "chrome", name: "Google Chrome", installed: true, supported: true },
      { id: "edge", name: "Microsoft Edge", installed: false, supported: true },
    ]);
    mocks.launchBrowser.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("keeps access values selectable and copies each endpoint with stable feedback", async () => {
    const user = userEvent.setup();
    render(<NetworkAccessDialog rule={localRule} profileHost="server.example.com" runtimeState="stopped" activeElsewhere={false} onClose={vi.fn()}/>);

    expect(screen.getByRole("dialog", { name: "访问 Web tunnel" })).toBeInTheDocument();
    const description = screen.getByText("本地访问下面的本地地址，Qterm 会自动转发到服务器的 localhost:80").closest(".network-access-description");
    expect(description).toBeInTheDocument();
    expect(description?.querySelector('[data-icon="computer"]')).toBeInTheDocument();
    expect(screen.getByLabelText("本地可访问地址")).toHaveValue("127.0.0.1:8080");
    expect(screen.getByLabelText("本地可访问地址")).toHaveAttribute("readonly");
    expect(screen.queryByLabelText("服务器目标地址")).not.toBeInTheDocument();
    expect(document.querySelector(".network-access-footer-status")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "复制本地可访问地址" }));
    expect(mocks.writeText).toHaveBeenCalledWith("127.0.0.1:8080");
    expect(await screen.findByText("本地可访问地址已复制")).toBeInTheDocument();
  });

  it("uses remote wording and a server icon for remote forwarding", () => {
    const remoteRule: NetworkRule = { ...localRule, id: "remote-1", type: "remote", bindHost: "0.0.0.0", bindPort: 9000, targetHost: "localhost", targetPort: 3000, exposed: true };
    render(<NetworkAccessDialog rule={remoteRule} profileHost="server.example.com" runtimeState="stopped" activeElsewhere={false} onClose={vi.fn()}/>);

    const description = screen.getByText("远程访问下面的远程地址，Qterm 会自动转发到本地的 localhost:3000").closest(".network-access-description");
    expect(description?.querySelector('[data-icon="server"]')).toBeInTheDocument();
    expect(screen.getByLabelText("远程可访问地址")).toHaveValue("server.example.com:9000");
  });

  it("shows only Chrome and Edge and launches an installed browser for an active SOCKS rule", async () => {
    const user = userEvent.setup();
    render(<NetworkAccessDialog rule={socksRule} profileHost="server.example.com" runtimeState="running" activeElsewhere={false} onClose={vi.fn()}/>);

    expect(screen.getByText("实验性")).toHaveClass("ui-status-badge--tag", "ui-status-badge--warning");
    expect(screen.getByText(/不保证扩展或 WebRTC 流量/)).toBeInTheDocument();
    expect(screen.getByLabelText("SOCKS5 连接地址")).toHaveValue("socks5://127.0.0.1:1080");
    expect(screen.getByRole("switch", { name: "代理本地与内网地址" })).toBeChecked();
    expect(screen.getByText(/localhost 将指向远程服务器环境/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "使用 Google Chrome 打开" })).toHaveAttribute("data-state", "ready");
    expect(screen.getByRole("button", { name: "Microsoft Edge 未安装" })).toHaveAttribute("data-state", "unavailable");
    expect(screen.queryByText(/Firefox/i)).not.toBeInTheDocument();

    const browserNote = screen.getByText("仅新启动的独立窗口使用此代理；停止 SOCKS5 后浏览器可能无法继续访问网络。").closest(".network-access-footer-note");
    if (!browserNote) throw new Error("browser note container is missing");
    const footer = browserNote.closest(".network-access-footer");
    expect(footer).not.toHaveClass("has-message");

    await user.click(screen.getByRole("button", { name: "使用 Google Chrome 打开" }));
    expect(mocks.launchBrowser).toHaveBeenCalledWith("socks-1", "chrome", true);
    expect(await screen.findByText("已启动 Google Chrome 独立代理窗口")).toBeInTheDocument();
    expect(footer).toHaveClass("has-message");
    expect(browserNote).toHaveAttribute("aria-hidden", "true");
  });

  it("lets users keep Chromium loopback bypasses for a single browser launch", async () => {
    const user = userEvent.setup();
    render(<NetworkAccessDialog rule={socksRule} profileHost="server.example.com" runtimeState="running" activeElsewhere={false} onClose={vi.fn()}/>);

    const localNetworkSwitch = screen.getByRole("switch", { name: "代理本地与内网地址" });
    expect(localNetworkSwitch.tagName).toBe("BUTTON");
    expect(localNetworkSwitch).toHaveAttribute("aria-checked", "true");
    await user.click(localNetworkSwitch);
    expect(localNetworkSwitch).not.toBeChecked();
    expect(localNetworkSwitch).toHaveAttribute("aria-checked", "false");
    await user.click(await screen.findByRole("button", { name: "使用 Google Chrome 打开" }));

    expect(mocks.launchBrowser).toHaveBeenCalledWith("socks-1", "chrome", false);
  });

  it("keeps browser actions disabled while the SOCKS listener is stopped", async () => {
    render(<NetworkAccessDialog rule={socksRule} profileHost="server.example.com" runtimeState="stopped" activeElsewhere={false} onClose={vi.fn()}/>);

    const group = await screen.findByRole("group", { name: "代理浏览器" });
    const waitingBrowser = within(group).getByRole("button", { name: "请先启动 Private proxy 后使用 Google Chrome" });
    expect(waitingBrowser).toBeDisabled();
    expect(waitingBrowser).toHaveAttribute("data-state", "waiting");
    expect(within(group).getByRole("button", { name: "Microsoft Edge 未安装" })).toHaveAttribute("data-state", "unavailable");
    expect(screen.getByText("请先启动 SOCKS5 实例，再打开代理浏览器。" )).toBeInTheDocument();
  });

  it("reports clipboard failures without closing the dialog", async () => {
    const user = userEvent.setup();
    mocks.writeText.mockRejectedValue(new Error("clipboard unavailable"));
    render(<NetworkAccessDialog rule={localRule} profileHost="server.example.com" runtimeState="stopped" activeElsewhere={false} onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "复制本地可访问地址" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("复制失败，请手动选择地址复制");
    await waitFor(() => expect(screen.getByRole("dialog", { name: "访问 Web tunnel" })).toBeInTheDocument());
  });
});
