import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { clearUnsupportedProfileStorage, deleteProfile, getProfileRouteRequirements, importSshConfig, listJumpCandidates, previewSshConfigImport } from "./profiles";

describe("profile SSH Config IPC client", () => {
  beforeEach(() => invoke.mockReset());

  it("opens the native SSH Config picker without sending a path from the WebView", async () => {
    invoke.mockResolvedValue({ previewId: "preview-1", sourceName: "config", candidates: [], warnings: [] });
    await previewSshConfigImport();
    expect(invoke).toHaveBeenCalledWith("profile_import_ssh_config_preview");
  });

  it("commits aliases and optional passphrases without accepting a private key path", async () => {
    invoke.mockResolvedValue({ imported: 1, importedPrivateKeys: 1, reusedPrivateKeys: 0 });
    await importSshConfig("preview-1", [{ alias: "prod", identityFileIndex: 0, passphrase: "key-secret" }]);
    expect(invoke).toHaveBeenCalledWith("profile_import_ssh_config_commit", {
      input: {
        previewId: "preview-1",
        items: [{ alias: "prod", identityFileIndex: 0, passphrase: "key-secret" }],
      },
    });
  });

  it("returns the number of network rules removed with a deleted profile", async () => {
    invoke.mockResolvedValue({ deletedNetworkRules: 4 });
    await expect(deleteProfile("profile-1")).resolves.toEqual({ deletedNetworkRules: 4 });
    expect(invoke).toHaveBeenCalledWith("profile_delete", { id: "profile-1" });
  });

  it("queries jump candidates and route requirements using only profile identifiers", async () => {
    invoke.mockResolvedValueOnce([]).mockResolvedValueOnce({ usesCredential: true, routeNames: ["Gateway", "Production"] });
    await listJumpCandidates("profile-1");
    expect(invoke).toHaveBeenNthCalledWith(1, "profile_jump_candidates", { currentProfileId: "profile-1", selectedProfileIds: [] });
    await getProfileRouteRequirements("profile-1");
    expect(invoke).toHaveBeenNthCalledWith(2, "profile_route_requirements", { profileId: "profile-1" });
  });

  it("clears unsupported portable connection and network storage without accepting paths", async () => {
    invoke.mockResolvedValue(undefined);
    await clearUnsupportedProfileStorage();
    expect(invoke).toHaveBeenCalledWith("profile_clear_unsupported_storage");
  });
});
