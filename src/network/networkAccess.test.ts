import { describe, expect, it } from "vitest";

import type { NetworkRule } from "../lib/tauri/network";
import { deriveNetworkAccess } from "./networkAccess";

const profileHost = "server.example.com";

describe("deriveNetworkAccess", () => {
  it("describes local listeners and server-side targets", () => {
    const rule: NetworkRule = {
      id: "local-1",
      profileId: "profile-1",
      name: "Web",
      type: "local",
      bindHost: "0.0.0.0",
      bindPort: 8080,
      targetHost: "2001:db8::20",
      targetPort: 80,
      exposed: true,
    };

    expect(deriveNetworkAccess(rule, profileHost)).toEqual({
      fields: [
        { label: "本地访问地址", value: "127.0.0.1:8080" },
        { label: "服务器目标地址", value: "[2001:db8::20]:80" },
      ],
      warning: "监听配置为 0.0.0.0；复制时使用本机回环地址，局域网设备仍可能通过本机实际地址访问。",
    });
  });

  it("uses the SSH profile host as a qualified suggestion for wildcard remote listeners", () => {
    const rule: NetworkRule = {
      id: "remote-1",
      profileId: "profile-1",
      name: "Remote app",
      type: "remote",
      bindHost: "::",
      bindPort: 9000,
      targetHost: "localhost",
      targetPort: 3000,
      exposed: true,
    };

    expect(deriveNetworkAccess(rule, "2001:db8::10")).toEqual({
      fields: [
        { label: "服务器访问地址", value: "[2001:db8::10]:9000" },
        { label: "本地目标地址", value: "localhost:3000" },
      ],
      warning: "服务器实际可访问性取决于 SSH GatewayPorts、监听网卡和防火墙配置。",
    });
  });

  it("preserves server loopback semantics for remote forwarding", () => {
    const rule: NetworkRule = {
      id: "remote-2",
      profileId: "profile-1",
      name: "Loopback",
      type: "remote",
      bindHost: "127.0.0.1",
      bindPort: 9001,
      targetHost: "127.0.0.1",
      targetPort: 3001,
      exposed: false,
    };

    expect(deriveNetworkAccess(rule, profileHost)).toEqual({
      fields: [
        { label: "服务器访问地址", value: "127.0.0.1:9001" },
        { label: "本地目标地址", value: "127.0.0.1:3001" },
      ],
      warning: "该地址仅能从服务器本机访问。",
    });
  });

  it("formats a browser-ready SOCKS5 connection string", () => {
    const rule: NetworkRule = {
      id: "socks-1",
      profileId: "profile-1",
      name: "Proxy",
      type: "socks5",
      bindHost: "::",
      bindPort: 1080,
      exposed: true,
    };

    expect(deriveNetworkAccess(rule, profileHost)).toEqual({
      fields: [{ label: "SOCKS5 连接地址", value: "socks5://[::1]:1080" }],
      warning: "监听配置为 ::；复制时使用本机回环地址，局域网设备仍可能通过本机实际地址访问。",
      socksEndpoint: { host: "::1", port: 1080 },
    });
  });
});

