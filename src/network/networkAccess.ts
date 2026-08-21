import type { NetworkRule } from "../lib/tauri/network";

export type NetworkAccessField = {
  label: string;
  value: string;
};

export type NetworkAccessDetails = {
  description?: string;
  fields: NetworkAccessField[];
  warning?: string;
  socksEndpoint?: { host: string; port: number };
};

export function deriveNetworkAccess(rule: NetworkRule, profileHost: string): NetworkAccessDetails {
  if (rule.type === "remote") {
    const wildcard = isWildcardHost(rule.bindHost);
    const serverHost = wildcard ? profileHost : rule.bindHost;
    return {
      description: `远程访问下面的远程地址，Qterm 会自动转发到本地的 ${formatEndpoint(rule.targetHost, rule.targetPort)}`,
      fields: [{ label: "远程可访问地址", value: formatEndpoint(serverHost, rule.bindPort) }],
      warning: wildcard
        ? "服务器实际可访问性取决于 SSH GatewayPorts、监听网卡和防火墙配置。"
        : isLoopbackHost(rule.bindHost) ? "该地址仅能从服务器本机访问。" : undefined,
    };
  }

  const localHost = clientHostForListener(rule.bindHost);
  const wildcardWarning = isWildcardHost(rule.bindHost)
    ? `监听配置为 ${rule.bindHost}；复制时使用本机回环地址，局域网设备仍可能通过本机实际地址访问。`
    : undefined;

  if (rule.type === "socks5") {
    return {
      fields: [{ label: "SOCKS5 连接地址", value: `socks5://${formatEndpoint(localHost, rule.bindPort)}` }],
      warning: wildcardWarning,
      socksEndpoint: { host: localHost, port: rule.bindPort },
    };
  }

  return {
    description: `本地访问下面的本地地址，Qterm 会自动转发到服务器的 ${formatEndpoint(rule.targetHost, rule.targetPort)}`,
    fields: [{ label: "本地可访问地址", value: formatEndpoint(localHost, rule.bindPort) }],
    warning: wildcardWarning,
  };
}

export function formatEndpoint(host: string, port: number): string {
  const normalized = unbracket(host.trim());
  return normalized.includes(":") ? `[${normalized}]:${port}` : `${normalized}:${port}`;
}

function clientHostForListener(host: string): string {
  if (host === "0.0.0.0") return "127.0.0.1";
  if (host === "::") return "::1";
  return unbracket(host);
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function isLoopbackHost(host: string): boolean {
  const normalized = unbracket(host).toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

function unbracket(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}
