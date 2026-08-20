import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { SessionAuth } from "../lib/tauri/sessions";

export async function resolveConfiguredAuth(profile: ConnectionProfile): Promise<SessionAuth | null> {
  if (profile.authPreference === "manual") return null;
  if (profile.authPreference === "sshAgent") return { method: "sshAgent" };
  return profile.credentialId ? { method: "storedCredential", credentialId: profile.credentialId } : null;
}
