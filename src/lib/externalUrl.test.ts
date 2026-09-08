import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));

import { isExternalHttpUrl, openExternalHttpUrl } from "./externalUrl";

beforeEach(() => {
  mocks.openUrl.mockReset().mockResolvedValue(undefined);
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

afterEach(() => vi.restoreAllMocks());

describe("external URL policy", () => {
  it.each([
    "https://example.com/docs",
    "http://127.0.0.1:8080/path?query=yes#section",
  ])("accepts an absolute web URL: %s", (url) => {
    expect(isExternalHttpUrl(url)).toBe(true);
  });

  it.each([
    "./README.md",
    "example.com/docs",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ssh://example.com",
    "https://",
  ])("rejects a non-web or malformed target: %s", (url) => {
    expect(isExternalHttpUrl(url)).toBe(false);
  });

  it("uses the Tauri opener for a valid web URL", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });

    await expect(openExternalHttpUrl("https://example.com/docs")).resolves.toBe(true);
    expect(mocks.openUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/docs");
  });

  it("rejects an invalid target without invoking either opener backend", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    await expect(openExternalHttpUrl("file:///etc/passwd")).resolves.toBe(false);
    expect(mocks.openUrl).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
