import { invoke } from "@tauri-apps/api/core";

export type ProxyBrowserId = "chrome" | "edge";

export type ProxyBrowserAvailability = {
  id: ProxyBrowserId;
  name: string;
  installed: boolean;
  supported: boolean;
};

export function listProxyBrowsers(): Promise<ProxyBrowserAvailability[]> {
  return invoke<ProxyBrowserAvailability[]>("browser_proxy_list");
}

export function launchProxyBrowser(ruleId: string, browser: ProxyBrowserId, proxyLocalAddresses: boolean): Promise<void> {
  return invoke<void>("browser_proxy_launch", { input: { ruleId, browser, proxyLocalAddresses } });
}
