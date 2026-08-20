import type { NetworkRuleInput } from "../lib/tauri/network";

export type NetworkRuleType = NetworkRuleInput["type"];

export type NetworkRuleTypeEndpoint = {
  label: string;
  icon: "computer" | "server";
};

export const NETWORK_RULE_TYPE_OPTIONS: Array<{ type: NetworkRuleType; badge: string; title: string; direction: string; preview: [NetworkRuleTypeEndpoint, NetworkRuleTypeEndpoint]; description: string }> = [
  {
    type: "socks5",
    badge: "SOCKS5",
    title: "SOCKS5 动态代理",
    direction: "本地 SOCKS5 → 服务器网络",
    preview: [
      { label: "本地", icon: "computer" },
      { label: "服务器网络", icon: "server" },
    ],
    description: "在本地启动 SOCKS5 代理。浏览器或应用连接后，会通过服务器访问网站或内网服务。",
  },
  {
    type: "local",
    badge: "LOCAL",
    title: "本地端口转发",
    direction: "本地端口 → 远端目标",
    preview: [
      { label: "本地", icon: "computer" },
      { label: "服务器", icon: "server" },
    ],
    description: "在本地开放端口。连接后，流量会通过服务器转发到服务器能够访问的目标服务。",
  },
  {
    type: "remote",
    badge: "REMOTE",
    title: "远程端口转发",
    direction: "服务器端口 → 本地目标",
    preview: [
      { label: "服务器", icon: "server" },
      { label: "本地", icon: "computer" },
    ],
    description: "在服务器开放端口。连接后，流量会通过 SSH 转发到本地能够访问的目标服务。",
  },
];

export function networkRuleTypeLabel(type: NetworkRuleType): string {
  return NETWORK_RULE_TYPE_OPTIONS.find((option) => option.type === type)?.title ?? type;
}

export function networkRuleTypeDirection(type: NetworkRuleType): string {
  return NETWORK_RULE_TYPE_OPTIONS.find((option) => option.type === type)?.direction ?? type;
}
