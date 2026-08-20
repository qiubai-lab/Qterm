import { describe, expect, it } from "vitest";

import { resolveConfiguredAuth } from "./configuredAuth";

const base = { id: "profile-1", name: "Server", host: "host", port: 22, username: "dev", credentialId: null, groupId: null };

describe("resolveConfiguredAuth", () => {
  it("uses SSH Agent without a stored secret", async () => {
    await expect(resolveConfiguredAuth({ ...base, authPreference: "sshAgent" })).resolves.toEqual({ method: "sshAgent" });
  });

  it("passes a reusable credential reference to the Rust connection boundary", async () => {
    await expect(resolveConfiguredAuth({ ...base, authPreference: "privateKey", credentialId: "credential-1" })).resolves.toEqual({ method: "storedCredential", credentialId: "credential-1" });
    await expect(resolveConfiguredAuth({ ...base, authPreference: "password", credentialId: "credential-2" })).resolves.toEqual({ method: "storedCredential", credentialId: "credential-2" });
  });

  it("falls back to manual authentication when no credential is referenced", async () => {
    await expect(resolveConfiguredAuth({ ...base, authPreference: "password" })).resolves.toBeNull();
    await expect(resolveConfiguredAuth({ ...base, authPreference: "manual", credentialId: "must-not-be-used" })).resolves.toBeNull();
  });
});
