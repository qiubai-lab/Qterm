import type { IconName } from "../../components/Icon";
import type { AccessEvent } from "./model";

interface ClientInfo { label: string; detail: string; icon: IconName }
const platforms: Record<string, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };
const architectures: Record<string, string> = { aarch64: "arm64", x86_64: "x64", x86: "x86" };

/** Reported metadata only; never an authentication or device identity. */
export function clientInfo(event: Pick<AccessEvent, "source" | "kind" | "reason">): ClientInfo {
  const agent = event.source.browser?.trim();
  if (!agent) {
    const system = event.kind === "vaultLock" && event.reason === "timeout";
    return system
      ? { label: "系统", detail: "凭证库自动锁定", icon: "server" }
      : { label: "未知客户端", detail: "未提供客户端信息", icon: "help" };
  }
  const desktop = /^Qterm Desktop\/([^\s()]+)(?: \(([^;()]+); ([^()]+)\))?/.exec(agent);
  if (desktop) {
    const [, version, os, arch] = desktop;
    const metadata = [platforms[os] ?? os, architectures[arch] ?? arch, `版本 ${version}`].filter(Boolean);
    return { label: "Qterm 桌面端", detail: metadata.join(" · "), icon: "computer" };
  }
  const browser = [
    ["Edge", /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ["Opera", /(?:OPR|OPiOS)\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari\//],
  ] as const;
  for (const [label, pattern] of browser) {
    const match = pattern.exec(agent);
    if (!match) continue;
    const os = /iPhone|iPad|iPod/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android"
      : /Windows/.test(agent) ? "Windows" : /Macintosh|Mac OS X/.test(agent) ? "macOS"
      : /Linux/.test(agent) ? "Linux" : null;
    return { label, detail: [os, `版本 ${match[1]}`].filter(Boolean).join(" · "), icon: "browser" };
  }
  return { label: "其他客户端", detail: agent, icon: "help" };
}
