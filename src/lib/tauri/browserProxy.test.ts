import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { launchProxyBrowser, listProxyBrowsers } from "./browserProxy";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("browser proxy IPC adapter", () => {
  beforeEach(() => vi.mocked(invoke).mockReset().mockResolvedValue(undefined));

  it("uses fixed browser commands and a boolean local-address choice", async () => {
    await listProxyBrowsers();
    expect(invoke).toHaveBeenLastCalledWith("browser_proxy_list");

    await launchProxyBrowser("rule-1", "chrome", true);
    expect(invoke).toHaveBeenLastCalledWith("browser_proxy_launch", {
      input: { ruleId: "rule-1", browser: "chrome", proxyLocalAddresses: true },
    });
  });
});
