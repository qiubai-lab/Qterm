import type { NetworkRule } from "../lib/tauri/network";

export function createDemoNetworkRules(): NetworkRule[] {
  const base = { profileId: "demo-development", bindHost: "127.0.0.1", exposed: false };
  return [
    { ...base, id: "demo-network-web", type: "local", name: "Web 开发服务", bindPort: 3000, targetHost: "127.0.0.1", targetPort: 3000 },
    { ...base, id: "demo-network-preview", type: "remote", name: "远程预览", bindPort: 8080, targetHost: "127.0.0.1", targetPort: 5173 },
    { ...base, id: "demo-network-proxy", type: "socks5", name: "开发代理", bindPort: 1080 },
  ];
}
