import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkForUpdate, openLatestReleasePage } from "./updateCheck";

const mocks = vi.hoisted(() => ({ getVersion: vi.fn(), openUrl: vi.fn() }));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));

function release(tagName: string): Response {
  return new Response(JSON.stringify({ tag_name: tagName, draft: false, prerelease: false, published_at: "2026-08-20T05:37:55Z" }), { status: 200 });
}

beforeEach(() => {
  mocks.getVersion.mockReset().mockResolvedValue("0.1.1");
  mocks.openUrl.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(release("v0.1.1")));
});

describe("checkForUpdate", () => {
  it("reports the installed release as current", async () => {
    await expect(checkForUpdate()).resolves.toEqual({ status: "latest", currentVersion: "0.1.1" });
  });

  it("compares numeric version segments instead of strings", async () => {
    mocks.getVersion.mockResolvedValue("0.1.9");
    vi.mocked(fetch).mockResolvedValue(release("v0.1.12"));

    await expect(checkForUpdate()).resolves.toEqual({
      status: "available",
      currentVersion: "0.1.9",
      latestVersion: "0.1.12",
      publishedAt: "2026-08-20T05:37:55Z",
    });
  });

  it("rejects malformed release tags instead of claiming the app is current", async () => {
    vi.mocked(fetch).mockResolvedValue(release("release-next"));

    await expect(checkForUpdate()).rejects.toMatchObject({ kind: "invalidResponse" });
  });

  it("distinguishes rate limiting from ordinary network failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 403 }));
    await expect(checkForUpdate()).rejects.toMatchObject({ kind: "rateLimited" });

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await expect(checkForUpdate()).rejects.toMatchObject({ kind: "offline" });
  });
});

describe("openLatestReleasePage", () => {
  it("opens only the fixed Qterm latest release URL in Tauri", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    await openLatestReleasePage();

    expect(mocks.openUrl).toHaveBeenCalledWith("https://github.com/qiubai-lab/Qterm/releases/latest");
  });
});
